//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Prefer an existing signed browser's app mode. This does not install a browser,
// change browser security options, read profiles, or own the user's browser process.
func openOfficeBrowser(target string) error {
	arguments, e := officeBrowserArguments(target)
	if e != nil {
		return e
	}
	seen := map[string]bool{}
	for _, browser := range []struct{ vendor, path string }{{"Microsoft", "Edge"}, {"Google", "Chrome"}} {
		for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
			if base == "" || !filepath.IsAbs(base) {
				continue
			}
			executable := "chrome.exe"
			if browser.path == "Edge" {
				executable = "msedge.exe"
			}
			candidate := filepath.Join(base, browser.vendor, browser.path, "Application", executable)
			key := strings.ToLower(candidate)
			if seen[key] {
				continue
			}
			seen[key] = true
			info, e := os.Stat(candidate)
			if e != nil || !info.Mode().IsRegular() {
				continue
			}
			if e = verifySignedExecutable(candidate); e != nil {
				continue
			}
			command := exec.Command(candidate, arguments...)
			hidden(command)
			if e = command.Start(); e != nil {
				continue
			}
			command.Process.Release()
			return nil
		}
	}
	// Other browser brands remain usable through the Windows default URL handler.
	return openItem(target)
}
