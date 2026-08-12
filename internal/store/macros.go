package store

import "fmt"

// Macro is a user-defined command template for the Commands screen.
// Placeholders in Template become form fields in the UI:
//
//	<name>          text field (required)
//	<name=default>  text field with a default
//	<name:a|b|c>    select, first option is the default
type Macro struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Help     string `json:"help"`
	Template string `json:"template"`
	Bg       bool   `json:"bg"`      // run via bgapi
	Confirm  bool   `json:"confirm"` // ask before running
}

func (m Macro) validate() error {
	if m.Name == "" {
		return fmt.Errorf("macro name is required")
	}
	if m.Template == "" {
		return fmt.Errorf("macro template is required")
	}
	return nil
}

func (s *Store) ListMacros() ([]Macro, error) {
	rows, err := s.db.Query(`SELECT id, name, help, template, bg, confirm FROM macros ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	macros := []Macro{}
	for rows.Next() {
		var m Macro
		if err := rows.Scan(&m.ID, &m.Name, &m.Help, &m.Template, &m.Bg, &m.Confirm); err != nil {
			return nil, err
		}
		macros = append(macros, m)
	}
	return macros, rows.Err()
}

// SaveMacro creates the macro when ID is empty, updates it otherwise.
func (s *Store) SaveMacro(m Macro) (Macro, error) {
	if err := m.validate(); err != nil {
		return Macro{}, err
	}
	if m.ID == "" {
		m.ID = newID()
		_, err := s.db.Exec(`INSERT INTO macros (id, name, help, template, bg, confirm) VALUES (?, ?, ?, ?, ?, ?)`,
			m.ID, m.Name, m.Help, m.Template, m.Bg, m.Confirm)
		if err != nil {
			return Macro{}, err
		}
		return m, nil
	}
	res, err := s.db.Exec(`
UPDATE macros SET name=?, help=?, template=?, bg=?, confirm=?, updated_at=datetime('now') WHERE id=?`,
		m.Name, m.Help, m.Template, m.Bg, m.Confirm, m.ID)
	if err != nil {
		return Macro{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Macro{}, fmt.Errorf("macro %s not found", m.ID)
	}
	return m, nil
}

func (s *Store) DeleteMacro(id string) error {
	_, err := s.db.Exec(`DELETE FROM macros WHERE id=?`, id)
	return err
}
