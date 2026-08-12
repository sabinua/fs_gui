// Package session ties one connection profile to a live ESL connection
// (optionally through SSH), owns its reconnect loop, and fans events out
// to the UI and to plugins. One Session per open tab.
package session

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"fsgui/internal/esl"
	"fsgui/internal/sshtunnel"
	"fsgui/internal/store"
)

type State string

const (
	StateConnecting   State = "connecting"
	StateOnline       State = "online"
	StateReconnecting State = "reconnecting"
	StateOffline      State = "offline"
)

// StatusEvent is pushed to the UI whenever a session changes state.
type StatusEvent struct {
	ConnID string `json:"connId"`
	State  State  `json:"state"`
	Error  string `json:"error,omitempty"`
}

// EventSink receives session lifecycle and FreeSWITCH events for the UI.
type EventSink interface {
	SessionStatus(StatusEvent)
	FSEvent(connID string, ev *esl.Event)
}

// baseEvents is what every session subscribes to from the start: enough to
// track calls live and collect CDRs. The raw event monitor widens this later.
var baseEvents = []string{
	"CHANNEL_CREATE", "CHANNEL_ANSWER", "CHANNEL_BRIDGE", "CHANNEL_UNBRIDGE",
	"CHANNEL_HANGUP_COMPLETE", "CHANNEL_EXECUTE", "CHANNEL_EXECUTE_COMPLETE",
	"RECORD_START", "RECORD_STOP", "BACKGROUND_JOB", "HEARTBEAT",
}

type Session struct {
	ConnID  string
	Profile store.Profile

	sink EventSink

	mu         sync.Mutex
	state      State
	client     *esl.Client
	tunnel     *sshtunnel.Tunnel
	monitorAll bool // firehose mode; re-applied after reconnect

	cancel context.CancelFunc
	done   chan struct{}
}

func newSession(profile store.Profile, sink EventSink) *Session {
	return &Session{
		ConnID:  profile.ID,
		Profile: profile,
		sink:    sink,
		state:   StateConnecting,
		done:    make(chan struct{}),
	}
}

func (s *Session) setState(st State, err error) {
	s.mu.Lock()
	s.state = st
	s.mu.Unlock()
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	s.sink.SessionStatus(StatusEvent{ConnID: s.ConnID, State: st, Error: msg})
}

func (s *Session) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// run owns the connect/reconnect loop until ctx is cancelled.
func (s *Session) run(ctx context.Context) {
	defer close(s.done)
	defer s.setState(StateOffline, nil)

	backoff := time.Second
	for {
		client, tunnel, err := s.connectOnce(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			s.setState(StateReconnecting, err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second

		s.mu.Lock()
		s.client, s.tunnel = client, tunnel
		s.mu.Unlock()
		s.setState(StateOnline, nil)

		// Pump events until the connection dies or we are told to stop.
		s.pump(ctx, client)

		s.mu.Lock()
		s.client, s.tunnel = nil, nil
		s.mu.Unlock()
		if tunnel != nil {
			tunnel.Close()
		}
		if ctx.Err() != nil {
			return
		}
		s.setState(StateReconnecting, client.Err())
	}
}

func (s *Session) pump(ctx context.Context, client *esl.Client) {
	for {
		select {
		case <-ctx.Done():
			client.Close()
			// drain until closed
			for range client.Events() {
			}
			return
		case ev, ok := <-client.Events():
			if !ok {
				return
			}
			s.sink.FSEvent(s.ConnID, ev)
		}
	}
}

func (s *Session) connectOnce(ctx context.Context) (*esl.Client, *sshtunnel.Tunnel, error) {
	p := s.Profile
	eslAddr := net.JoinHostPort(p.ESLHost, fmt.Sprint(p.ESLPort))

	eslPassword, err := store.GetSecret(p.ID, store.SecretESLPassword)
	if err != nil {
		return nil, nil, fmt.Errorf("keychain: %w", err)
	}

	dialCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	var client *esl.Client
	var tunnel *sshtunnel.Tunnel

	if p.UseSSH {
		cfg := sshtunnel.Config{
			Host: net.JoinHostPort(p.SSHHost, fmt.Sprint(p.SSHPort)),
			User: p.SSHUser,
		}
		switch p.SSHAuth {
		case "password":
			cfg.Password, err = store.GetSecret(p.ID, store.SecretSSHPassword)
		case "key":
			cfg.PrivateKeyPath = p.SSHKeyPath
			cfg.KeyPassphrase, err = store.GetSecret(p.ID, store.SecretSSHPassphrase)
		case "agent":
			cfg.UseAgent = true
		}
		if err != nil {
			return nil, nil, fmt.Errorf("keychain: %w", err)
		}
		tunnel, err = sshtunnel.Open(dialCtx, cfg)
		if err != nil {
			return nil, nil, err
		}
		conn, err := tunnel.Dial(dialCtx, eslAddr)
		if err != nil {
			tunnel.Close()
			return nil, nil, fmt.Errorf("dial %s via ssh: %w", eslAddr, err)
		}
		client, err = esl.NewClient(dialCtx, conn, eslPassword)
		if err != nil {
			tunnel.Close()
			return nil, nil, err
		}
	} else {
		client, err = esl.Dial(dialCtx, eslAddr, eslPassword)
		if err != nil {
			return nil, nil, err
		}
	}

	s.mu.Lock()
	monitorAll := s.monitorAll
	s.mu.Unlock()
	subscription := baseEvents
	if monitorAll {
		subscription = []string{"ALL"}
	}
	if err := client.Subscribe(dialCtx, subscription...); err != nil {
		client.Close()
		if tunnel != nil {
			tunnel.Close()
		}
		return nil, nil, err
	}
	return client, tunnel, nil
}

// API runs an api command on this session's live connection.
func (s *Session) API(ctx context.Context, command string) (string, error) {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()
	if client == nil {
		return "", fmt.Errorf("session %s is not connected", s.ConnID)
	}
	return client.API(ctx, command)
}

// BgAPI runs a background api command, returning the job UUID.
func (s *Session) BgAPI(ctx context.Context, command string) (string, error) {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()
	if client == nil {
		return "", fmt.Errorf("session %s is not connected", s.ConnID)
	}
	return client.BgAPI(ctx, command)
}

// Subscribe widens the event subscription on the live connection.
func (s *Session) Subscribe(ctx context.Context, names ...string) error {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()
	if client == nil {
		return fmt.Errorf("session %s is not connected", s.ConnID)
	}
	return client.Subscribe(ctx, names...)
}

// MonitorAll toggles the firehose: ALL events for the raw event monitor,
// or back down to the base subscription. Survives only until reconnect —
// connectOnce re-applies monitorAll if it was on.
func (s *Session) MonitorAll(ctx context.Context, enable bool) error {
	s.mu.Lock()
	client := s.client
	s.monitorAll = enable
	s.mu.Unlock()
	if client == nil {
		return fmt.Errorf("session %s is not connected", s.ConnID)
	}
	if enable {
		return client.Subscribe(ctx, "ALL")
	}
	if err := client.NoEvents(ctx); err != nil {
		return err
	}
	return client.Subscribe(ctx, baseEvents...)
}
