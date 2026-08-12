package main

import "testing"

const sampleStatus = `UP 0 years, 12 days, 3 hours, 37 minutes, 12 seconds, 951 milliseconds, 462 microseconds
FreeSWITCH (Version 1.10.11 -release 64bit) is ready
1436 session(s) since startup
2 session(s) - peak 14, last 5min 3
0 session(s) per Sec out of max 30, peak 5, last 5min 1
1000 session(s) max
min idle cpu 0.00/97.87
Current Stack Size/Max 240K/8192K
`

func TestStatusRegexes(t *testing.T) {
	if m := reUptime.FindStringSubmatch(sampleStatus); m == nil || m[1] != "0 years, 12 days, 3 hours, 37 minutes, 12 seconds" {
		t.Fatalf("uptime: %v", m)
	}
	if m := reVersion.FindStringSubmatch(sampleStatus); m == nil || m[1] != "1.10.11 -release 64bit" {
		t.Fatalf("version: %v", m)
	}
	if m := reSince.FindStringSubmatch(sampleStatus); m == nil || m[1] != "1436" {
		t.Fatalf("since: %v", m)
	}
	if m := reActive.FindStringSubmatch(sampleStatus); m == nil || m[1] != "2" || m[2] != "14" {
		t.Fatalf("active: %v", m)
	}
	if m := rePerSec.FindStringSubmatch(sampleStatus); m == nil || m[1] != "0" || m[2] != "30" {
		t.Fatalf("persec: %v", m)
	}
	if m := reMax.FindStringSubmatch(sampleStatus); m == nil || m[1] != "1000" {
		t.Fatalf("max: %v", m)
	}
	if m := reIdleCPU.FindStringSubmatch(sampleStatus); m == nil || m[1] != "0.00" {
		t.Fatalf("idlecpu: %v", m)
	}
}

const sampleModules = `type,name,ikey,filename
api,status,mod_commands,/usr/lib/freeswitch/mod/mod_commands.so
api,uuid_kill,mod_commands,/usr/lib/freeswitch/mod/mod_commands.so
application,bridge,mod_dptools,/usr/lib/freeswitch/mod/mod_dptools.so
application,answer,mod_dptools,/usr/lib/freeswitch/mod/mod_dptools.so
codec,PCMU,mod_g711,/usr/lib/freeswitch/mod/mod_g711.so
endpoint,sofia,mod_sofia,/usr/lib/freeswitch/mod/mod_sofia.so

6 total.
`

func TestParseModuleCount(t *testing.T) {
	// 6 interface rows, but only 4 distinct modules.
	if n := parseModuleCount(sampleModules); n != 4 {
		t.Fatalf("want 4 modules, got %d", n)
	}
}

const sampleSofia = "                     Name\t   Type\t                                      Data\tState\n" +
	"=================================================================================================\n" +
	"            external-ipv6\tprofile\t                  sip:mod_sofia@[::1]:5080\tRUNNING (0)\n" +
	"                 external\tprofile\t          sip:mod_sofia@192.168.1.10:5080\tRUNNING (0)\n" +
	"    external::example.com\tgateway\t                   sip:user@example.com\tREGED\n" +
	"                 internal\tprofile\t          sip:mod_sofia@192.168.1.10:5060\tRUNNING (2)\n" +
	"=================================================================================================\n" +
	"3 profiles 1 alias\n"

func TestParseSofiaStatus(t *testing.T) {
	profiles := parseSofiaStatus(sampleSofia)
	if len(profiles) != 4 {
		t.Fatalf("want 4 rows, got %d: %+v", len(profiles), profiles)
	}
	if profiles[0].Name != "external-ipv6" || profiles[0].Type != "profile" || profiles[0].State != "RUNNING (0)" {
		t.Fatalf("row 0: %+v", profiles[0])
	}
	if profiles[2].Type != "gateway" || profiles[2].State != "REGED" {
		t.Fatalf("gateway row: %+v", profiles[2])
	}
}
