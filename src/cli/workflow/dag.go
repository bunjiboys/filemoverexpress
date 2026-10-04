package workflow

import (
	"errors"
	"sort"
)

// errCyclicGraph is returned by TopologicalOrder when the graph cannot be fully ordered,
// which means a cycle is present. Callers run ValidateStructure first (which names the
// cycle); this is the scheduler's own defensive guard so it never deadlocks on a graph
// that slipped through unvalidated.
var errCyclicGraph = errors.New("workflow: dependency graph is not acyclic")

// TopologicalOrder returns the step ids in an order where every step appears after all of
// its dependsOn steps, using Kahn's algorithm. Ties are broken by id so the order is
// deterministic (useful for tests and reproducible scheduling). It returns errCyclicGraph
// if the graph has a cycle; a well-formed document is validated acyclic by
// ValidateStructure before scheduling, so this error is the scheduler's own guard.
func TopologicalOrder(steps []Step) ([]string, error) {
	indegree, dependents := buildGraph(steps)

	ready := make([]string, 0, len(steps))
	for id, deg := range indegree {
		if deg == 0 {
			ready = append(ready, id)
		}
	}
	sort.Strings(ready)

	order := make([]string, 0, len(steps))
	for len(ready) > 0 {
		id := ready[0]
		ready = ready[1:]
		order = append(order, id)
		var unlocked []string
		for _, dep := range dependents[id] {
			indegree[dep]--
			if indegree[dep] == 0 {
				unlocked = append(unlocked, dep)
			}
		}
		sort.Strings(unlocked)
		ready = append(ready, unlocked...)
	}

	if len(order) != len(steps) {
		return nil, errCyclicGraph
	}
	return order, nil
}

// buildGraph returns the in-degree of each step (its number of dependsOn edges) and the
// adjacency from a step to the steps that depend on it. Both key off step id.
func buildGraph(steps []Step) (indegree map[string]int, dependents map[string][]string) {
	indegree = make(map[string]int, len(steps))
	dependents = make(map[string][]string, len(steps))
	for i := range steps {
		if _, ok := indegree[steps[i].ID]; !ok {
			indegree[steps[i].ID] = 0
		}
	}
	for i := range steps {
		for _, dep := range steps[i].DependsOn {
			indegree[steps[i].ID]++
			dependents[dep] = append(dependents[dep], steps[i].ID)
		}
	}
	return indegree, dependents
}

// ReadySteps returns the ids of steps that are eligible to start NOW: every id in their
// dependsOn is in completed, and they are neither already started nor completed. The
// engine calls this each time a step completes to find newly-unblocked work (format doc
// "Execution model": gate each step on its dependsOn).
func ReadySteps(steps []Step, completed, started map[string]bool) []string {
	ready := make([]string, 0, len(steps))
	for i := range steps {
		id := steps[i].ID
		if started[id] || completed[id] {
			continue
		}
		if dependenciesMet(steps[i].DependsOn, completed) {
			ready = append(ready, id)
		}
	}
	return ready
}

// dependenciesMet reports whether every dependency id is in completed.
func dependenciesMet(dependsOn []string, completed map[string]bool) bool {
	for _, dep := range dependsOn {
		if !completed[dep] {
			return false
		}
	}
	return true
}

// TransitiveDependents returns the set of step ids that transitively depend on failedID
// (its direct dependents, their dependents, and so on). On a non-continueOnError failure
// the engine marks exactly this set SKIPPED while independent branches continue (format
// doc decision 3). The failed step itself is not included.
func TransitiveDependents(steps []Step, failedID string) map[string]bool {
	_, dependents := buildGraph(steps)
	skip := make(map[string]bool)
	queue := append([]string{}, dependents[failedID]...)
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if skip[id] {
			continue
		}
		skip[id] = true
		queue = append(queue, dependents[id]...)
	}
	return skip
}
