package esl

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/textproto"
	"strconv"
	"strings"
)

// Message is a single framed unit of the ESL wire protocol:
// MIME-style headers, optionally followed by a Content-Length body.
type Message struct {
	Headers textproto.MIMEHeader
	Body    []byte
}

func (m *Message) ContentType() string {
	return m.Headers.Get("Content-Type")
}

func (m *Message) ReplyText() string {
	return m.Headers.Get("Reply-Text")
}

func (m *Message) IsOK() bool {
	rt := m.ReplyText()
	return strings.HasPrefix(rt, "+OK") || strings.HasPrefix(string(m.Body), "+OK")
}

// Event is a decoded FreeSWITCH event. For text/event-json frames the body
// is parsed into Fields; multi-value keys like _body are kept as-is.
type Event struct {
	Fields map[string]string
	Body   string
}

func (e *Event) Name() string {
	if n := e.Fields["Event-Name"]; n != "CUSTOM" {
		return n
	}
	if sub := e.Fields["Event-Subclass"]; sub != "" {
		return "CUSTOM " + sub
	}
	return "CUSTOM"
}

func (e *Event) Get(key string) string { return e.Fields[key] }

func (e *Event) UUID() string { return e.Fields["Unique-ID"] }

func parseEventJSON(body []byte) (*Event, error) {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("esl: bad event json: %w", err)
	}
	ev := &Event{Fields: make(map[string]string, len(raw))}
	for k, v := range raw {
		switch val := v.(type) {
		case string:
			if k == "_body" {
				ev.Body = val
			} else {
				ev.Fields[k] = val
			}
		default:
			ev.Fields[k] = fmt.Sprint(val)
		}
	}
	return ev, nil
}

// readMessage reads one framed message from the wire.
func readMessage(r *bufio.Reader) (*Message, error) {
	tp := textproto.NewReader(r)
	headers, err := tp.ReadMIMEHeader()
	if err != nil {
		return nil, err
	}
	msg := &Message{Headers: headers}
	if cl := headers.Get("Content-Length"); cl != "" {
		n, err := strconv.Atoi(cl)
		if err != nil {
			return nil, fmt.Errorf("esl: bad Content-Length %q", cl)
		}
		body := make([]byte, n)
		if _, err := io.ReadFull(r, body); err != nil {
			return nil, err
		}
		msg.Body = body
	}
	return msg, nil
}
