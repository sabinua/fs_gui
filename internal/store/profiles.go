package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
)

// Profile is connection profile metadata. Secrets (ESL password, SSH
// password / key passphrase) are NOT stored here — they live in the OS
// keychain, keyed by profile id.
type Profile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	ESLHost     string `json:"eslHost"`
	ESLPort     int    `json:"eslPort"`
	UseSSH      bool   `json:"useSsh"`
	SSHHost     string `json:"sshHost"`
	SSHPort     int    `json:"sshPort"`
	SSHUser     string `json:"sshUser"`
	SSHAuth     string `json:"sshAuth"` // password | key | agent
	SSHKeyPath  string `json:"sshKeyPath"`
	AutoConnect bool   `json:"autoConnect"`
}

var ErrNotFound = errors.New("store: not found")

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (p *Profile) validate() error {
	if p.Name == "" {
		return fmt.Errorf("store: profile name is required")
	}
	if p.ESLHost == "" {
		return fmt.Errorf("store: ESL host is required")
	}
	if p.ESLPort == 0 {
		p.ESLPort = 8021
	}
	if p.UseSSH {
		if p.SSHHost == "" {
			return fmt.Errorf("store: SSH host is required when SSH is enabled")
		}
		if p.SSHPort == 0 {
			p.SSHPort = 22
		}
		switch p.SSHAuth {
		case "password", "key", "agent":
		default:
			return fmt.Errorf("store: invalid ssh_auth %q", p.SSHAuth)
		}
	}
	return nil
}

func (s *Store) CreateProfile(p Profile) (Profile, error) {
	if err := p.validate(); err != nil {
		return Profile{}, err
	}
	p.ID = newID()
	_, err := s.db.Exec(`
INSERT INTO profiles (id, name, color, esl_host, esl_port, use_ssh, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path, auto_connect)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Color, p.ESLHost, p.ESLPort, p.UseSSH, p.SSHHost, p.SSHPort, p.SSHUser, p.SSHAuth, p.SSHKeyPath, p.AutoConnect)
	if err != nil {
		return Profile{}, err
	}
	return p, nil
}

func (s *Store) UpdateProfile(p Profile) error {
	if err := p.validate(); err != nil {
		return err
	}
	res, err := s.db.Exec(`
UPDATE profiles SET name=?, color=?, esl_host=?, esl_port=?, use_ssh=?, ssh_host=?, ssh_port=?, ssh_user=?, ssh_auth=?, ssh_key_path=?, auto_connect=?, updated_at=datetime('now')
WHERE id=?`,
		p.Name, p.Color, p.ESLHost, p.ESLPort, p.UseSSH, p.SSHHost, p.SSHPort, p.SSHUser, p.SSHAuth, p.SSHKeyPath, p.AutoConnect, p.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteProfile(id string) error {
	res, err := s.db.Exec(`DELETE FROM profiles WHERE id=?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) GetProfile(id string) (Profile, error) {
	row := s.db.QueryRow(`
SELECT id, name, color, esl_host, esl_port, use_ssh, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path, auto_connect
FROM profiles WHERE id=?`, id)
	return scanProfile(row)
}

func (s *Store) ListProfiles() ([]Profile, error) {
	rows, err := s.db.Query(`
SELECT id, name, color, esl_host, esl_port, use_ssh, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path, auto_connect
FROM profiles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	profiles := []Profile{}
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

type scanner interface{ Scan(dest ...any) error }

func scanProfile(row scanner) (Profile, error) {
	var p Profile
	err := row.Scan(&p.ID, &p.Name, &p.Color, &p.ESLHost, &p.ESLPort, &p.UseSSH,
		&p.SSHHost, &p.SSHPort, &p.SSHUser, &p.SSHAuth, &p.SSHKeyPath, &p.AutoConnect)
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	return p, err
}
