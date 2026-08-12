package main

import "testing"

const sampleListUsers = `userid|context|domain|group|contact|callgroup|effective_caller_id_name|effective_caller_id_number
1000|default|10.0.0.5|default|error/user_not_registered|techsupport|Extension 1000|1000
1001|default|10.0.0.5|default|sofia/internal/sip:1001@192.168.1.20:5060|techsupport|Extension 1001|1001
1001|default|10.0.0.5|sales|sofia/internal/sip:1001@192.168.1.20:5060|techsupport|Extension 1001|1001
1002|default|other.dom|support|error/user_not_registered||Extension 1002|1002

+OK
`

func TestParseListUsers(t *testing.T) {
	users := parseListUsers(sampleListUsers)
	if len(users) != 3 {
		t.Fatalf("want 3 users, got %d: %+v", len(users), users)
	}

	// Sorted by domain then user id.
	if users[0].UserID != "1000" || users[1].UserID != "1001" || users[2].Domain != "other.dom" {
		t.Fatalf("order: %+v", users)
	}

	if users[0].Registered {
		t.Fatal("1000 should be unregistered")
	}
	if users[0].CIDName != "Extension 1000" || users[0].CallGroup != "techsupport" {
		t.Fatalf("1000 fields: %+v", users[0])
	}

	// 1001 is listed in two groups and must be merged into one user.
	u := users[1]
	if !u.Registered || len(u.Groups) != 2 || u.Groups[0] != "default" || u.Groups[1] != "sales" {
		t.Fatalf("1001 merge: %+v", u)
	}
	if u.Contact != "sofia/internal/sip:1001@192.168.1.20:5060" {
		t.Fatalf("1001 contact: %q", u.Contact)
	}
}
