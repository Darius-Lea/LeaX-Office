package main

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestOfficeHandoffPrecedesAIAndFailedDownloadsRemainRetryable(t *testing.T) {
	var order []string
	failed := errors.New("download unavailable")
	e := finishOfficeSetup(context.Background(), func() error { order = append(order, "open office"); return nil }, func() (string, error) {
		order = append(order, "download AI")
		return "", failed
	}, func(string) error { t.Fatal("failed download cannot configure a model"); return nil }, func(status string) error { order = append(order, status); return nil })
	if e != failed || !reflect.DeepEqual(order, []string{"Preparing", "open office", "download AI", "Needs-attention"}) {
		t.Fatalf("unexpected setup flow: %v %v", order, e)
	}
}

func TestAISetupCancellationAfterOfficeOpensDoesNotDownloadOrClaimReady(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var statuses []string
	e := finishOfficeSetup(ctx, func() error { cancel(); return nil }, func() (string, error) { t.Fatal("cancelled setup downloaded AI"); return "", nil }, func(string) error { t.Fatal("cancelled setup configured AI"); return nil }, func(status string) error { statuses = append(statuses, status); return nil })
	if e != context.Canceled || !reflect.DeepEqual(statuses, []string{"Preparing", "Paused"}) {
		t.Fatalf("unexpected cancellation flow: %v %v", statuses, e)
	}
}

func TestAIConfigurationRequiresSuccessfulVerificationAfterHandoff(t *testing.T) {
	var order []string
	if e := finishOfficeSetup(context.Background(), func() error { order = append(order, "open office"); return nil }, func() (string, error) { order = append(order, "download AI"); return "synthetic-model", nil }, func(model string) error {
		if model != "synthetic-model" {
			t.Fatal("wrong prepared model")
		}
		order = append(order, "real verification callback")
		return nil
	}, func(status string) error { order = append(order, status); return nil }); e != nil {
		t.Fatal(e)
	}
	if !reflect.DeepEqual(order, []string{"Preparing", "open office", "download AI", "real verification callback"}) {
		t.Fatalf("unexpected successful flow: %v", order)
	}
}
