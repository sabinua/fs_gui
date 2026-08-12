// Package store owns the local SQLite database: connection profiles,
// and later CDR/event history (sharded by connection id).
package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

// Open creates/opens the application database. dir is the per-user data
// directory (e.g. ~/.local/share/fsgui); it is created if missing.
func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", filepath.Join(dir, "fsgui.db"))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS profiles (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '',
    esl_host     TEXT NOT NULL,
    esl_port     INTEGER NOT NULL DEFAULT 8021,
    use_ssh      INTEGER NOT NULL DEFAULT 0,
    ssh_host     TEXT NOT NULL DEFAULT '',
    ssh_port     INTEGER NOT NULL DEFAULT 22,
    ssh_user     TEXT NOT NULL DEFAULT '',
    ssh_auth     TEXT NOT NULL DEFAULT 'password', -- password | key | agent
    ssh_key_path TEXT NOT NULL DEFAULT '',
    auto_connect INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cdr (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    conn_id      TEXT NOT NULL,
    uuid         TEXT NOT NULL,
    direction    TEXT NOT NULL DEFAULT '',
    cid_name     TEXT NOT NULL DEFAULT '',
    cid_num      TEXT NOT NULL DEFAULT '',
    dest         TEXT NOT NULL DEFAULT '',
    start_epoch  INTEGER NOT NULL DEFAULT 0,
    answer_epoch INTEGER NOT NULL DEFAULT 0,
    end_epoch    INTEGER NOT NULL DEFAULT 0,
    duration     INTEGER NOT NULL DEFAULT 0,
    billsec      INTEGER NOT NULL DEFAULT 0,
    hangup_cause TEXT NOT NULL DEFAULT '',
    raw          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_cdr_conn_time ON cdr(conn_id, start_epoch DESC);

CREATE TABLE IF NOT EXISTS macros (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    help       TEXT NOT NULL DEFAULT '',
    template   TEXT NOT NULL,
    bg         INTEGER NOT NULL DEFAULT 0,
    confirm    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plugin_settings (
    profile_id TEXT NOT NULL,
    plugin_id  TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (profile_id, plugin_id)
);
`)
	return err
}

// PluginEnabled reports whether a plugin is enabled for a profile.
// Plugins are enabled by default: no row means true.
func (s *Store) PluginEnabled(profileID, pluginID string) bool {
	var enabled bool
	err := s.db.QueryRow(`SELECT enabled FROM plugin_settings WHERE profile_id=? AND plugin_id=?`,
		profileID, pluginID).Scan(&enabled)
	if err != nil {
		return true
	}
	return enabled
}

func (s *Store) SetPluginEnabled(profileID, pluginID string, enabled bool) error {
	_, err := s.db.Exec(`
INSERT INTO plugin_settings (profile_id, plugin_id, enabled) VALUES (?, ?, ?)
ON CONFLICT(profile_id, plugin_id) DO UPDATE SET enabled=excluded.enabled`,
		profileID, pluginID, enabled)
	return err
}
