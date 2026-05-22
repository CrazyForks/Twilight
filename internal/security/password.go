package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"math/big"
	"strconv"
	"strings"
)

const DefaultPBKDF2Iterations = 100000

func RandomHex(bytesLen int) (string, error) {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func HashPassword(password string) (string, error) {
	salt, err := randomAlphaNum(16)
	if err != nil {
		return "", err
	}
	return hashPasswordWithSalt(password, salt, DefaultPBKDF2Iterations), nil
}

func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) == 2 {
		// Legacy Python format: salt$sha256(salt + password).
		salt := parts[0]
		sum := sha256.Sum256([]byte(salt + password))
		expected := salt + "$" + hex.EncodeToString(sum[:])
		return subtle.ConstantTimeCompare([]byte(expected), []byte(encoded)) == 1
	}
	if len(parts) != 3 {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 10000 || iterations > 1000000 {
		return false
	}
	expected := hashPasswordWithSalt(password, parts[0], iterations)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(encoded)) == 1
}

func hashPasswordWithSalt(password, salt string, iterations int) string {
	dk := pbkdf2SHA256([]byte(password), []byte(salt), iterations, 32)
	return fmt.Sprintf("%s$%d$%s", salt, iterations, hex.EncodeToString(dk))
}

func pbkdf2SHA256(password, salt []byte, iterations, keyLen int) []byte {
	hLen := sha256.Size
	numBlocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, numBlocks*hLen)
	for block := 1; block <= numBlocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iterations; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

func randomAlphaNum(length int) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	var b strings.Builder
	b.Grow(length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		b.WriteByte(alphabet[n.Int64()])
	}
	return b.String(), nil
}
