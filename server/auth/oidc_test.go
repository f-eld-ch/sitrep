package auth

import (
	"testing"

	"github.com/gorilla/securecookie"
)

func TestDeriveSecureCookieKeys(t *testing.T) {
	hashKey, blockKey := deriveSecureCookieKeys("test-key")
	if len(hashKey) != 32 {
		t.Fatalf("expected 32-byte hash key, got %d", len(hashKey))
	}
	if len(blockKey) != 32 {
		t.Fatalf("expected 32-byte block key, got %d", len(blockKey))
	}
	if string(hashKey) == string(blockKey) {
		t.Fatal("expected distinct hash and block keys")
	}

	hashKey2, blockKey2 := deriveSecureCookieKeys("test-key")
	if string(hashKey) != string(hashKey2) || string(blockKey) != string(blockKey2) {
		t.Fatal("expected deterministic derived keys")
	}
}

func TestDerivedKeysWorkWithSecureCookie(t *testing.T) {
	hashKey, blockKey := deriveSecureCookieKeys("another-test-key")
	cookie := securecookie.New(hashKey, blockKey)

	encoded, err := cookie.Encode("id_token", "value")
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}

	var decoded string
	if err := cookie.Decode("id_token", encoded, &decoded); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if decoded != "value" {
		t.Fatalf("expected decoded value %q, got %q", "value", decoded)
	}
}
