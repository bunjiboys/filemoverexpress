package workflow

import (
	"reflect"
	"sort"
	"testing"
)

// diamond is the canonical A -> B -> {C, D} -> E graph used across DAG tests.
func diamond() []Step {
	return []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "c", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "d", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "e", Type: StepSleep, DependsOn: []string{"c", "d"}},
	}
}

func TestTopologicalOrderDiamond(t *testing.T) {
	order, err := TopologicalOrder(diamond())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pos := make(map[string]int, len(order))
	for i, id := range order {
		pos[id] = i
	}
	// Every edge x <- dep must have dep before x in the order.
	edges := [][2]string{{"a", "b"}, {"b", "c"}, {"b", "d"}, {"c", "e"}, {"d", "e"}}
	for _, e := range edges {
		if pos[e[0]] >= pos[e[1]] {
			t.Errorf("edge %s -> %s violated: %v", e[0], e[1], order)
		}
	}
	if len(order) != 5 {
		t.Errorf("order length = %d, want 5 (%v)", len(order), order)
	}
}

func TestTopologicalOrderCycleErrors(t *testing.T) {
	steps := []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}
	if _, err := TopologicalOrder(steps); err == nil {
		t.Fatal("expected an error for a cyclic graph")
	}
}

func TestTopologicalOrderEmpty(t *testing.T) {
	order, err := TopologicalOrder(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(order) != 0 {
		t.Errorf("order = %v, want empty", order)
	}
}

func TestReadySteps(t *testing.T) {
	steps := diamond()
	cases := []struct {
		name      string
		completed []string
		started   []string
		want      []string
	}{
		{"nothing done -> only a", nil, nil, []string{"a"}},
		{"a done -> b", []string{"a"}, []string{"a"}, []string{"b"}},
		{"b done -> c and d", []string{"a", "b"}, []string{"a", "b"}, []string{"c", "d"}},
		{"c done, d not -> nothing new (e waits on d)", []string{"a", "b", "c"}, []string{"a", "b", "c", "d"}, nil},
		{"c and d done -> e", []string{"a", "b", "c", "d"}, []string{"a", "b", "c", "d"}, []string{"e"}},
		{"all done -> nothing", []string{"a", "b", "c", "d", "e"}, []string{"a", "b", "c", "d", "e"}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ReadySteps(steps, toSet(tc.completed), toSet(tc.started))
			sort.Strings(got)
			want := tc.want
			sort.Strings(want)
			if len(got) == 0 && len(want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("ReadySteps = %v, want %v", got, want)
			}
		})
	}
}

func TestTransitiveDependents(t *testing.T) {
	steps := diamond()
	cases := []struct {
		name   string
		failed string
		want   []string
	}{
		{"fail b skips c, d, e", "b", []string{"c", "d", "e"}},
		{"fail c skips only e", "c", []string{"e"}},
		{"fail e skips nothing", "e", nil},
		{"fail a skips everything else", "a", []string{"b", "c", "d", "e"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := setKeys(TransitiveDependents(steps, tc.failed))
			sort.Strings(got)
			want := tc.want
			sort.Strings(want)
			if len(got) == 0 && len(want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("TransitiveDependents(%s) = %v, want %v", tc.failed, got, want)
			}
		})
	}
}

func toSet(ids []string) map[string]bool {
	s := make(map[string]bool, len(ids))
	for _, id := range ids {
		s[id] = true
	}
	return s
}

func setKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
