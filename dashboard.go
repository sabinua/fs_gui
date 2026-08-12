package main

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// SofiaProfile is one row of `sofia status`.
type SofiaProfile struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Data  string `json:"data"`
	State string `json:"state"`
}

// DashboardStats aggregates several api calls into one binding so the
// dashboard refreshes with a single round-trip.
type DashboardStats struct {
	Version         string         `json:"version"`
	UptimeText      string         `json:"uptimeText"`
	ActiveSessions  int            `json:"activeSessions"`
	PeakSessions    int            `json:"peakSessions"`
	SessionsTotal   int            `json:"sessionsTotal"`
	SessionsPerSec  int            `json:"sessionsPerSec"`
	MaxSessionsRate int            `json:"maxSessionsRate"`
	MaxSessions     int            `json:"maxSessions"`
	IdleCPU         string         `json:"idleCpu"`
	CallsCount      int            `json:"callsCount"`
	SofiaProfiles   []SofiaProfile `json:"sofiaProfiles"`
	ModuleCount     int            `json:"moduleCount"`
}

var (
	reUptime   = regexp.MustCompile(`(?m)^UP (.+?), (\d+) milliseconds`)
	reVersion  = regexp.MustCompile(`FreeSWITCH \(Version ([^)]+)\)`)
	reSince    = regexp.MustCompile(`(\d+) session\(s\) since startup`)
	reActive   = regexp.MustCompile(`(?m)^(\d+) session\(s\) - peak (\d+)`)
	rePerSec   = regexp.MustCompile(`(\d+) session\(s\) per Sec out of max (\d+)`)
	reMax      = regexp.MustCompile(`(?m)^(\d+) session\(s\) max`)
	reIdleCPU = regexp.MustCompile(`min idle cpu ([\d.]+)/([\d.]+)`)
	reCalls   = regexp.MustCompile(`(\d+) total`)
)

// parseModuleCount counts unique modules in the CSV-style `show modules`
// output. Each row is one exported interface (api command, application,
// codec…), so the row count/"N total" line is far larger than the number
// of actually loaded modules — count distinct ikey (3rd column) instead.
func parseModuleCount(out string) int {
	seen := map[string]bool{}
	for i, line := range strings.Split(out, "\n") {
		if i == 0 {
			continue // header: type,name,ikey,filename
		}
		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			continue
		}
		if key := strings.TrimSpace(parts[2]); key != "" {
			seen[key] = true
		}
	}
	return len(seen)
}

func atoiSafe(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func (a *App) GetDashboardStats(connID string) (DashboardStats, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return DashboardStats{}, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()

	stats := DashboardStats{}

	status, err := s.API(ctx, "status")
	if err != nil {
		return DashboardStats{}, err
	}
	if m := reUptime.FindStringSubmatch(status); m != nil {
		stats.UptimeText = m[1]
	}
	if m := reVersion.FindStringSubmatch(status); m != nil {
		stats.Version = m[1]
	}
	if m := reSince.FindStringSubmatch(status); m != nil {
		stats.SessionsTotal = atoiSafe(m[1])
	}
	if m := reActive.FindStringSubmatch(status); m != nil {
		stats.ActiveSessions = atoiSafe(m[1])
		stats.PeakSessions = atoiSafe(m[2])
	}
	if m := rePerSec.FindStringSubmatch(status); m != nil {
		stats.SessionsPerSec = atoiSafe(m[1])
		stats.MaxSessionsRate = atoiSafe(m[2])
	}
	if m := reMax.FindStringSubmatch(status); m != nil {
		stats.MaxSessions = atoiSafe(m[1])
	}
	if m := reIdleCPU.FindStringSubmatch(status); m != nil {
		stats.IdleCPU = m[1]
	}

	if out, err := s.API(ctx, "show calls count"); err == nil {
		if m := reCalls.FindStringSubmatch(out); m != nil {
			stats.CallsCount = atoiSafe(m[1])
		}
	}

	if out, err := s.API(ctx, "sofia status"); err == nil {
		stats.SofiaProfiles = parseSofiaStatus(out)
	}

	if out, err := s.API(ctx, "show modules"); err == nil {
		stats.ModuleCount = parseModuleCount(out)
	}

	return stats, nil
}

// parseSofiaStatus parses the tab-separated `sofia status` table.
func parseSofiaStatus(out string) []SofiaProfile {
	profiles := []SofiaProfile{}
	for _, line := range strings.Split(out, "\n") {
		if !strings.Contains(line, "\t") || strings.Contains(line, "Name\t") {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 4 {
			continue
		}
		p := SofiaProfile{
			Name:  strings.TrimSpace(parts[0]),
			Type:  strings.TrimSpace(parts[1]),
			Data:  strings.TrimSpace(parts[2]),
			State: strings.TrimSpace(parts[3]),
		}
		if p.Name == "" || p.Type == "" {
			continue
		}
		profiles = append(profiles, p)
	}
	return profiles
}

// FSModule is one row of `show modules as json` (deduplicated by module).
type FSModule struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Key  string `json:"key"`
}

func (a *App) ListModules(connID string) ([]FSModule, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "show modules as json")
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Rows []struct {
			Type  string `json:"type"`
			Name  string `json:"name"`
			IKey  string `json:"ikey"`
		} `json:"rows"`
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	modules := []FSModule{}
	for _, r := range parsed.Rows {
		if seen[r.IKey] {
			continue
		}
		seen[r.IKey] = true
		modules = append(modules, FSModule{Name: r.IKey, Type: r.Type, Key: r.Name})
	}
	return modules, nil
}
