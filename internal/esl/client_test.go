package esl

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

// fakeServer speaks just enough of the ESL wire protocol for the tests.
type fakeServer struct {
	ln       net.Listener
	password string
}

func newFakeServer(t *testing.T) *fakeServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &fakeServer{ln: ln, password: "ClueCon"}
	go s.serve()
	t.Cleanup(func() { ln.Close() })
	return s
}

func (s *fakeServer) addr() string { return s.ln.Addr().String() }

func (s *fakeServer) serve() {
	for {
		conn, err := s.ln.Accept()
		if err != nil {
			return
		}
		go s.handle(conn)
	}
}

func (s *fakeServer) handle(conn net.Conn) {
	defer conn.Close()
	br := bufio.NewReader(conn)
	fmt.Fprint(conn, "Content-Type: auth/request\n\n")

	readCmd := func() string {
		var lines []string
		for {
			line, err := br.ReadString('\n')
			if err != nil {
				return ""
			}
			line = strings.TrimRight(line, "\n")
			if line == "" {
				if len(lines) > 0 {
					return strings.Join(lines, "\n")
				}
				continue
			}
			lines = append(lines, line)
		}
	}

	cmd := readCmd()
	if cmd != "auth "+s.password {
		fmt.Fprint(conn, "Content-Type: command/reply\nReply-Text: -ERR invalid\n\n")
		return
	}
	fmt.Fprint(conn, "Content-Type: command/reply\nReply-Text: +OK accepted\n\n")

	for {
		cmd := readCmd()
		switch {
		case cmd == "":
			return
		case strings.HasPrefix(cmd, "api "):
			body := "response to: " + strings.TrimPrefix(cmd, "api ")
			fmt.Fprintf(conn, "Content-Type: api/response\nContent-Length: %d\n\n%s", len(body), body)
		case strings.HasPrefix(cmd, "bgapi "):
			fmt.Fprint(conn, "Content-Type: command/reply\nReply-Text: +OK Job-UUID: test-job-1\nJob-UUID: test-job-1\n\n")
		case strings.HasPrefix(cmd, "event json"):
			fmt.Fprint(conn, "Content-Type: command/reply\nReply-Text: +OK event listener enabled json\n\n")
			// Push one event right after the subscription is confirmed.
			ev := `{"Event-Name":"HEARTBEAT","Core-UUID":"abc","Unique-ID":"u-1"}`
			fmt.Fprintf(conn, "Content-Type: text/event-json\nContent-Length: %d\n\n%s", len(ev), ev)
		}
	}
}

func dialTest(t *testing.T, s *fakeServer) *Client {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, err := Dial(ctx, s.addr(), s.password)
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

func TestAuthAndAPI(t *testing.T) {
	c := dialTest(t, newFakeServer(t))
	out, err := c.API(context.Background(), "status")
	if err != nil {
		t.Fatalf("API: %v", err)
	}
	if out != "response to: status" {
		t.Fatalf("unexpected body: %q", out)
	}
}

func TestAuthFailure(t *testing.T) {
	s := newFakeServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := Dial(ctx, s.addr(), "wrong")
	if err != ErrAuthFailed {
		t.Fatalf("want ErrAuthFailed, got %v", err)
	}
}

func TestBgAPI(t *testing.T) {
	c := dialTest(t, newFakeServer(t))
	job, err := c.BgAPI(context.Background(), "originate ...")
	if err != nil {
		t.Fatalf("BgAPI: %v", err)
	}
	if job != "test-job-1" {
		t.Fatalf("unexpected job uuid: %q", job)
	}
}

func TestSubscribeAndEvent(t *testing.T) {
	c := dialTest(t, newFakeServer(t))
	if err := c.Subscribe(context.Background(), "HEARTBEAT"); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	select {
	case ev := <-c.Events():
		if ev.Name() != "HEARTBEAT" || ev.UUID() != "u-1" {
			t.Fatalf("unexpected event: %+v", ev)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestConcurrentAPI(t *testing.T) {
	c := dialTest(t, newFakeServer(t))
	done := make(chan error, 20)
	for i := 0; i < 20; i++ {
		go func(i int) {
			cmd := fmt.Sprintf("show channels %d", i)
			out, err := c.API(context.Background(), cmd)
			if err == nil && out != "response to: "+cmd {
				err = fmt.Errorf("mismatched reply for %q: %q", cmd, out)
			}
			done <- err
		}(i)
	}
	for i := 0; i < 20; i++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
}

func TestServerDisconnect(t *testing.T) {
	s := newFakeServer(t)
	c := dialTest(t, s)
	disconnected := make(chan error, 1)
	c.OnDisconnect = func(err error) { disconnected <- err }
	s.ln.Close() // no new conns; kill existing by closing via API path
	c.conn.Close()
	select {
	case <-disconnected:
	case <-time.After(3 * time.Second):
		t.Fatal("OnDisconnect not called")
	}
	if _, err := c.API(context.Background(), "status"); err == nil {
		t.Fatal("API after disconnect should fail")
	}
}
