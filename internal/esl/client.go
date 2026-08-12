// Package esl implements an inbound FreeSWITCH Event Socket client.
//
// The client owns a single TCP connection (optionally established through an
// SSH tunnel by the caller — anything satisfying net.Conn works), performs
// auth, and multiplexes synchronous command replies with the asynchronous
// event stream. Command replies on ESL always arrive in request order, so a
// FIFO of waiters is enough to pair them.
package esl

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

var (
	ErrAuthFailed = errors.New("esl: authentication failed")
	ErrClosed     = errors.New("esl: connection closed")
)

const defaultTimeout = 10 * time.Second

// Client is an inbound ESL connection. Safe for concurrent use.
type Client struct {
	conn net.Conn
	br   *bufio.Reader

	writeMu sync.Mutex // serializes writes
	queueMu sync.Mutex // guards waiters
	waiters []chan *Message

	events  chan *Event
	closed  chan struct{}
	closeMu sync.Once
	err     error // set before closed is closed

	// OnDisconnect, if set, is called once when the read loop terminates
	// (network error, server shutdown, or Close). Reconnect policy lives
	// in the session layer, not here.
	OnDisconnect func(err error)
}

// Dial connects to a FreeSWITCH ESL socket over TCP and authenticates.
func Dial(ctx context.Context, addr, password string) (*Client, error) {
	d := net.Dialer{}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	return NewClient(ctx, conn, password)
}

// NewClient authenticates over an already-established connection
// (e.g. one opened through an SSH tunnel).
func NewClient(ctx context.Context, conn net.Conn, password string) (*Client, error) {
	c := &Client{
		conn:   conn,
		br:     bufio.NewReaderSize(conn, 64*1024),
		events: make(chan *Event, 1024),
		closed: make(chan struct{}),
	}
	if err := c.authenticate(ctx, password); err != nil {
		conn.Close()
		return nil, err
	}
	go c.readLoop()
	return c, nil
}

func (c *Client) authenticate(ctx context.Context, password string) error {
	deadline := time.Now().Add(defaultTimeout)
	if d, ok := ctx.Deadline(); ok {
		deadline = d
	}
	c.conn.SetDeadline(deadline)
	defer c.conn.SetDeadline(time.Time{})

	msg, err := readMessage(c.br)
	if err != nil {
		return fmt.Errorf("esl: waiting for auth/request: %w", err)
	}
	if msg.ContentType() != "auth/request" {
		return fmt.Errorf("esl: unexpected greeting %q", msg.ContentType())
	}
	if _, err := fmt.Fprintf(c.conn, "auth %s\n\n", password); err != nil {
		return err
	}
	reply, err := readMessage(c.br)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(reply.ReplyText(), "+OK") {
		return ErrAuthFailed
	}
	return nil
}

// Events returns the stream of subscribed events. The channel is closed
// when the connection terminates.
func (c *Client) Events() <-chan *Event { return c.events }

// Err returns the terminal connection error after the client has closed.
func (c *Client) Err() error {
	select {
	case <-c.closed:
		return c.err
	default:
		return nil
	}
}

// Close terminates the connection.
func (c *Client) Close() error {
	return c.shutdown(ErrClosed)
}

func (c *Client) shutdown(err error) error {
	c.closeMu.Do(func() {
		c.err = err
		c.conn.Close()
		close(c.closed)
		c.queueMu.Lock()
		for _, w := range c.waiters {
			close(w)
		}
		c.waiters = nil
		c.queueMu.Unlock()
		close(c.events)
		if c.OnDisconnect != nil {
			go c.OnDisconnect(err)
		}
	})
	return nil
}

func (c *Client) readLoop() {
	for {
		msg, err := readMessage(c.br)
		if err != nil {
			c.shutdown(err)
			return
		}
		switch msg.ContentType() {
		case "command/reply", "api/response":
			c.queueMu.Lock()
			var w chan *Message
			if len(c.waiters) > 0 {
				w = c.waiters[0]
				c.waiters = c.waiters[1:]
			}
			c.queueMu.Unlock()
			if w != nil {
				w <- msg
			}
		case "text/event-json":
			ev, err := parseEventJSON(msg.Body)
			if err != nil {
				continue // malformed event: drop, keep the connection
			}
			select {
			case c.events <- ev:
			default:
				// Consumer is stalled; dropping is safer than blocking
				// the read loop and timing out every pending command.
			}
		case "text/disconnect-notice":
			c.shutdown(fmt.Errorf("esl: server disconnected: %s", strings.TrimSpace(string(msg.Body))))
			return
		}
	}
}

// sendRecv writes a raw command and waits for its paired reply.
func (c *Client) sendRecv(ctx context.Context, cmd string) (*Message, error) {
	select {
	case <-c.closed:
		return nil, c.err
	default:
	}

	w := make(chan *Message, 1)

	// Enqueue the waiter and write while holding writeMu so that the
	// waiter order matches the wire order of commands.
	c.writeMu.Lock()
	c.queueMu.Lock()
	c.waiters = append(c.waiters, w)
	c.queueMu.Unlock()
	_, err := c.conn.Write([]byte(cmd + "\n\n"))
	c.writeMu.Unlock()
	if err != nil {
		c.shutdown(err)
		return nil, err
	}

	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultTimeout)
		defer cancel()
	}
	select {
	case msg, ok := <-w:
		if !ok {
			return nil, c.err
		}
		return msg, nil
	case <-ctx.Done():
		// The reply will still arrive and be delivered to a stale waiter;
		// the connection is out of sync, so drop it.
		c.shutdown(fmt.Errorf("esl: command timeout: %w", ctx.Err()))
		return nil, ctx.Err()
	}
}

// API runs a blocking "api" command and returns the response body.
func (c *Client) API(ctx context.Context, command string) (string, error) {
	msg, err := c.sendRecv(ctx, "api "+command)
	if err != nil {
		return "", err
	}
	body := string(msg.Body)
	if strings.HasPrefix(body, "-ERR") {
		return "", fmt.Errorf("esl: %s", strings.TrimSpace(body))
	}
	return body, nil
}

// BgAPI runs a command via "bgapi" and returns the Job-UUID immediately.
// Completion arrives as a BACKGROUND_JOB event with that UUID.
func (c *Client) BgAPI(ctx context.Context, command string) (jobUUID string, err error) {
	msg, err := c.sendRecv(ctx, "bgapi "+command)
	if err != nil {
		return "", err
	}
	if !msg.IsOK() {
		return "", fmt.Errorf("esl: bgapi rejected: %s", msg.ReplyText())
	}
	return msg.Headers.Get("Job-UUID"), nil
}

// Subscribe registers for the given event names in JSON format,
// e.g. Subscribe(ctx, "CHANNEL_CREATE", "CHANNEL_HANGUP_COMPLETE") or
// Subscribe(ctx, "CUSTOM", "callcenter::info") or Subscribe(ctx, "ALL").
func (c *Client) Subscribe(ctx context.Context, names ...string) error {
	msg, err := c.sendRecv(ctx, "event json "+strings.Join(names, " "))
	if err != nil {
		return err
	}
	if !msg.IsOK() {
		return fmt.Errorf("esl: event subscribe failed: %s", msg.ReplyText())
	}
	return nil
}

// NoEvents cancels the entire event subscription; combine with Subscribe
// to narrow a previously widened subscription.
func (c *Client) NoEvents(ctx context.Context) error {
	msg, err := c.sendRecv(ctx, "noevents")
	if err != nil {
		return err
	}
	if !msg.IsOK() {
		return fmt.Errorf("esl: noevents failed: %s", msg.ReplyText())
	}
	return nil
}

// Filter adds a server-side event filter, e.g. Filter(ctx, "Unique-ID", uuid).
func (c *Client) Filter(ctx context.Context, header, value string) error {
	msg, err := c.sendRecv(ctx, fmt.Sprintf("filter %s %s", header, value))
	if err != nil {
		return err
	}
	if !msg.IsOK() {
		return fmt.Errorf("esl: filter failed: %s", msg.ReplyText())
	}
	return nil
}
