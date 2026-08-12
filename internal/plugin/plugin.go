// Package plugin defines the v1 (compile-time) plugin API. A plugin is a Go
// package that registers itself in init() via Register(). The Host activates
// a plugin instance per session, after checking that the FreeSWITCH modules
// it depends on are actually loaded on that server.
//
// The Core API surface (Context) is deliberately narrow and serializable so
// that v2 can move plugins out of process (hashicorp/go-plugin over gRPC)
// without changing plugin code structure.
package plugin

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// Manifest describes a plugin to the host and the UI.
type Manifest struct {
	ID          string   `json:"id"`          // e.g. "callcenter"
	Name        string   `json:"name"`        // e.g. "Call Center"
	Version     string   `json:"version"`     // semver
	Description string   `json:"description"` //
	FSModules   []string `json:"fsModules"`   // required FS modules, e.g. ["mod_callcenter"]
}

// Context is the Core API handed to a plugin instance. Everything is scoped
// to one session (one FreeSWITCH server).
type Context interface {
	ConnID() string
	// API runs a blocking api command on the session's ESL connection.
	API(ctx context.Context, command string) (string, error)
	// BgAPI runs a background command; completion arrives as BACKGROUND_JOB.
	BgAPI(ctx context.Context, command string) (string, error)
	// Subscribe widens the session's ESL event subscription.
	Subscribe(ctx context.Context, events ...string) error
	// EmitUI pushes a payload to the frontend on channel
	// "plugin:<pluginID>:<topic>" scoped to this connId.
	EmitUI(topic string, payload any)
}

// Plugin is a factory: one registered Plugin produces one Instance per
// activated session.
type Plugin interface {
	Manifest() Manifest
	// NewInstance is called when a session comes online and the FS module
	// dependency check passed. The instance may subscribe to events and
	// keep per-session state.
	NewInstance(ctx Context) (Instance, error)
}

// Instance is a live plugin bound to one session.
type Instance interface {
	// HandleEvent receives every FS event of the session (after core routing).
	HandleEvent(name string, fields map[string]string)
	// Call is the generic UI→plugin RPC: the frontend invokes named methods
	// with string args and gets a JSON-serializable result. Keeping this
	// generic means the host binding surface stays fixed as plugins evolve
	// (and maps 1:1 onto gRPC for out-of-process plugins in v2).
	Call(ctx context.Context, method string, args map[string]string) (any, error)
	// Shutdown is called when the session disconnects or the plugin is
	// disabled for this profile.
	Shutdown()
}

var (
	regMu    sync.Mutex
	registry = map[string]Plugin{}
)

// Register adds a plugin to the global registry; called from init().
func Register(p Plugin) {
	regMu.Lock()
	defer regMu.Unlock()
	id := p.Manifest().ID
	if _, dup := registry[id]; dup {
		panic(fmt.Sprintf("plugin: duplicate id %q", id))
	}
	registry[id] = p
}

// All returns registered plugins sorted by id.
func All() []Plugin {
	regMu.Lock()
	defer regMu.Unlock()
	out := make([]Plugin, 0, len(registry))
	for _, p := range registry {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Manifest().ID < out[j].Manifest().ID })
	return out
}

// Get returns a plugin by id.
func Get(id string) (Plugin, bool) {
	regMu.Lock()
	defer regMu.Unlock()
	p, ok := registry[id]
	return p, ok
}
