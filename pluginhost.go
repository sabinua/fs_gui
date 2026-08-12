package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fsgui/internal/esl"
	"fsgui/internal/plugin"
	"fsgui/internal/session"
)

// pluginHost activates registered plugins per session: when a connection
// comes online it checks each plugin's FS module dependencies and, if the
// plugin is enabled for the profile, creates an instance. Instances die
// with the session and are recreated after reconnect.
type pluginHost struct {
	app *App

	mu        sync.Mutex
	instances map[string]map[string]plugin.Instance // connID → pluginID → instance
	available map[string]map[string]bool            // connID → pluginID → FS deps ok
}

func newPluginHost(app *App) *pluginHost {
	return &pluginHost{
		app:       app,
		instances: map[string]map[string]plugin.Instance{},
		available: map[string]map[string]bool{},
	}
}

func (h *pluginHost) onStatus(ev session.StatusEvent) {
	switch ev.State {
	case session.StateOnline:
		// Async: this callback runs on the session goroutine before its
		// event pump starts, and activation issues API calls.
		go h.activateAll(ev.ConnID)
	case session.StateReconnecting, session.StateOffline:
		h.deactivateAll(ev.ConnID)
	}
}

func (h *pluginHost) activateAll(connID string) {
	for _, p := range plugin.All() {
		h.activate(connID, p)
	}
	h.emitState(connID)
}

func (h *pluginHost) activate(connID string, p plugin.Plugin) {
	m := p.Manifest()

	s, err := h.app.manager.Get(connID)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	available := true
	for _, mod := range m.FSModules {
		out, err := s.API(ctx, "module_exists "+mod)
		if err != nil || strings.TrimSpace(out) != "true" {
			available = false
			break
		}
	}
	h.mu.Lock()
	if h.available[connID] == nil {
		h.available[connID] = map[string]bool{}
	}
	h.available[connID][m.ID] = available
	_, alreadyActive := h.instances[connID][m.ID]
	h.mu.Unlock()

	if !available || alreadyActive || !h.app.store.PluginEnabled(connID, m.ID) {
		return
	}

	inst, err := p.NewInstance(&pluginCtx{app: h.app, connID: connID, pluginID: m.ID})
	if err != nil {
		runtime.LogWarningf(h.app.ctx, "plugin %s: activate: %v", m.ID, err)
		return
	}
	h.mu.Lock()
	if h.instances[connID] == nil {
		h.instances[connID] = map[string]plugin.Instance{}
	}
	h.instances[connID][m.ID] = inst
	h.mu.Unlock()
}

func (h *pluginHost) deactivate(connID, pluginID string) {
	h.mu.Lock()
	inst := h.instances[connID][pluginID]
	delete(h.instances[connID], pluginID)
	h.mu.Unlock()
	if inst != nil {
		inst.Shutdown()
	}
}

func (h *pluginHost) deactivateAll(connID string) {
	h.mu.Lock()
	insts := h.instances[connID]
	delete(h.instances, connID)
	delete(h.available, connID)
	h.mu.Unlock()
	for _, inst := range insts {
		inst.Shutdown()
	}
	h.emitState(connID)
}

// route fans a FS event out to the session's active plugin instances.
func (h *pluginHost) route(connID string, ev *esl.Event) {
	h.mu.Lock()
	insts := make([]plugin.Instance, 0, len(h.instances[connID]))
	for _, inst := range h.instances[connID] {
		insts = append(insts, inst)
	}
	h.mu.Unlock()
	for _, inst := range insts {
		inst.HandleEvent(ev.Name(), ev.Fields)
	}
}

// PluginState is what the UI sees per plugin per connection.
type PluginState struct {
	Manifest  plugin.Manifest `json:"manifest"`
	Enabled   bool            `json:"enabled"`
	Available bool            `json:"available"`
	Active    bool            `json:"active"`
}

func (h *pluginHost) states(connID string) []PluginState {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []PluginState{}
	for _, p := range plugin.All() {
		m := p.Manifest()
		_, active := h.instances[connID][m.ID]
		out = append(out, PluginState{
			Manifest:  m,
			Enabled:   h.app.store.PluginEnabled(connID, m.ID),
			Available: h.available[connID][m.ID],
			Active:    active,
		})
	}
	return out
}

func (h *pluginHost) emitState(connID string) {
	runtime.EventsEmit(h.app.ctx, "plugin:state", map[string]any{"connId": connID})
}

// pluginCtx implements plugin.Context for one (connection, plugin) pair.
// Session access is resolved per call so instances survive reconnects
// of the underlying ESL client within the same session object.
type pluginCtx struct {
	app      *App
	connID   string
	pluginID string
}

func (c *pluginCtx) ConnID() string { return c.connID }

func (c *pluginCtx) API(ctx context.Context, command string) (string, error) {
	s, err := c.app.manager.Get(c.connID)
	if err != nil {
		return "", err
	}
	return s.API(ctx, command)
}

func (c *pluginCtx) BgAPI(ctx context.Context, command string) (string, error) {
	s, err := c.app.manager.Get(c.connID)
	if err != nil {
		return "", err
	}
	return s.BgAPI(ctx, command)
}

func (c *pluginCtx) Subscribe(ctx context.Context, events ...string) error {
	s, err := c.app.manager.Get(c.connID)
	if err != nil {
		return err
	}
	return s.Subscribe(ctx, events...)
}

func (c *pluginCtx) EmitUI(topic string, payload any) {
	runtime.EventsEmit(c.app.ctx, fmt.Sprintf("plugin:%s:%s", c.pluginID, topic),
		map[string]any{"connId": c.connID, "payload": payload})
}

// ---- App bindings ----

func (a *App) ListPluginStates(connID string) []PluginState {
	return a.plugins.states(connID)
}

// SetPluginEnabled persists the per-profile flag and applies it live if
// the profile's session is currently open.
func (a *App) SetPluginEnabled(profileID, pluginID string, enabled bool) error {
	if err := a.store.SetPluginEnabled(profileID, pluginID, enabled); err != nil {
		return err
	}
	if _, err := a.manager.Get(profileID); err == nil {
		if enabled {
			if p, ok := plugin.Get(pluginID); ok {
				a.plugins.activate(profileID, p)
			}
		} else {
			a.plugins.deactivate(profileID, pluginID)
		}
		a.plugins.emitState(profileID)
	}
	return nil
}

// PluginCall routes a generic method call from the frontend to the active
// plugin instance of the given connection.
func (a *App) PluginCall(connID, pluginID, method string, args map[string]string) (any, error) {
	a.plugins.mu.Lock()
	inst := a.plugins.instances[connID][pluginID]
	a.plugins.mu.Unlock()
	if inst == nil {
		return nil, fmt.Errorf("плагін %q не активний для цього підключення", pluginID)
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return inst.Call(ctx, method, args)
}
