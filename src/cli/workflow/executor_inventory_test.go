package workflow

import (
	"context"
	"errors"
	"testing"

	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/inventorytypes"
)

func fakeProfileResolver(name string) (configtypes.TransferProfile, error) {
	if name == "review-bucket" {
		return configtypes.TransferProfile{Name: name, Bucket: "my-bucket"}, nil
	}
	return configtypes.TransferProfile{}, errors.New("no such profile: " + name)
}

func TestInventoryExecutorMapsInput(t *testing.T) {
	var captured inventorytypes.GenerateInventoryInput
	exec := &InventoryExecutor{
		resolveProfile: fakeProfileResolver,
		generate: func(in inventorytypes.GenerateInventoryInput) error {
			captured = in
			return nil
		},
	}
	step := Step{ID: "inv", Type: StepInventoryReport, With: map[string]any{
		"transferProfile":  "review-bucket",
		"outputFormat":     "csv",
		"pretty":           true,
		"includeChecksums": true,
	}}
	if err := exec.Execute(context.Background(), step); err != nil {
		t.Fatalf("Execute err = %v", err)
	}
	if captured.TransferProfile.Name != "review-bucket" {
		t.Errorf("profile = %q", captured.TransferProfile.Name)
	}
	if captured.OutputFormat != "csv" || !captured.Pretty || !captured.IncludeChecksums {
		t.Errorf("mapped input = %+v", captured)
	}
}

func TestInventoryExecutorDefaults(t *testing.T) {
	var captured inventorytypes.GenerateInventoryInput
	exec := &InventoryExecutor{
		resolveProfile: fakeProfileResolver,
		generate: func(in inventorytypes.GenerateInventoryInput) error {
			captured = in
			return nil
		},
	}
	step := Step{ID: "inv", Type: StepInventoryReport, With: map[string]any{
		"transferProfile": "review-bucket",
	}}
	if err := exec.Execute(context.Background(), step); err != nil {
		t.Fatalf("Execute err = %v", err)
	}
	if captured.Pretty || captured.IncludeChecksums {
		t.Errorf("defaults should be false, got %+v", captured)
	}
}

func TestInventoryExecutorMissingProfile(t *testing.T) {
	exec := &InventoryExecutor{
		resolveProfile: fakeProfileResolver,
		generate:       func(inventorytypes.GenerateInventoryInput) error { return nil },
	}
	step := Step{ID: "inv", Type: StepInventoryReport, With: map[string]any{}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error for a missing transferProfile")
	}
}

func TestInventoryExecutorUnknownProfile(t *testing.T) {
	exec := &InventoryExecutor{
		resolveProfile: fakeProfileResolver,
		generate:       func(inventorytypes.GenerateInventoryInput) error { return nil },
	}
	step := Step{ID: "inv", Type: StepInventoryReport, With: map[string]any{"transferProfile": "ghost"}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error resolving an unknown profile")
	}
}

func TestInventoryExecutorGenerateError(t *testing.T) {
	exec := &InventoryExecutor{
		resolveProfile: fakeProfileResolver,
		generate:       func(inventorytypes.GenerateInventoryInput) error { return errors.New("boom") },
	}
	step := Step{ID: "inv", Type: StepInventoryReport, With: map[string]any{"transferProfile": "review-bucket"}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected the generate error to surface")
	}
}

func TestNewInventoryExecutorWiresSeams(t *testing.T) {
	exec := NewInventoryExecutor()
	if exec.generate == nil || exec.resolveProfile == nil {
		t.Fatal("NewInventoryExecutor did not wire its seams")
	}
}
