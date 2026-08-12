package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fsgui/internal/esl"
	_ "fsgui/internal/plugins/callcenter" // built-in plugins register in init()
	"fsgui/internal/session"
	"fsgui/internal/sshtunnel"
	"fsgui/internal/store"
)

// App is the Wails binding surface. All methods are callable from the
// frontend; push traffic goes through Wails runtime events:
//
//	"session:status" — session.StatusEvent
//	"fs:event"       — {connId, name, fields}
type App struct {
	ctx     context.Context
	store   *store.Store
	manager *session.Manager
	plugins *pluginHost
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dataDir, err := os.UserConfigDir()
	if err != nil {
		dataDir = "."
	}
	st, err := store.Open(filepath.Join(dataDir, "fsgui"))
	if err != nil {
		runtime.LogFatalf(ctx, "store: %v", err)
		return
	}
	a.store = st
	a.plugins = newPluginHost(a)
	a.manager = session.NewManager(st, eventSink{a})

	// Auto-connect flagged profiles.
	if profiles, err := st.ListProfiles(); err == nil {
		for _, p := range profiles {
			if p.AutoConnect {
				a.manager.Connect(p.ID)
			}
		}
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.manager != nil {
		a.manager.Shutdown()
	}
	if a.store != nil {
		a.store.Close()
	}
}

// ---- session.EventSink ----

// eventSink keeps sink callbacks off App so Wails doesn't expose them
// as frontend bindings.
type eventSink struct{ app *App }

func (s eventSink) SessionStatus(ev session.StatusEvent) {
	s.app.plugins.onStatus(ev)
	runtime.EventsEmit(s.app.ctx, "session:status", ev)
}

type fsEventPayload struct {
	ConnID string            `json:"connId"`
	Name   string            `json:"name"`
	Fields map[string]string `json:"fields"`
	Body   string            `json:"body,omitempty"`
}

func (s eventSink) FSEvent(connID string, ev *esl.Event) {
	// CDR collection is a backend concern: record every completed call
	// regardless of which screen the UI is showing.
	if ev.Fields["Event-Name"] == "CHANNEL_HANGUP_COMPLETE" {
		if err := s.app.store.InsertCDR(connID, ev.Fields); err != nil {
			runtime.LogWarningf(s.app.ctx, "cdr insert: %v", err)
		}
	}
	s.app.plugins.route(connID, ev)
	runtime.EventsEmit(s.app.ctx, "fs:event", fsEventPayload{
		ConnID: connID,
		Name:   ev.Name(),
		Fields: ev.Fields,
		Body:   ev.Body,
	})
}

// ---- Profiles ----

// ProfileSecrets carries credentials from the profile form to the keychain.
// Empty fields are left untouched on update; they are never sent back to UI.
type ProfileSecrets struct {
	ESLPassword   string `json:"eslPassword"`
	SSHPassword   string `json:"sshPassword"`
	SSHPassphrase string `json:"sshPassphrase"`
}

func saveSecrets(profileID string, sec ProfileSecrets) error {
	pairs := []struct {
		kind  store.SecretKind
		value string
	}{
		{store.SecretESLPassword, sec.ESLPassword},
		{store.SecretSSHPassword, sec.SSHPassword},
		{store.SecretSSHPassphrase, sec.SSHPassphrase},
	}
	for _, p := range pairs {
		if p.value == "" {
			continue // keep existing secret
		}
		if err := store.SetSecret(profileID, p.kind, p.value); err != nil {
			return fmt.Errorf("keychain: %w", err)
		}
	}
	return nil
}

func (a *App) ListProfiles() ([]store.Profile, error) {
	return a.store.ListProfiles()
}

func (a *App) CreateProfile(p store.Profile, sec ProfileSecrets) (store.Profile, error) {
	created, err := a.store.CreateProfile(p)
	if err != nil {
		return store.Profile{}, err
	}
	if err := saveSecrets(created.ID, sec); err != nil {
		a.store.DeleteProfile(created.ID)
		return store.Profile{}, err
	}
	return created, nil
}

func (a *App) UpdateProfile(p store.Profile, sec ProfileSecrets) error {
	if err := a.store.UpdateProfile(p); err != nil {
		return err
	}
	return saveSecrets(p.ID, sec)
}

// CloneProfile duplicates a profile including its keychain secrets, so the
// user typically only has to change the host. Returns the new profile.
func (a *App) CloneProfile(id string) (store.Profile, error) {
	src, err := a.store.GetProfile(id)
	if err != nil {
		return store.Profile{}, err
	}
	clone := src
	clone.Name = src.Name + " (копія)"
	clone.AutoConnect = false
	created, err := a.store.CreateProfile(clone)
	if err != nil {
		return store.Profile{}, err
	}
	for _, kind := range []store.SecretKind{store.SecretESLPassword, store.SecretSSHPassword, store.SecretSSHPassphrase} {
		v, err := store.GetSecret(id, kind)
		if err != nil || v == "" {
			continue
		}
		if err := store.SetSecret(created.ID, kind, v); err != nil {
			a.store.DeleteProfile(created.ID)
			store.DeleteAllSecrets(created.ID)
			return store.Profile{}, fmt.Errorf("keychain: %w", err)
		}
	}
	return created, nil
}

func (a *App) DeleteProfile(id string) error {
	a.manager.Disconnect(id)
	if err := a.store.DeleteProfile(id); err != nil {
		return err
	}
	store.DeleteAllSecrets(id)
	return nil
}

// ---- Connections ----

func (a *App) Connect(profileID string) error {
	return a.manager.Connect(profileID)
}

func (a *App) Disconnect(profileID string) error {
	return a.manager.Disconnect(profileID)
}

func (a *App) SessionStates() map[string]session.State {
	return a.manager.States()
}

// SendAPI runs an api command on an open session (used by dashboards and
// the raw command console).
func (a *App) SendAPI(connID, command string) (string, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return s.API(ctx, command)
}

// ---- Connection test (from the profile form, before saving) ----

type TestResult struct {
	SSHOK  bool   `json:"sshOk"`
	ESLOK  bool   `json:"eslOk"`
	Detail string `json:"detail,omitempty"`
}

// TestConnection tries SSH (if enabled) and ESL auth with the given,
// possibly unsaved, profile + secrets. Returns per-layer results so the
// form can show exactly what failed.
func (a *App) TestConnection(p store.Profile, sec ProfileSecrets) TestResult {
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()

	eslAddr := net.JoinHostPort(p.ESLHost, fmt.Sprint(orDefault(p.ESLPort, 8021)))
	res := TestResult{}

	var conn net.Conn
	if p.UseSSH {
		cfg := sshtunnel.Config{
			Host: net.JoinHostPort(p.SSHHost, fmt.Sprint(orDefault(p.SSHPort, 22))),
			User: p.SSHUser,
		}
		switch p.SSHAuth {
		case "password":
			cfg.Password = sec.SSHPassword
		case "key":
			cfg.PrivateKeyPath = p.SSHKeyPath
			cfg.KeyPassphrase = sec.SSHPassphrase
		case "agent":
			cfg.UseAgent = true
		}
		tunnel, err := sshtunnel.Open(ctx, cfg)
		if err != nil {
			res.Detail = err.Error()
			return res
		}
		defer tunnel.Close()
		res.SSHOK = true
		conn, err = tunnel.Dial(ctx, eslAddr)
		if err != nil {
			res.Detail = fmt.Sprintf("SSH ok, but ESL unreachable: %v", err)
			return res
		}
	} else {
		var err error
		d := net.Dialer{Timeout: 10 * time.Second}
		conn, err = d.DialContext(ctx, "tcp", eslAddr)
		if err != nil {
			res.Detail = err.Error()
			return res
		}
	}

	client, err := esl.NewClient(ctx, conn, sec.ESLPassword)
	if err != nil {
		res.Detail = fmt.Sprintf("ESL: %v", err)
		return res
	}
	defer client.Close()
	if _, err := client.API(ctx, "status"); err != nil {
		res.Detail = fmt.Sprintf("ESL auth ok, status failed: %v", err)
		return res
	}
	res.ESLOK = true
	return res
}

func orDefault(v, def int) int {
	if v == 0 {
		return def
	}
	return v
}

