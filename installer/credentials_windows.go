//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// GUI-free private pipe command. Keys never appear in arguments, stdout or logs.
func handleCredentialCommand() bool {
	if len(os.Args) < 2 || os.Args[1] != "--store-sam-key" {
		return false
	}
	err := storeCredentialInput()
	if err != nil {
		fmt.Fprintln(os.Stderr, "The private connection could not be saved for this Windows user.")
		os.Exit(1)
	}
	json.NewEncoder(os.Stdout).Encode(map[string]bool{"saved": true})
	return true
}
func storeCredentialInput() error {
	if len(os.Args) != 2 {
		return errors.New("Invalid credential command")
	}
	directory := os.Getenv("LOCALAPPDATA")
	if directory == "" || !filepath.IsAbs(directory) {
		return errors.New("Windows user folder unavailable")
	}
	root = filepath.Join(directory, "AIHeadquarters")
	key, e := decodePrivateSAM(os.Stdin)
	if e != nil {
		return e
	}
	if e = protectFolder(); e != nil {
		return e
	}
	protected, e := seal(key)
	if e != nil {
		return e
	}
	return writePrivate(filepath.Join(root, "sam-native.dpapi"), []byte(protected))
}
