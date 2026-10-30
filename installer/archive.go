package main

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const setupEntryLimit uint64 = 150 * 1024 * 1024
const browserExecutableLimit uint64 = 512 * 1024 * 1024
const setupArchiveLimit uint64 = 1024 * 1024 * 1024
const setupArchiveEntries = 1000

// Only the bundled Chromium executable needs the larger application allowance.
// Node downloads retain the original per-file limit. Both paths are extracted
// into private staging directories and verified before installation/execution.
func extractSetupArchive(ctx context.Context, data []byte, destination string, application bool) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	if len(reader.File) > setupArchiveEntries {
		return errors.New("Setup archive contains too many entries")
	}
	var total uint64
	seen := make(map[string]bool)
	// Validate the entire directory before writing any files.
	for _, entry := range reader.File {
		if err := ctx.Err(); err != nil {
			return err
		}
		name := strings.ReplaceAll(entry.Name, "\\", "/")
		p := filepath.Join(destination, filepath.FromSlash(name))
		relative, err := filepath.Rel(destination, p)
		if err != nil || name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, ":") || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || entry.Mode()&os.ModeSymlink != 0 || (!entry.FileInfo().IsDir() && !entry.Mode().IsRegular()) {
			return fmt.Errorf("Unsafe archive path: %q", entry.Name)
		}
		key := strings.ToLower(relative)
		if seen[key] {
			return fmt.Errorf("Duplicate archive path: %q", entry.Name)
		}
		seen[key] = true
		limit := setupEntryLimit
		if application && name == "browser/electron.exe" {
			limit = browserExecutableLimit
		}
		if entry.UncompressedSize64 > limit {
			return fmt.Errorf("Archive entry exceeds size limit: %s (%d bytes; maximum %d)", entry.Name, entry.UncompressedSize64, limit)
		}
		if entry.UncompressedSize64 > setupArchiveLimit-total {
			return errors.New("Setup archive exceeds total size limit")
		}
		total += entry.UncompressedSize64
	}
	for _, entry := range reader.File {
		if err := ctx.Err(); err != nil {
			return err
		}
		p := filepath.Join(destination, filepath.FromSlash(strings.ReplaceAll(entry.Name, "\\", "/")))
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(p, 0700); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			return err
		}
		input, err := entry.Open()
		if err != nil {
			return err
		}
		output, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			input.Close()
			return err
		}
		n, copyErr := io.Copy(output, io.LimitReader(contextReader{ctx, input}, int64(entry.UncompressedSize64)+1))
		closeErr := output.Close()
		input.Close()
		if copyErr == nil && uint64(n) != entry.UncompressedSize64 {
			copyErr = errors.New("Archive entry size does not match its directory")
		}
		if copyErr != nil || closeErr != nil {
			os.Remove(p)
			if copyErr != nil {
				return copyErr
			}
			return closeErr
		}
	}
	return nil
}
