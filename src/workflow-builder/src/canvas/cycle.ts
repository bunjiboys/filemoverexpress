import type { WorkflowEdge, WorkflowGraph } from '../workflow/graph';

// A candidate dependency edge, before it is committed to the graph. Same shape as a
// WorkflowEdge but conceptually "proposed", so the type alias documents intent at
// call sites (React Flow's isValidConnection).
export type CandidateEdge = WorkflowEdge;

// Would adding `candidate` to the graph introduce a cycle? The canvas calls this at
// draw time to forbid a connection that would break the DAG invariant
// (docs/designs/workflows/Workflow-Builder-App.md sections 2, 7), rather than letting an invalid graph
// reach export.
//
// Adding source -> target closes a cycle exactly when target can already reach source
// through the existing edges (the new edge then completes the loop), or when the edge
// is a self-loop (source === target).
export function wouldCreateCycle(graph: WorkflowGraph, candidate: CandidateEdge): boolean {
    if (candidate.source === candidate.target) {
        return true;
    }
    return reaches(graph, candidate.target, candidate.source);
}

// Depth-first reachability over the dependency edges (source -> target): can `from`
// reach `to`?
function reaches(graph: WorkflowGraph, from: string, to: string): boolean {
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const list = adjacency.get(edge.source) ?? [];
        list.push(edge.target);
        adjacency.set(edge.source, list);
    }

    const stack = [from];
    const seen = new Set<string>();
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === to) {
            return true;
        }
        if (seen.has(current)) {
            continue;
        }
        seen.add(current);
        for (const next of adjacency.get(current) ?? []) {
            stack.push(next);
        }
    }
    return false;
}
