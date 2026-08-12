package store

import "testing"

func TestProfileCRUD(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	p, err := s.CreateProfile(Profile{Name: "test", ESLHost: "10.0.0.1", UseSSH: true, SSHHost: "10.0.0.1", SSHUser: "root", SSHAuth: "agent"})
	if err != nil {
		t.Fatal(err)
	}
	if p.ID == "" || p.ESLPort != 8021 || p.SSHPort != 22 {
		t.Fatalf("defaults not applied: %+v", p)
	}

	p.Name = "renamed"
	if err := s.UpdateProfile(p); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetProfile(p.ID)
	if err != nil || got.Name != "renamed" {
		t.Fatalf("get after update: %+v, %v", got, err)
	}

	list, err := s.ListProfiles()
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v, %v", list, err)
	}

	if err := s.DeleteProfile(p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetProfile(p.ID); err != ErrNotFound {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestProfileValidation(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if _, err := s.CreateProfile(Profile{Name: "x"}); err == nil {
		t.Fatal("missing ESL host should fail")
	}
	if _, err := s.CreateProfile(Profile{Name: "x", ESLHost: "h", UseSSH: true, SSHHost: "h", SSHAuth: "bogus"}); err == nil {
		t.Fatal("bad ssh_auth should fail")
	}
}
