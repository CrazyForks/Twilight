package security

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestPasswordHashRoundTripAndLegacy(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Fatal("new password hash did not verify")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("wrong password verified")
	}

	salt := "abc123"
	sum := sha256.Sum256([]byte(salt + "legacy"))
	legacy := salt + "$" + hex.EncodeToString(sum[:])
	if !VerifyPassword("legacy", legacy) {
		t.Fatal("legacy hash did not verify")
	}
}
