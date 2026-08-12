package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ListChannels returns the current channel snapshot from
// `show channels as json`; live updates come through fs:event pushes.
func (a *App) ListChannels(connID string) ([]map[string]string, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, "show channels as json")
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		return nil, err
	}
	rows := make([]map[string]string, 0, len(parsed.Rows))
	for _, r := range parsed.Rows {
		row := make(map[string]string, len(r))
		for k, v := range r {
			row[k] = fmt.Sprint(v)
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (a *App) HangupCall(connID, uuid, cause string) error {
	if cause == "" {
		cause = "NORMAL_CLEARING"
	}
	return a.simpleUUIDCmd(connID, fmt.Sprintf("uuid_kill %s %s", uuid, cause))
}

// TransferCall redirects a call. leg: "" (a-leg) | "-bleg" | "-both";
// dialplan/context are optional (default XML / current context).
func (a *App) TransferCall(connID, uuid, dest, leg, dialplan, dpContext string) error {
	parts := []string{"uuid_transfer", uuid}
	if leg == "-bleg" || leg == "-both" {
		parts = append(parts, leg)
	}
	parts = append(parts, dest)
	if dialplan != "" {
		parts = append(parts, dialplan)
		if dpContext != "" {
			parts = append(parts, dpContext)
		}
	}
	return a.simpleUUIDCmd(connID, strings.Join(parts, " "))
}

// ChannelVar is one entry of uuid_dump, split into channel variables
// (variable_* — editable) and other channel fields (read-only).
type ChannelDump struct {
	Variables []KV `json:"variables"`
	Fields    []KV `json:"fields"`
}

type KV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func (a *App) GetChannelVars(connID, uuid string) (ChannelDump, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return ChannelDump{}, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	out, err := s.API(ctx, fmt.Sprintf("uuid_dump %s json", uuid))
	if err != nil {
		return ChannelDump{}, err
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return ChannelDump{}, err
	}
	dump := ChannelDump{Variables: []KV{}, Fields: []KV{}}
	for k, v := range raw {
		val := fmt.Sprint(v)
		if name, ok := strings.CutPrefix(k, "variable_"); ok {
			dump.Variables = append(dump.Variables, KV{Key: name, Value: val})
		} else {
			dump.Fields = append(dump.Fields, KV{Key: k, Value: val})
		}
	}
	sort.Slice(dump.Variables, func(i, j int) bool { return dump.Variables[i].Key < dump.Variables[j].Key })
	sort.Slice(dump.Fields, func(i, j int) bool { return dump.Fields[i].Key < dump.Fields[j].Key })
	return dump, nil
}

func (a *App) SetChannelVar(connID, uuid, name, value string) error {
	return a.simpleUUIDCmd(connID, fmt.Sprintf("uuid_setvar %s %s %s", uuid, name, value))
}

// RecordCall starts recording into <recordings_dir>/<uuid>_<ts>.wav and
// returns the file path; stop ends every recording on the channel.
func (a *App) RecordCall(connID, uuid string, start bool) (string, error) {
	s, err := a.manager.Get(connID)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()

	if !start {
		_, err := s.API(ctx, fmt.Sprintf("uuid_record %s stop all", uuid))
		return "", err
	}

	dir := "/tmp"
	if out, err := s.API(ctx, "global_getvar recordings_dir"); err == nil {
		if d := strings.TrimSpace(out); d != "" && !strings.HasPrefix(d, "-ERR") {
			dir = d
		}
	}
	path := fmt.Sprintf("%s/%s_%d.wav", dir, uuid, time.Now().Unix())
	if _, err := s.API(ctx, fmt.Sprintf("uuid_record %s start %s", uuid, path)); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) simpleUUIDCmd(connID, command string) error {
	s, err := a.manager.Get(connID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	_, err = s.API(ctx, command)
	return err
}
