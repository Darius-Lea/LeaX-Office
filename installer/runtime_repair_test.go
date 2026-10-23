package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPreparedRuntimeRepairsDamagedCacheWithoutDeletingIt(t *testing.T) {
	root := t.TempDir()
	old := filepath.Join(root, "runtime")
	prepared := filepath.Join(root, "verified")
	os.Mkdir(old, 0700)
	os.Mkdir(prepared, 0700)
	os.WriteFile(filepath.Join(old, "runtime.exe"), []byte("damaged cached runtime"), 0600)
	os.WriteFile(filepath.Join(prepared, "runtime.exe"), []byte("verified replacement fixture"), 0600)
	if e := installPreparedDirectory(context.Background(), prepared, old); e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(filepath.Join(old, "runtime.exe"))
	if string(data) != "verified replacement fixture" {
		t.Fatal("prepared replacement was not installed")
	}
	archives, _ := filepath.Glob(old + "-incomplete-*")
	if len(archives) != 1 {
		t.Fatal("damaged cache must be retained for review")
	}
	data, _ = os.ReadFile(filepath.Join(archives[0], "runtime.exe"))
	if string(data) != "damaged cached runtime" {
		t.Fatal("previous cached files were changed")
	}
}

func TestRuntimeRepairCancellationAndUnexpectedFilesKeepExistingCache(t *testing.T) {
	root := t.TempDir()
	old := filepath.Join(root, "runtime")
	prepared := filepath.Join(root, "verified")
	os.Mkdir(prepared, 0700)
	os.WriteFile(old, []byte("unexpected file"), 0600)
	if e := installPreparedDirectory(context.Background(), prepared, old); e == nil {
		t.Fatal("an unexpected file cannot be replaced as a runtime directory")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e := installPreparedDirectory(ctx, prepared, filepath.Join(root, "fresh")); e != context.Canceled {
		t.Fatalf("cancelled repair returned %v", e)
	}
	if _, e := os.Stat(prepared); e != nil {
		t.Fatal("cancelled repair moved the prepared files")
	}
	data, _ := os.ReadFile(old)
	if string(data) != "unexpected file" {
		t.Fatal("unexpected cached file changed")
	}
}
