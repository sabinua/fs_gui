// Package callcenter is the first built-in plugin: full management of
// mod_callcenter — queues, agents, tiers and live queue members.
package callcenter

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"fsgui/internal/plugin"
)

func init() { plugin.Register(ccPlugin{}) }

type ccPlugin struct{}

func (ccPlugin) Manifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          "callcenter",
		Name:        "Call Center",
		Version:     "0.1.0",
		Description: "Черги, агенти, tiers та live-стан mod_callcenter",
		FSModules:   []string{"mod_callcenter"},
	}
}

func (ccPlugin) NewInstance(ctx plugin.Context) (plugin.Instance, error) {
	// Live queue/agent updates arrive as CUSTOM callcenter::info events;
	// the UI listens to the shared fs:event stream, we only subscribe.
	if err := ctx.Subscribe(context.Background(), "CUSTOM", "callcenter::info"); err != nil {
		return nil, err
	}
	return &instance{ctx: ctx}, nil
}

type instance struct {
	ctx plugin.Context
}

func (i *instance) HandleEvent(name string, fields map[string]string) {}

func (i *instance) Shutdown() {}

// AgentStatuses are the valid mod_callcenter agent statuses.
var AgentStatuses = []string{"Available", "Available (On Demand)", "On Break", "Logged Out"}

// identRe validates queue/agent identifiers before they are spliced into
// an api command line (typical form: 1000@default).
var identRe = regexp.MustCompile(`^[A-Za-z0-9@._-]+$`)

func ident(args map[string]string, key string) (string, error) {
	v := strings.TrimSpace(args[key])
	if v == "" {
		return "", fmt.Errorf("callcenter: %q is required", key)
	}
	if !identRe.MatchString(v) {
		return "", fmt.Errorf("callcenter: invalid %s %q", key, v)
	}
	return v, nil
}

func noNewlines(args map[string]string, key string) string {
	v := strings.TrimSpace(args[key])
	return strings.NewReplacer("\n", " ", "\r", " ").Replace(v)
}

func (i *instance) Call(ctx context.Context, method string, args map[string]string) (any, error) {
	switch method {
	case "queues":
		return i.table(ctx, "callcenter_config queue list")
	case "agents":
		return i.table(ctx, "callcenter_config agent list")
	case "tiers":
		return i.table(ctx, "callcenter_config tier list")
	case "members":
		queue, err := ident(args, "queue")
		if err != nil {
			return nil, err
		}
		return i.table(ctx, "callcenter_config queue list members "+queue)

	case "agent_add":
		name, err := ident(args, "name")
		if err != nil {
			return nil, err
		}
		if _, err := i.ctx.API(ctx, "callcenter_config agent add "+name+" callback"); err != nil {
			return nil, err
		}
		if contact := noNewlines(args, "contact"); contact != "" {
			if _, err := i.ctx.API(ctx, fmt.Sprintf("callcenter_config agent set contact %s %s", name, contact)); err != nil {
				return nil, err
			}
		}
		if status := noNewlines(args, "status"); status != "" {
			if _, err := i.ctx.API(ctx, fmt.Sprintf("callcenter_config agent set status %s '%s'", name, status)); err != nil {
				return nil, err
			}
		}
		return nil, nil

	case "agent_del":
		name, err := ident(args, "name")
		if err != nil {
			return nil, err
		}
		_, err = i.ctx.API(ctx, "callcenter_config agent del "+name)
		return nil, err

	case "agent_set":
		name, err := ident(args, "name")
		if err != nil {
			return nil, err
		}
		field := args["field"]
		switch field {
		case "status", "state", "contact", "max_no_answer", "wrap_up_time",
			"reject_delay_time", "busy_delay_time", "no_answer_delay_time":
		default:
			return nil, fmt.Errorf("callcenter: cannot set agent field %q", field)
		}
		value := noNewlines(args, "value")
		if field == "status" || field == "state" {
			value = "'" + value + "'"
		}
		_, err = i.ctx.API(ctx, fmt.Sprintf("callcenter_config agent set %s %s %s", field, name, value))
		return nil, err

	case "tier_add":
		queue, err := ident(args, "queue")
		if err != nil {
			return nil, err
		}
		agent, err := ident(args, "agent")
		if err != nil {
			return nil, err
		}
		cmd := fmt.Sprintf("callcenter_config tier add %s %s", queue, agent)
		if lvl := strings.TrimSpace(args["level"]); lvl != "" {
			cmd += " " + lvl
			if pos := strings.TrimSpace(args["position"]); pos != "" {
				cmd += " " + pos
			}
		}
		_, err = i.ctx.API(ctx, cmd)
		return nil, err

	case "tier_set":
		queue, err := ident(args, "queue")
		if err != nil {
			return nil, err
		}
		agent, err := ident(args, "agent")
		if err != nil {
			return nil, err
		}
		field := args["field"]
		if field != "level" && field != "position" {
			return nil, fmt.Errorf("callcenter: cannot set tier field %q", field)
		}
		_, err = i.ctx.API(ctx, fmt.Sprintf("callcenter_config tier set %s %s %s %s",
			field, queue, agent, strings.TrimSpace(args["value"])))
		return nil, err

	case "tier_del":
		queue, err := ident(args, "queue")
		if err != nil {
			return nil, err
		}
		agent, err := ident(args, "agent")
		if err != nil {
			return nil, err
		}
		_, err = i.ctx.API(ctx, fmt.Sprintf("callcenter_config tier del %s %s", queue, agent))
		return nil, err

	default:
		return nil, fmt.Errorf("callcenter: unknown method %q", method)
	}
}

func (i *instance) table(ctx context.Context, cmd string) ([]map[string]string, error) {
	out, err := i.ctx.API(ctx, cmd)
	if err != nil {
		return nil, err
	}
	return parsePipeTable(out), nil
}

// parsePipeTable parses callcenter_config list output: a pipe-delimited
// header line, data rows, then a "+OK" terminator.
func parsePipeTable(out string) []map[string]string {
	rows := []map[string]string{}
	var header []string
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" || strings.HasPrefix(line, "+OK") {
			continue
		}
		if header == nil {
			header = strings.Split(line, "|")
			continue
		}
		parts := strings.Split(line, "|")
		row := make(map[string]string, len(header))
		for i, h := range header {
			if i < len(parts) {
				row[h] = parts[i]
			}
		}
		rows = append(rows, row)
	}
	return rows
}
