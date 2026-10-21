package main

import (
	"strings"
	"testing"
)

func TestPrivateCredentialPipe(t *testing.T) {
	key, e := decodePrivateSAM(strings.NewReader(`{"key":"synthetic-private-key-123456"}`))
	if e != nil || key != "synthetic-private-key-123456" {
		t.Fatal("valid private input was not parsed")
	}
	for _, input := range []string{`{"key":"short"}`, `{"key":"bad\ncredential-with-newline"}`, `{"key":"credential with spaces"}`, `{"key":42}`, strings.Repeat("x", 8193)} {
		if _, e := decodePrivateSAM(strings.NewReader(input)); e == nil {
			t.Fatal("invalid private key input accepted")
		}
	}
}
