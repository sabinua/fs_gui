package main

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fsgui/internal/store"
)

// SetEventMonitor toggles the ALL-events firehose for the raw event monitor.
func (a *App) SetEventMonitor(connID string, enable bool) error {
	s, err := a.manager.Get(connID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	return s.MonitorAll(ctx, enable)
}

func (a *App) QueryCDR(connID string, f store.CDRFilter) (store.CDRPage, error) {
	return a.store.QueryCDR(connID, f)
}

func (a *App) GetCDRRaw(id int64) (string, error) {
	return a.store.GetCDRRaw(id)
}

// ExportCDRCSV asks the user for a target file and writes every CDR row
// matching the filter. Returns the chosen path ("" if cancelled).
func (a *App) ExportCDRCSV(connID string, f store.CDRFilter) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: fmt.Sprintf("cdr_%s.csv", time.Now().Format("2006-01-02")),
		Title:           "Експорт CDR",
		Filters:         []runtime.FileFilter{{DisplayName: "CSV", Pattern: "*.csv"}},
	})
	if err != nil || path == "" {
		return "", err
	}

	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	w := csv.NewWriter(file)
	defer w.Flush()
	w.Write([]string{"start", "direction", "cid_name", "cid_num", "dest", "duration", "billsec", "hangup_cause", "uuid"})

	err = a.store.EachCDR(connID, f, func(r store.CDRRow) error {
		start := ""
		if r.StartEpoch > 0 {
			start = time.Unix(r.StartEpoch, 0).Format("2006-01-02 15:04:05")
		}
		return w.Write([]string{
			start, r.Direction, r.CidName, r.CidNum, r.Dest,
			fmt.Sprint(r.Duration), fmt.Sprint(r.Billsec), r.HangupCause, r.UUID,
		})
	})
	if err != nil {
		return "", err
	}
	w.Flush()
	return path, w.Error()
}
