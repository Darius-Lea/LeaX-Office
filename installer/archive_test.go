package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }

func archiveFixture(t *testing.T, names ...string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	for _, name := range names {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = file.Write([]byte("fixture")); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSetupExtractsBundledBrowserAboveOldLimit(t *testing.T) {
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	file, err := writer.Create("browser/electron.exe")
	if err != nil {
		t.Fatal(err)
	}
	const size = int64(setupEntryLimit) + 1
	if _, err = io.CopyN(file, zeroReader{}, size); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err = extractSetupArchive(context.Background(), buf.Bytes(), dir, true); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "browser", "electron.exe"))
	if err != nil || info.Size() != size {
		t.Fatalf("incomplete browser extraction: %v", err)
	}
	if err = extractSetupArchive(context.Background(), buf.Bytes(), t.TempDir(), false); err == nil || !strings.Contains(err.Error(), "size limit") {
		t.Fatalf("Node runtime limit changed: %v", err)
	}
}

func TestSetupRejectsOversizeBeforeWriting(t *testing.T) {
	for _, name := range []string{"browser/electron.exe", "browser/other.exe", "runtime/server.mjs"} {
		data := archiveFixture(t, name)
		at := bytes.Index(data, []byte("PK\x01\x02"))
		size := uint32(setupEntryLimit + 1)
		if name == "browser/electron.exe" {
			size = uint32(browserExecutableLimit + 1)
		}
		binary.LittleEndian.PutUint32(data[at+24:], size)
		dir := t.TempDir()
		err := extractSetupArchive(context.Background(), data, dir, true)
		if err == nil || !strings.Contains(err.Error(), name) {
			t.Fatalf("missing filename/limit error: %v", err)
		}
		files, _ := os.ReadDir(dir)
		if len(files) != 0 {
			t.Fatal("oversized archive wrote files before validation")
		}
	}
}

func TestSetupRejectsUnsafeAndDuplicatePaths(t *testing.T) {
	for _, names := range [][]string{{"../outside"}, {`..\outside`}, {"/absolute"}, {"C:/absolute"}, {"same", "SAME"}} {
		if err := extractSetupArchive(context.Background(), archiveFixture(t, names...), t.TempDir(), true); err == nil {
			t.Fatalf("accepted paths: %v", names)
		}
	}
}

func TestSetupRejectsTotalSizeAndExcessEntries(t *testing.T) {
	names := []string{"a", "b", "c", "d", "e", "f", "g"}
	data := archiveFixture(t, names...)
	for offset := 0; ; {
		at := bytes.Index(data[offset:], []byte("PK\x01\x02"))
		if at < 0 {
			break
		}
		at += offset
		binary.LittleEndian.PutUint32(data[at+24:], uint32(setupEntryLimit))
		offset = at + 46
	}
	if err := extractSetupArchive(context.Background(), data, t.TempDir(), true); err == nil || !strings.Contains(err.Error(), "total size") {
		t.Fatalf("missing total size error: %v", err)
	}
	names = make([]string, setupArchiveEntries+1)
	for i := range names {
		names[i] = strings.Repeat("x", i+1)
	}
	if err := extractSetupArchive(context.Background(), archiveFixture(t, names...), t.TempDir(), true); err == nil || !strings.Contains(err.Error(), "too many") {
		t.Fatalf("missing count error: %v", err)
	}
}

func TestSetupCancellationAndExistingFiles(t *testing.T) {
	data := archiveFixture(t, "keep")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := extractSetupArchive(ctx, data, t.TempDir(), true); err != context.Canceled {
		t.Fatalf("ignored cancellation: %v", err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "keep")
	if err := os.WriteFile(path, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := extractSetupArchive(context.Background(), data, dir, true); err == nil {
		t.Fatal("overwrote existing file")
	}
	actual, _ := os.ReadFile(path)
	if string(actual) != "existing" {
		t.Fatal("changed existing file")
	}
}

// Run against the exact payload before release; also validates the real browser
// executable's CRC and every production file hash after using installer code.
func TestSetupPackagedApplication(t *testing.T) {
	path := os.Getenv("LEAX_TEST_APPLICATION_ARCHIVE")
	if path == "" {
		t.Skip("set LEAX_TEST_APPLICATION_ARCHIVE to verify a built payload")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err = extractSetupArchive(context.Background(), data, dir, true); err != nil {
		t.Fatal(err)
	}
	if err = verifyApplication(context.Background(), dir); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "browser", "electron.exe"))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("Windows browser extracted and manifest verified: %d bytes", info.Size())
}
