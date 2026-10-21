package main

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const ollamaVersion = "0.40.7"

// Pinned from the official v0.40.7 release asset digest and sha256sum.txt.
const ollamaArchiveSHA = "e6527768c53e85ec4596495fb0f035ef07f437b4b591ebc3581684699a4668f4"
const ollamaArchiveURL = "https://github.com/ollama/ollama/releases/download/v" + ollamaVersion + "/ollama-windows-amd64.zip"
const managedAIPort = "11435"

func starterModel(memory uint64) (string, error) {
	if memory < 4*1024*1024*1024 {
		return "", errors.New("This device has less than 4 GB RAM. Local AI cannot be configured reliably; research records are kept. Try a computer with more memory")
	}
	if memory < 8*1024*1024*1024 {
		return "qwen3:0.6b", nil
	}
	if memory < 16*1024*1024*1024 {
		return "qwen3:1.7b", nil
	}
	return "qwen3:4b", nil
}

// Stream from disk to disk; a multi-gigabyte runtime must never be loaded into RAM.
type contextReader struct {
	ctx   context.Context
	input io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if e := r.ctx.Err(); e != nil {
		return 0, e
	}
	return r.input.Read(p)
}
func extractAIArchive(archive, destination string) error {
	return extractAIArchiveContext(context.Background(), archive, destination)
}
func extractAIArchiveContext(ctx context.Context, archive, destination string) error {
	r, e := zip.OpenReader(archive)
	if e != nil {
		return e
	}
	defer r.Close()
	var total uint64
	for _, entry := range r.File {
		if e := ctx.Err(); e != nil {
			return e
		}
		name := strings.ReplaceAll(entry.Name, "\\", "/")
		if strings.HasPrefix(name, "/") || strings.Contains(name, ":") {
			return errors.New("Unsafe AI runtime archive path")
		}
		p := filepath.Join(destination, filepath.FromSlash(name))
		relative, e := filepath.Rel(destination, p)
		if e != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || entry.Mode()&os.ModeSymlink != 0 {
			return errors.New("Unsafe AI runtime archive path")
		}
		total += entry.UncompressedSize64
		if total > 12*1024*1024*1024 || entry.UncompressedSize64 > 4*1024*1024*1024 {
			return errors.New("AI runtime archive exceeds its size limit")
		}
		if entry.FileInfo().IsDir() {
			if e = os.MkdirAll(p, 0700); e != nil {
				return e
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return e
		}
		in, e := entry.Open()
		if e != nil {
			return e
		}
		out, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			in.Close()
			return e
		}
		_, copyErr := io.Copy(out, io.LimitReader(contextReader{ctx, in}, int64(entry.UncompressedSize64)+1))
		closeErr := out.Close()
		in.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}
func hashFile(path string) (string, error) { return hashFileContext(context.Background(), path) }
func hashFileContext(ctx context.Context, path string) (string, error) {
	f, e := os.Open(path)
	if e != nil {
		return "", e
	}
	defer f.Close()
	h := sha256.New()
	if _, e = io.Copy(h, contextReader{ctx, f}); e != nil {
		return "", e
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func checkHash(path, expected string) error {
	return checkHashContext(context.Background(), path, expected)
}
func checkHashContext(ctx context.Context, path, expected string) error {
	sum, e := hashFileContext(ctx, path)
	if e != nil {
		return e
	}
	if sum != expected {
		return fmt.Errorf("AI runtime checksum mismatch; affected file was not executed")
	}
	return nil
}

// Production packages carry an integrity manifest; this does not hide executable code.
func verifyApplication(ctx context.Context, directory string) error {
	data, e := os.ReadFile(filepath.Join(directory, "application-manifest.json"))
	if e != nil {
		return e
	}
	var manifest struct {
		Format int               `json:"format"`
		Entry  string            `json:"entry"`
		Files  map[string]string `json:"files"`
	}
	if e = json.Unmarshal(data, &manifest); e != nil {
		return e
	}
	if manifest.Format != 1 || manifest.Entry != "runtime/server.mjs" || len(manifest.Files) == 0 || len(manifest.Files) > 1000 {
		return errors.New("Incomplete application package")
	}
	for _, required := range []string{"runtime/server.mjs", "public/index.html", "scripts/configure-local-ai.mjs", "vendor/three.module.js"} {
		if manifest.Files[required] == "" {
			return errors.New("Application package is missing a required component")
		}
	}
	for name, want := range manifest.Files {
		if e = ctx.Err(); e != nil {
			return e
		}
		normalized := strings.ReplaceAll(name, "\\", "/")
		if strings.HasPrefix(normalized, "/") || strings.Contains(normalized, ":") {
			return errors.New("Unsafe application manifest path")
		}
		p := filepath.Join(directory, filepath.FromSlash(normalized))
		rel, e := filepath.Rel(directory, p)
		if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return errors.New("Unsafe application manifest path")
		}
		sum, e := hashFileContext(ctx, p)
		if e != nil {
			return e
		}
		if sum != want {
			return errors.New("Application file verification failed; the affected version was not started")
		}
	}
	return nil
}
