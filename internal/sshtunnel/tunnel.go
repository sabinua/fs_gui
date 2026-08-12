// Package sshtunnel dials TCP endpoints through an SSH connection, so the
// ESL client can reach a FreeSWITCH that only listens on localhost.
package sshtunnel

import (
	"context"
	"fmt"
	"net"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Config describes how to reach and authenticate with the SSH host.
type Config struct {
	Host string // host or host:port; port 22 assumed if missing
	User string

	// Auth: exactly one of these should be set; tried in this order.
	Password       string
	PrivateKeyPEM  []byte // optional key material
	PrivateKeyPath string // or a path to the key file
	KeyPassphrase  string
	UseAgent       bool // use $SSH_AUTH_SOCK

	// KnownHostsPath enables strict host key checking against the given
	// file (e.g. ~/.ssh/known_hosts). Empty disables verification —
	// acceptable for a first connection flow where the UI asks the user.
	KnownHostsPath string

	Timeout time.Duration
}

// Tunnel is an established SSH connection that can dial remote endpoints.
type Tunnel struct {
	client *ssh.Client
}

// Open establishes the SSH connection.
func Open(ctx context.Context, cfg Config) (*Tunnel, error) {
	addr := cfg.Host
	if _, _, err := net.SplitHostPort(addr); err != nil {
		addr = net.JoinHostPort(addr, "22")
	}

	auth, err := buildAuth(cfg)
	if err != nil {
		return nil, err
	}

	hostKeyCallback := ssh.InsecureIgnoreHostKey() //nolint:gosec // see Config.KnownHostsPath
	if cfg.KnownHostsPath != "" {
		cb, err := knownhosts.New(cfg.KnownHostsPath)
		if err != nil {
			return nil, fmt.Errorf("sshtunnel: known_hosts: %w", err)
		}
		hostKeyCallback = cb
	}

	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 15 * time.Second
	}

	clientCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            auth,
		HostKeyCallback: hostKeyCallback,
		Timeout:         timeout,
	}

	d := net.Dialer{Timeout: timeout}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("sshtunnel: dial %s: %w", addr, err)
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, clientCfg)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("sshtunnel: handshake: %w", err)
	}
	return &Tunnel{client: ssh.NewClient(sshConn, chans, reqs)}, nil
}

func buildAuth(cfg Config) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	if cfg.UseAgent {
		sock := os.Getenv("SSH_AUTH_SOCK")
		if sock == "" {
			return nil, fmt.Errorf("sshtunnel: SSH_AUTH_SOCK is not set")
		}
		conn, err := net.Dial("unix", sock)
		if err != nil {
			return nil, fmt.Errorf("sshtunnel: ssh-agent: %w", err)
		}
		methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
	}

	keyPEM := cfg.PrivateKeyPEM
	if len(keyPEM) == 0 && cfg.PrivateKeyPath != "" {
		b, err := os.ReadFile(cfg.PrivateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("sshtunnel: read key: %w", err)
		}
		keyPEM = b
	}
	if len(keyPEM) > 0 {
		var signer ssh.Signer
		var err error
		if cfg.KeyPassphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyPEM, []byte(cfg.KeyPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyPEM)
		}
		if err != nil {
			return nil, fmt.Errorf("sshtunnel: parse key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if cfg.Password != "" {
		methods = append(methods, ssh.Password(cfg.Password))
	}

	if len(methods) == 0 {
		return nil, fmt.Errorf("sshtunnel: no authentication method configured")
	}
	return methods, nil
}

// Dial opens a TCP connection to addr on the remote side of the tunnel.
// The returned net.Conn can be handed straight to esl.NewClient.
func (t *Tunnel) Dial(ctx context.Context, addr string) (net.Conn, error) {
	type result struct {
		conn net.Conn
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		conn, err := t.client.Dial("tcp", addr)
		ch <- result{conn, err}
	}()
	select {
	case r := <-ch:
		return r.conn, r.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Close terminates the SSH connection and every forwarded stream.
func (t *Tunnel) Close() error { return t.client.Close() }
