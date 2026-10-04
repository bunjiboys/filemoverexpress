package workflow

import (
	"fmt"
	"strings"
)

// InvalidPathSegments are the traversal forms rejected in a path or S3-key value after
// substitution, mirroring the guards the existing upload path enforces (cmd/s3.go's
// ".."-rejection and s3_discovery's InvalidS3KeyStrings). Both separator styles are
// checked because a workflow document is portable: a path authored with forward slashes
// must be rejected the same way on Windows and vice versa, so the guard does not depend
// on the executing platform's filepath.Separator.
var InvalidPathSegments = []string{"/../", "\\..\\", "../", "..\\"}

// ValidateStructure checks the three cross-item rules the JSON Schema cannot express
// (format doc "DAG validation rules"): step ids are unique within the document, every
// dependsOn id refers to a declared step, and the dependency graph is acyclic. It
// operates on the pre-substitution document because id/dependsOn are never templated. It
// returns one message per violation (empty when the document is structurally valid); the
// caller runs schema validation separately via ValidateAgainstSchema.
func ValidateStructure(doc Document) []string {
	var errs []string
	ids := checkUniqueIDs(doc.Spec.Steps, &errs)
	checkDependencies(doc.Spec.Steps, ids, &errs)
	errs = append(errs, detectCycle(doc.Spec.Steps, ids)...)
	return errs
}

// checkUniqueIDs records a duplicate-id error for each repeated step id and returns the
// set of distinct ids present, used by the dependency and cycle checks.
func checkUniqueIDs(steps []Step, errs *[]string) map[string]bool {
	ids := make(map[string]bool, len(steps))
	for i := range steps {
		id := steps[i].ID
		if ids[id] {
			*errs = append(*errs, fmt.Sprintf("duplicate step id: %s", id))
			continue
		}
		ids[id] = true
	}
	return ids
}

// checkDependencies records an error for every dependsOn id that does not match a
// declared step id, naming the depending step and the unknown id.
func checkDependencies(steps []Step, ids map[string]bool, errs *[]string) {
	for i := range steps {
		for _, dep := range steps[i].DependsOn {
			if !ids[dep] {
				*errs = append(*errs, fmt.Sprintf("step %s depends on unknown id: %s", steps[i].ID, dep))
			}
		}
	}
}

// detectCycle returns a single error naming a cycle's members if the dependency edges do
// not form a DAG, or nil when the graph is acyclic. A dependsOn id with no matching step
// is ignored here (reported by checkDependencies) so a dangling edge does not masquerade
// as a cycle.
func detectCycle(steps []Step, ids map[string]bool) []string {
	adj := make(map[string][]string, len(steps))
	for i := range steps {
		for _, dep := range steps[i].DependsOn {
			if ids[dep] {
				adj[steps[i].ID] = append(adj[steps[i].ID], dep)
			}
		}
	}

	const (
		white = 0 // unvisited
		gray  = 1 // on the current DFS stack
		black = 2 // fully explored
	)
	color := make(map[string]int, len(steps))
	var stack []string

	var visit func(id string) []string
	visit = func(id string) []string {
		color[id] = gray
		stack = append(stack, id)
		for _, dep := range adj[id] {
			if color[dep] == gray {
				return []string{fmt.Sprintf("dependency cycle: %s", cycleMembers(stack, dep))}
			}
			if color[dep] == white {
				if cyc := visit(dep); cyc != nil {
					return cyc
				}
			}
		}
		color[id] = black
		stack = stack[:len(stack)-1]
		return nil
	}

	for i := range steps {
		if color[steps[i].ID] == white {
			if cyc := visit(steps[i].ID); cyc != nil {
				return cyc
			}
		}
	}
	return nil
}

// cycleMembers renders the cycle as a path from where it re-enters the stack back to the
// repeated node, e.g. "a -> b -> a", so the message names exactly the steps involved.
func cycleMembers(stack []string, repeated string) string {
	start := 0
	for i, id := range stack {
		if id == repeated {
			start = i
			break
		}
	}
	members := append(append([]string{}, stack[start:]...), repeated)
	return strings.Join(members, " -> ")
}

// CheckPathSafety rejects a traversal attempt in a path or S3-key value AFTER parameter
// substitution (format doc "Path safety"): a value containing a ".." segment with either
// separator, or that is exactly "..", cannot be used because a parameter could otherwise
// inject a traversal. A clean value (including filenames that merely contain dots, like
// "my..file") passes.
func CheckPathSafety(value string) error {
	if value == ".." {
		return traversalError(value)
	}
	if strings.HasSuffix(value, "/..") || strings.HasSuffix(value, "\\..") {
		return traversalError(value)
	}
	for _, seg := range InvalidPathSegments {
		if strings.Contains(value, seg) {
			return traversalError(value)
		}
	}
	return nil
}

// traversalError builds the uniform rejection error for a value carrying a traversal
// segment.
func traversalError(value string) error {
	return fmt.Errorf("path contains a traversal segment: %q", value)
}
