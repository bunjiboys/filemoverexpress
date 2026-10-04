package workflow

import (
	"strings"
	"testing"
)

// --- unique step ids ---

func TestValidateStructureDuplicateID(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "a", Type: StepSleep},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "duplicate step id: a")
}

func TestValidateStructureUniqueIDs(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}}}
	if errs := ValidateStructure(doc); len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
}

// --- dangling dependsOn ---

func TestValidateStructureDanglingDependency(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"ghost"}},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "step a depends on unknown id: ghost")
}

// --- acyclicity ---

func TestValidateStructureSelfLoop(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"a"}},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "cycle")
	assertStructErr(t, errs, "a")
}

func TestValidateStructureTwoCycle(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "cycle")
}

func TestValidateStructureLongerCycle(t *testing.T) {
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"c"}},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "c", Type: StepSleep, DependsOn: []string{"b"}},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "cycle")
}

func TestValidateStructureValidDiamond(t *testing.T) {
	// A -> B -> {C, D} -> E, a classic diamond, is acyclic and valid.
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "c", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "d", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "e", Type: StepSleep, DependsOn: []string{"c", "d"}},
	}}}
	if errs := ValidateStructure(doc); len(errs) != 0 {
		t.Fatalf("valid diamond rejected: %v", errs)
	}
}

func TestValidateStructureMultipleErrors(t *testing.T) {
	// A duplicate id AND a dangling dependency are both reported.
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "a", Type: StepSleep, DependsOn: []string{"ghost"}},
	}}}
	errs := ValidateStructure(doc)
	assertStructErr(t, errs, "duplicate step id: a")
	assertStructErr(t, errs, "unknown id: ghost")
}

// --- path safety (post-substitution) ---

func TestCheckPathSafety(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"clean absolute", "/mnt/day-15/camera", false},
		{"clean relative", "shows/project-x/day-15", false},
		{"clean s3 key", "review/day-15", false},
		{"empty", "", false},
		{"single dot", "./local", false},
		{"filename with dots", "my..file.txt", false},
		{"unix traversal mid", "a/../b", true},
		{"unix traversal lead", "../etc/passwd", true},
		{"unix traversal trail", "a/..", true},
		{"bare dotdot", "..", true},
		{"windows traversal mid", `a\..\b`, true},
		{"windows traversal lead", `..\windows`, true},
		{"windows traversal trail", `a\..`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckPathSafety(tc.value)
			if (err != nil) != tc.wantErr {
				t.Errorf("CheckPathSafety(%q) err = %v, wantErr = %v", tc.value, err, tc.wantErr)
			}
		})
	}
}

func assertStructErr(t *testing.T, errs []string, want string) {
	t.Helper()
	for _, e := range errs {
		if strings.Contains(e, want) {
			return
		}
	}
	t.Fatalf("expected a structural error containing %q, got: %v", want, errs)
}
