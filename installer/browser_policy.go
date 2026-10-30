package main

import (
	"errors"
	"net/url"
	"strings"
)

// The browser app window is restricted to this app's local origin. No shell is used.
func officeBrowserArguments(target string) ([]string, error) {
	u, e := url.Parse(target)
	if e != nil || len(target) > 2048 || u.Scheme != "http" || u.Host != "127.0.0.1:4310" || u.Path != "/" || u.User != nil || u.RawQuery != "" {
		return nil, errors.New("The office window must use the private local office address")
	}
	return []string{"--app=" + target, "--window-size=1440,960"}, nil
}

const leaxBrowserProtocol = "leaxoffice"

// normalizeLeaXBrowserTarget accepts ordinary web URLs and address-bar search
// text. It never accepts file:, javascript:, embedded credentials, or other
// non-web schemes from a page.
func normalizeLeaXBrowserTarget(raw string) (string, error) {
	target := strings.TrimSpace(raw)
	if target == "" || len(target) > 2048 {
		return "", errors.New("Enter a website address or search phrase")
	}
	if !strings.Contains(target, "://") {
		if strings.ContainsAny(target, " \t\r\n") || !strings.Contains(target, ".") {
			return "https://duckduckgo.com/?q=" + url.QueryEscape(target), nil
		}
		target = "https://" + target
	}
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return "", errors.New("LeaX Browser accepts HTTP or HTTPS websites only")
	}
	return u.String(), nil
}

// leaXBrowserProtocolTarget validates the only custom protocol URL accepted by
// the desktop browser entry point. The nested URL is still validated separately.
func leaXBrowserProtocolTarget(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != leaxBrowserProtocol || u.Host != "browser" || u.Path != "" || len(u.Query()) != 1 || len(u.Query()["url"]) != 1 {
		return "", errors.New("Invalid LeaX Browser launch link")
	}
	return normalizeLeaXBrowserTarget(u.Query().Get("url"))
}