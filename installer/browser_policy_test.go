package main

import (
	"reflect"
	"testing"
)

func TestOfficeBrowserArguments(t *testing.T) {
	target := "http://127.0.0.1:4310/#setup=synthetic-test-code"
	got, e := officeBrowserArguments(target)
	if e != nil {
		t.Fatal(e)
	}
	if !reflect.DeepEqual(got, []string{"--app=" + target, "--window-size=1440,960"}) {
		t.Fatalf("Unexpected browser arguments: %v", got)
	}
	for _, bad := range []string{"https://example.com/", "http://127.0.0.1:9999/", "http://localhost:4310/", "http://127.0.0.1:4310/other", "http://127.0.0.1:4310/?setup=secret", "http://user@127.0.0.1:4310/"} {
		if _, e := officeBrowserArguments(bad); e == nil {
			t.Fatalf("Rejected private office origin: %s", bad)
		}
	}
}
