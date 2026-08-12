package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// DirectoryUser is one user of the FreeSWITCH XML directory,
// aggregated from `list_users` (a user may be listed once per group).
type DirectoryUser struct {
	UserID     string   `json:"userId"`
	Domain     string   `json:"domain"`
	Context    string   `json:"context"`
	Groups     []string `json:"groups"`
	Contact    string   `json:"contact"`
	CallGroup  string   `json:"callGroup"`
	CIDName    string   `json:"cidName"`
	CIDNumber  string   `json:"cidNumber"`
	Registered bool     `json:"registered"`
}

const notRegisteredContact = "error/user_not_registered"

// parseListUsers parses the pipe-delimited `list_users` table.
func parseListUsers(out string) []DirectoryUser {
	byKey := map[string]*DirectoryUser{}
	order := []string{}
	for i, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if i == 0 || line == "" || strings.HasPrefix(line, "+OK") {
			continue // header / terminator
		}
		parts := strings.Split(line, "|")
		if len(parts) < 8 {
			continue
		}
		key := parts[2] + "/" + parts[0] // domain/userid
		u, ok := byKey[key]
		if !ok {
			u = &DirectoryUser{
				UserID:    parts[0],
				Context:   parts[1],
				Domain:    parts[2],
				Contact:   parts[4],
				CallGroup: parts[5],
				CIDName:   parts[6],
				CIDNumber: parts[7],
			}
			byKey[key] = u
			order = append(order, key)
		}
		if g := strings.TrimSpace(parts[3]); g != "" && !contains(u.Groups, g) {
			u.Groups = append(u.Groups, g)
		}
		if parts[4] != notRegisteredContact && parts[4] != "" {
			u.Contact = parts[4]
			u.Registered = true
		}
	}
	users := make([]DirectoryUser, 0, len(order))
	for _, k := range order {
		users = append(users, *byKey[k])
	}
	sort.Slice(users, func(i, j int) bool {
		if users[i].Domain != users[j].Domain {
			return users[i].Domain < users[j].Domain
		}
		return users[i].UserID < users[j].UserID
	})
	return users
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func (a *App) ListDirectory(connID string) ([]DirectoryUser, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "list_users")
	if err != nil {
		return nil, err
	}
	return parseListUsers(out), nil
}

// Registration is one row of `show registrations as json`.
type Registration struct {
	User         string `json:"user"`
	Realm        string `json:"realm"`
	Token        string `json:"token"`
	URL          string `json:"url"`
	Expires      int64  `json:"expires"`
	NetworkIP    string `json:"networkIp"`
	NetworkPort  string `json:"networkPort"`
	NetworkProto string `json:"networkProto"`
	Hostname     string `json:"hostname"`
}

func (a *App) ListRegistrations(connID string) ([]Registration, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "show registrations as json")
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		return nil, err
	}
	regs := make([]Registration, 0, len(parsed.Rows))
	for _, r := range parsed.Rows {
		get := func(k string) string { return fmt.Sprint(r[k]) }
		expires, _ := strconv.ParseInt(get("expires"), 10, 64)
		regs = append(regs, Registration{
			User:         get("reg_user"),
			Realm:        get("realm"),
			Token:        get("token"),
			URL:          get("url"),
			Expires:      expires,
			NetworkIP:    get("network_ip"),
			NetworkPort:  get("network_port"),
			NetworkProto: get("network_proto"),
			Hostname:     get("hostname"),
		})
	}
	return regs, nil
}

// ListSofiaProfiles returns the names of running sofia profiles
// (for the flush-registration dialog).
func (a *App) ListSofiaProfiles(connID string) ([]string, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "sofia status")
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, p := range parseSofiaStatus(out) {
		if p.Type == "profile" {
			names = append(names, p.Name)
		}
	}
	return names, nil
}

// FlushRegistration drops a user's inbound registration on the given
// sofia profile, forcing the device to re-register.
func (a *App) FlushRegistration(connID, profile, user, domain string) error {
	s, err := a.manager.Get(connID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	_, err = s.API(ctx, fmt.Sprintf("sofia profile %s flush_inbound_reg %s@%s", profile, user, domain))
	return err
}
