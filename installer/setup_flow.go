package main

import "context"

// The app is handed to its owner before the large AI downloads begin. A failed
// or cancelled AI stage keeps that handoff intact and never claims AI readiness.
func finishOfficeSetup(ctx context.Context, handoff func() error, prepare func() (string, error), verify func(string) error, status func(string) error) (result error) {
	_ = status("Preparing")
	defer func() {
		if result != nil {
			state := "Needs-attention"
			if ctx.Err() != nil {
				state = "Paused"
			}
			_ = status(state)
		}
	}()
	if e := handoff(); e != nil {
		return e
	}
	if e := ctx.Err(); e != nil {
		return e
	}
	model, e := prepare()
	if e != nil {
		return e
	}
	if e = ctx.Err(); e != nil {
		return e
	}
	return verify(model)
}
