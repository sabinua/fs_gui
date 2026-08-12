package store

import "github.com/zalando/go-keyring"

// Secrets stores per-profile credentials in the OS keychain
// (Secret Service on Linux, Keychain on macOS, Credential Manager on Windows).
const keyringService = "fsgui"

type SecretKind string

const (
	SecretESLPassword   SecretKind = "esl_password"
	SecretSSHPassword   SecretKind = "ssh_password"
	SecretSSHPassphrase SecretKind = "ssh_passphrase"
)

func secretKey(profileID string, kind SecretKind) string {
	return profileID + ":" + string(kind)
}

func SetSecret(profileID string, kind SecretKind, value string) error {
	if value == "" {
		return DeleteSecret(profileID, kind)
	}
	return keyring.Set(keyringService, secretKey(profileID, kind), value)
}

// GetSecret returns "" (not an error) when the secret is absent.
func GetSecret(profileID string, kind SecretKind) (string, error) {
	v, err := keyring.Get(keyringService, secretKey(profileID, kind))
	if err == keyring.ErrNotFound {
		return "", nil
	}
	return v, err
}

func DeleteSecret(profileID string, kind SecretKind) error {
	err := keyring.Delete(keyringService, secretKey(profileID, kind))
	if err == keyring.ErrNotFound {
		return nil
	}
	return err
}

// DeleteAllSecrets removes every secret kind for a profile (used on delete).
func DeleteAllSecrets(profileID string) {
	for _, k := range []SecretKind{SecretESLPassword, SecretSSHPassword, SecretSSHPassphrase} {
		_ = DeleteSecret(profileID, k)
	}
}
