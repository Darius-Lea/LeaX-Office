package main

// A previous inference receipt is not proof that the selected model still
// exists. Reuse only the exact configured tag; another installed model cannot
// silently substitute for it or establish successful current readiness.
func verifiedModelAvailable(inferenceVerified bool, selected string, installed []string) bool {
	if !inferenceVerified || selected == "" {
		return false
	}
	for _, model := range installed {
		if model == selected {
			return true
		}
	}
	return false
}
