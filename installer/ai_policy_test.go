package main

import (
	"archive/zip"
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
