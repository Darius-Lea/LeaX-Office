package main

import "testing"

func TestNativeReuseRequiresVerifiedSelectedModelToRemainInstalled(t *testing.T) {
	tests := []struct {
		name     string
		verified bool
		selected string
		models   []string
		ready    bool
	}{
		{"selected model installed", true, "qwen3:1.7b", []string{"qwen3:0.6b", "qwen3:1.7b"}, true},
		{"selected removed but another remains", true, "qwen3:1.7b", []string{"qwen3:0.6b"}, false},
		{"installed without completed inference", false, "qwen3:1.7b", []string{"qwen3:1.7b"}, false},
		{"legacy status has no selected tag", true, "", []string{"qwen3:1.7b"}, false},
		{"empty inventory", true, "qwen3:1.7b", nil, false},
		{"different model tag is not interchangeable", true, "qwen3:1.7b", []string{"qwen3:latest"}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if ready := verifiedModelAvailable(test.verified, test.selected, test.models); ready != test.ready {
				t.Fatalf("model readiness = %v; want %v", ready, test.ready)
			}
		})
	}
}
