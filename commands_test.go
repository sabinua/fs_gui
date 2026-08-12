package main

import "testing"

func TestParseGlobalVars(t *testing.T) {
	out := "hostname=pbx1\nlocal_ip_v4=10.0.0.5\nsound_prefix=/usr/share/sounds/en/us/callie\nempty_var=\nnot a var line\n"
	vars := parseGlobalVars(out)
	if len(vars) != 4 {
		t.Fatalf("want 4 vars, got %d: %v", len(vars), vars)
	}
	if vars[0].Key != "hostname" || vars[0].Value != "pbx1" {
		t.Errorf("first var = %+v", vars[0])
	}
	if vars[3].Key != "empty_var" || vars[3].Value != "" {
		t.Errorf("empty value not kept: %+v", vars[3])
	}
}

func TestParseGlobalVarsValueWithEquals(t *testing.T) {
	vars := parseGlobalVars("codec_string=PCMA,PCMU;mode=20\n")
	if len(vars) != 1 || vars[0].Value != "PCMA,PCMU;mode=20" {
		t.Fatalf("value with '=' mangled: %v", vars)
	}
}
