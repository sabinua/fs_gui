package callcenter

import (
	"context"
	"strings"
	"testing"
)

const sampleAgents = `name|instance_id|uuid|type|contact|status|state|max_no_answer|wrap_up_time|reject_delay_time|busy_delay_time|no_answer_delay_time|last_bridge_start|last_bridge_end|last_offered_call|last_status_change|no_answer_count|calls_answered|talk_time|ready_time|external_calls_count
1000@default|single_box||callback|[call_timeout=10]user/1000|Available|Waiting|3|10|3|60|0|0|0|0|1754390000|0|12|3600|0|0
1001@default|single_box||callback|[call_timeout=10]user/1001|On Break|Idle|3|10|3|60|0|0|0|0|1754390001|1|5|900|0|0
+OK
`

func TestParsePipeTable(t *testing.T) {
	rows := parsePipeTable(sampleAgents)
	if len(rows) != 2 {
		t.Fatalf("want 2 rows, got %d", len(rows))
	}
	if rows[0]["name"] != "1000@default" || rows[0]["status"] != "Available" || rows[0]["calls_answered"] != "12" {
		t.Fatalf("row 0: %+v", rows[0])
	}
	if rows[1]["status"] != "On Break" || rows[1]["state"] != "Idle" {
		t.Fatalf("row 1: %+v", rows[1])
	}
}

// fakeCtx records API commands and returns canned output.
type fakeCtx struct {
	cmds []string
	out  string
}

func (f *fakeCtx) ConnID() string { return "c1" }
func (f *fakeCtx) API(_ context.Context, cmd string) (string, error) {
	f.cmds = append(f.cmds, cmd)
	return f.out, nil
}
func (f *fakeCtx) BgAPI(_ context.Context, cmd string) (string, error) { return "", nil }
func (f *fakeCtx) Subscribe(_ context.Context, _ ...string) error      { return nil }
func (f *fakeCtx) EmitUI(string, any)                                  {}

func TestAgentAddComposesCommands(t *testing.T) {
	f := &fakeCtx{out: "+OK"}
	inst := &instance{ctx: f}
	_, err := inst.Call(context.Background(), "agent_add", map[string]string{
		"name":    "1002@default",
		"contact": "[call_timeout=10]user/1002",
		"status":  "On Break",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"callcenter_config agent add 1002@default callback",
		"callcenter_config agent set contact 1002@default [call_timeout=10]user/1002",
		"callcenter_config agent set status 1002@default 'On Break'",
	}
	if len(f.cmds) != len(want) {
		t.Fatalf("cmds: %v", f.cmds)
	}
	for i := range want {
		if f.cmds[i] != want[i] {
			t.Fatalf("cmd %d: got %q want %q", i, f.cmds[i], want[i])
		}
	}
}

func TestIdentValidation(t *testing.T) {
	f := &fakeCtx{out: "+OK"}
	inst := &instance{ctx: f}
	_, err := inst.Call(context.Background(), "agent_del", map[string]string{"name": "x; reload"})
	if err == nil || !strings.Contains(err.Error(), "invalid") {
		t.Fatalf("injection-looking ident must be rejected, got %v", err)
	}
	if len(f.cmds) != 0 {
		t.Fatalf("no command should be sent: %v", f.cmds)
	}
	if _, err := inst.Call(context.Background(), "bogus", nil); err == nil {
		t.Fatal("unknown method must fail")
	}
}
