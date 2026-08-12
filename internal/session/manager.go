package session

import (
	"context"
	"fmt"
	"sync"

	"fsgui/internal/store"
)

// Manager owns all live sessions, keyed by profile id (= connId).
type Manager struct {
	store *store.Store
	sink  EventSink

	mu       sync.Mutex
	sessions map[string]*Session
}

func NewManager(st *store.Store, sink EventSink) *Manager {
	return &Manager{
		store:    st,
		sink:     sink,
		sessions: make(map[string]*Session),
	}
}

// Connect opens a session for the given profile. Idempotent: connecting an
// already-open session is a no-op.
func (m *Manager) Connect(profileID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.sessions[profileID]; ok {
		return nil
	}
	profile, err := m.store.GetProfile(profileID)
	if err != nil {
		return err
	}
	s := newSession(profile, m.sink)
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	m.sessions[profileID] = s
	go s.run(ctx)
	return nil
}

// Disconnect closes the session and waits for its loop to finish.
func (m *Manager) Disconnect(profileID string) error {
	m.mu.Lock()
	s, ok := m.sessions[profileID]
	if ok {
		delete(m.sessions, profileID)
	}
	m.mu.Unlock()
	if !ok {
		return nil
	}
	s.cancel()
	<-s.done
	return nil
}

// Get returns the live session for connId.
func (m *Manager) Get(connID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[connID]
	if !ok {
		return nil, fmt.Errorf("session: no open connection %q", connID)
	}
	return s, nil
}

// States returns the current state of every open session.
func (m *Manager) States() map[string]State {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]State, len(m.sessions))
	for id, s := range m.sessions {
		out[id] = s.State()
	}
	return out
}

// Shutdown disconnects everything (app exit).
func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.sessions = make(map[string]*Session)
	m.mu.Unlock()
	for _, s := range sessions {
		s.cancel()
		<-s.done
	}
}
