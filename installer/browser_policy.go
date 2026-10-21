package main

import (
	"errors"
	"net/url"
)

// The browser app window is restricted to this app's local origin. No shell is used.
func officeBrowserArguments(target string) ([]string, error) {
	u, e := url.Parse(target)
	if e != nil || len(target) > 2048 || u.Scheme != "http" || u.Host != "127.0.0.1:4310" || u.Path != "/" || u.User != nil || u.RawQuery != "" {
		return nil, errors.New("The office window must use the private local office address")
	}
	return []string{"--app=" + target, "--window-size=1440,960"}, nil
}
