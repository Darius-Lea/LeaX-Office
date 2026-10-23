package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Install only a completely prepared directory. Keep a damaged cache for review
// rather than deleting it, and restore it if the final rename fails. Business
// data never lives in these versioned runtime directories.
func installPreparedDirectory(ctx context.Context, prepared, destination string) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	from, e := filepath.Abs(prepared)
	if e != nil {
		return e
	}
	to, e := filepath.Abs(destination)
	if e != nil {
		return e
	}
	if from == to {
		return errors.New("Prepared runtime must be separate from the installed cache")
	}
	info, e := os.Lstat(from)
	if e != nil || !info.IsDir() {
		return errors.New("Prepared runtime directory is unavailable")
	}
	if info, e = os.Lstat(to); os.IsNotExist(e) {
		return os.Rename(from, to)
	} else if e != nil {
		return e
	} else if !info.IsDir() {
		return errors.New("Runtime cache is not a directory; it was left unchanged")
	}
	archive := to + "-incomplete-" + time.Now().Format("20060102-150405.000000000")
	if e = os.Rename(to, archive); e != nil {
		return fmt.Errorf("The damaged runtime could not be moved for repair; no files were deleted: %w", e)
	}
	if e = os.Rename(from, to); e != nil {
		if restoreError := os.Rename(archive, to); restoreError != nil {
			return fmt.Errorf("Runtime repair stopped; the previous cache is retained at %s. Close setup and try again", archive)
		}
		return fmt.Errorf("Runtime repair stopped and the previous cache was restored: %w", e)
	}
	return nil
}
