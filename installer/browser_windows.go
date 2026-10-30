//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/lxn/walk"
	"golang.org/x/sys/windows/registry"
)

// The local desktop hands pages to a separately sandboxed LeaX Chromium
// process. Remote pages have no Node bridge and no path into the office server.
func openOfficeBrowser(target string) error {
	target, err := normalizeLeaXBrowserTarget(target)
	if err != nil {
		return err
	}
	launcher, err := installLauncher()
	if err != nil {
		return err
	}
	if err = registerLeaXBrowserProtocol(launcher); err != nil {
		progress("LeaX browser links could not be registered because another app owns that link. You can still open this page here.")
	}
	return runLeaXBrowser(target)
}

func registerLeaXBrowserProtocol(executable string) error {
	if executable == "" || strings.Contains(executable, `"`) {
		return errors.New("Invalid LeaX launcher path")
	}
	progID := `Software\Classes\` + leaxBrowserProtocol
	command := `"` + executable + `" --leax-browser "%1"`
	if key, err := registry.OpenKey(registry.CURRENT_USER, progID+`\shell\open\command`, registry.QUERY_VALUE); err == nil {
		old, _, readErr := key.GetStringValue("")
		key.Close()
		if readErr == nil && old != command {
			owned := strings.Contains(strings.ToLower(old), strings.ToLower(filepath.Join(root, "launchers")))
			if !owned {
				return errors.New("The LeaX browser URL is already assigned to another application; it was left unchanged")
			}
		}
	}
	key, _, err := registry.CreateKey(registry.CURRENT_USER, progID, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("Could not register the LeaX browser URL: %w", err)
	}
	if err = key.SetStringValue("", "URL:LeaX Office Browser"); err == nil {
		err = key.SetStringValue("URL Protocol", "")
	}
	key.Close()
	if err != nil {
		return err
	}
	commandKey, _, err := registry.CreateKey(registry.CURRENT_USER, progID+`\shell\open\command`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer commandKey.Close()
	return commandKey.SetStringValue("", command)
}

func handleLeaXBrowserCommand() bool {
	if len(os.Args) < 3 || os.Args[1] != "--leax-browser" {
		return false
	}
	raw := os.Args[2]
	var target string
	var err error
	if strings.HasPrefix(strings.ToLower(raw), leaxBrowserProtocol+":") {
		target, err = leaXBrowserProtocolTarget(raw)
	} else {
		target, err = normalizeLeaXBrowserTarget(raw)
	}
	if err == nil {
		err = runLeaXBrowser(target)
	}
	if err != nil {
		walk.MsgBox(nil, "LeaX AI Browser", err.Error(), walk.MsgBoxIconError)
	}
	return true
}

func runLeaXBrowser(target string) error {
	target, err := normalizeLeaXBrowserTarget(target)
	if err != nil {
		return err
	}
	if root == "" {
		root = filepath.Join(os.Getenv("LOCALAPPDATA"), "AIHeadquarters")
	}
	if root == "AIHeadquarters" || root == "" {
		return errors.New("Windows local app storage is unavailable")
	}
	state := readState()
	versionsRoot, err := filepath.Abs(filepath.Join(root, "versions"))
	if err != nil {
		return err
	}
	appRoot, err := filepath.Abs(state.App)
	if err != nil || !strings.HasPrefix(strings.ToLower(appRoot+string(os.PathSeparator)), strings.ToLower(versionsRoot+string(os.PathSeparator))) {
		return errors.New("The LeaX browser package is not installed yet. Open LeaX Office Pro and run Install / open office first.")
	}
	if err = verifyApplication(context.Background(), appRoot); err != nil {
		return fmt.Errorf("The LeaX browser package did not pass its local file check: %w", err)
	}
	browserExe := filepath.Join(appRoot, "browser", "electron.exe")
	if info, statErr := os.Stat(browserExe); statErr != nil || info.IsDir() {
		return errors.New("LeaX AI Browser is not included in this app update yet. Install the latest LeaX Office Pro version.")
	}
	profileRoot := filepath.Join(root, "browser-profile")
	if err = os.MkdirAll(profileRoot, 0700); err != nil {
		return errors.New("Windows could not create the protected LeaX browser profile")
	}
	bridgeToken, err := browserBridgeToken()
	if err != nil {
		return fmt.Errorf("Could not unlock the local browser permission bridge: %w", err)
	}
	command := exec.Command(browserExe)
	command.Dir = filepath.Join(appRoot, "browser")
	command.Env = append(os.Environ(), "LEAX_BROWSER_PROFILE_DIR="+profileRoot, "LEAX_BROWSER_TARGET="+target, "LEAX_BROWSER_BRIDGE_TOKEN="+bridgeToken)
	if err = command.Start(); err != nil {
		return fmt.Errorf("LeaX AI Browser could not start: %w", err)
	}
	return command.Process.Release()
}
