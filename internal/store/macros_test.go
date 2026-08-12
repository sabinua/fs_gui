package store

import "testing"

func TestMacroCRUD(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	m, err := s.SaveMacro(Macro{Name: "kill", Template: "uuid_kill <uuid> <cause=NORMAL_CLEARING>", Confirm: true})
	if err != nil {
		t.Fatal(err)
	}
	if m.ID == "" {
		t.Fatal("no id assigned on create")
	}

	m.Name = "kill call"
	m.Bg = true
	if saved, err := s.SaveMacro(m); err != nil || saved.ID != m.ID {
		t.Fatalf("update: %+v, %v", saved, err)
	}

	list, err := s.ListMacros()
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %+v, %v", list, err)
	}
	if got := list[0]; got.Name != "kill call" || !got.Bg || !got.Confirm || got.Template == "" {
		t.Fatalf("roundtrip mismatch: %+v", got)
	}

	if _, err := s.SaveMacro(Macro{ID: "missing", Name: "x", Template: "y"}); err == nil {
		t.Fatal("update of missing macro should fail")
	}
	if _, err := s.SaveMacro(Macro{Name: "", Template: "y"}); err == nil {
		t.Fatal("empty name should fail validation")
	}

	if err := s.DeleteMacro(m.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListMacros(); len(list) != 0 {
		t.Fatalf("still %d macros after delete", len(list))
	}
}
