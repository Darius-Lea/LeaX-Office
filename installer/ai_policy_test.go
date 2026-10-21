package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAutomaticModelAndArchiveSafety(t *testing.T) {
	for _, c := range []struct {
		ram  uint64
		want string
	}{{4, "qwen3:0.6b"}, {8, "qwen3:1.7b"}, {16, "qwen3:4b"}} {
		got, e := starterModel(c.ram * 1024 * 1024 * 1024)
		if e != nil || got != c.want {
			t.Fatalf("memory policy: %s %v", got, e)
		}
	}
	if _, e := starterModel(2 * 1024 * 1024 * 1024); e == nil {
		t.Fatal("unsupported hardware cannot claim configured AI")
	}
	root := t.TempDir()
	for _, name := range []string{"../escape.exe", "C:/escape.exe", "..\\escape.exe", "/escape.exe"} {
		archive := filepath.Join(root, "bad.zip")
		f, _ := os.Create(archive)
		z := zip.NewWriter(f)
		entry, _ := z.Create(name)
		entry.Write([]byte("untrusted"))
		z.Close()
		f.Close()
		if e := extractAIArchive(archive, filepath.Join(root, "out")); e == nil {
			t.Fatalf("unsafe archive path accepted: %s", name)
		}
	}
	p := filepath.Join(root, "runtime")
	os.WriteFile(p, []byte("not a verified runtime"), 0600)
	if checkHash(p, ollamaArchiveSHA) == nil {
		t.Fatal("unverified runtime accepted")
	}
}

func TestProductionManifestAndCancellation(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{}
	for _, name := range []string{"runtime/server.mjs", "public/index.html", "scripts/configure-local-ai.mjs", "vendor/three.module.js"} {
		p := filepath.Join(root, filepath.FromSlash(name))
		os.MkdirAll(filepath.Dir(p), 0700)
		os.WriteFile(p, []byte("production fixture"), 0600)
		files[name], _ = hashFile(p)
	}
	data, _ := json.Marshal(map[string]any{"format": 1, "entry": "runtime/server.mjs", "files": files})
	os.WriteFile(filepath.Join(root, "application-manifest.json"), data, 0600)
	if e := verifyApplication(context.Background(), root); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(filepath.Join(root, "runtime", "server.mjs"), []byte("corrupted"), 0600)
	if e := verifyApplication(context.Background(), root); e == nil {
		t.Fatal("corrupted application accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e := verifyApplication(ctx, root); e != context.Canceled {
		t.Fatalf("cancelled verification returned %v", e)
	}
	if _, e := hashFileContext(ctx, filepath.Join(root, "runtime", "server.mjs")); e != context.Canceled {
		t.Fatalf("cancelled hashing returned %v", e)
	}
}
