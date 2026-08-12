package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"fsgui/internal/store"
)

// ---- User-defined command macros (Commands screen) ----

func (a *App) ListUserMacros() ([]store.Macro, error) {
	return a.store.ListMacros()
}

// SaveUserMacro creates (empty ID) or updates a macro and returns it.
func (a *App) SaveUserMacro(m store.Macro) (store.Macro, error) {
	return a.store.SaveMacro(m)
}

func (a *App) DeleteUserMacro(id string) error {
	return a.store.DeleteMacro(id)
}

// GetGlobalVars returns all FreeSWITCH global variables, sorted by name.
// `global_getvar` without an argument dumps them as key=value lines.
func (a *App) GetGlobalVars(connID string) ([]KV, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "global_getvar")
	if err != nil {
		return nil, err
	}
	vars := parseGlobalVars(out)
	sort.Slice(vars, func(i, j int) bool { return vars[i].Key < vars[j].Key })
	return vars, nil
}

func parseGlobalVars(out string) []KV {
	vars := []KV{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, "\r")
		key, value, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(key) == "" {
			continue
		}
		vars = append(vars, KV{Key: strings.TrimSpace(key), Value: value})
	}
	return vars
}

func (a *App) SetGlobalVar(connID, name, value string) error {
	s, err := a.manager.Get(connID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, fmt.Sprintf("global_setvar %s=%s", name, value))
	if err != nil {
		return err
	}
	if strings.HasPrefix(strings.TrimSpace(out), "-ERR") {
		return fmt.Errorf("%s", strings.TrimSpace(out))
	}
	return nil
}

// SendBgAPI runs an api command in the background and returns the Job-UUID.
// The result arrives on the fs:event stream as a BACKGROUND_JOB event with
// that UUID (BACKGROUND_JOB is part of the base subscription).
func (a *App) SendBgAPI(connID, command string) (string, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return s.BgAPI(ctx, command)
}
