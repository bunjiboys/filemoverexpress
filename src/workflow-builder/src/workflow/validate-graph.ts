import type { WorkflowGraph } from './graph';

export interface GraphValidationResult {
    valid: boolean;
    errors: string[];
}

// Validate the structural rules the JSON Schema cannot express
// (docs/Workflow-Builder-App.md section 7): unique node ids, edge endpoints that
// resolve to real nodes, and an acyclic graph (dependsOn forms a DAG).
export function validateGraph(graph: WorkflowGraph): GraphValidationResult {
    const errors: string[] = [];

    // Unique ids.
    const seen = new Set<string>();
    for (const n of graph.nodes) {
        if (seen.has(n.id)) {
            errors.push(`duplicate id: ${n.id}`);
        }
        seen.add(n.id);
    }

    // Edge reference integrity: both endpoints must be known nodes.
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
        if (!ids.has(e.source)) {
            errors.push(`edge from unknown node: ${e.source}`);
        }
        if (!ids.has(e.target)) {
            errors.push(`edge to unknown node: ${e.target}`);
        }
    }

    // Acyclicity: DFS over the adjacency built from edges (source -> target). Only
    // run when edges are reference-valid, so the walk never dereferences a ghost.
    if (errors.length === 0) {
        if (hasCycle(graph)) {
            errors.push('graph contains a cycle');
        }
    }

    return { valid: errors.length === 0, errors };
}

function hasCycle(graph: WorkflowGraph): boolean {
    const adjacency = new Map<string, string[]>();
    for (const n of graph.nodes) {
        adjacency.set(n.id, []);
    }
    for (const e of graph.edges) {
        adjacency.get(e.source)!.push(e.target);
    }

    // Three-color DFS: white (unvisited), gray (on the current path), black (done).
    const gray = new Set<string>();
    const black = new Set<string>();

    const visit = (id: string): boolean => {
        gray.add(id);
        for (const next of adjacency.get(id)!) {
            if (gray.has(next)) {
                return true; // back edge -> cycle (also catches a self-loop)
            }
            if (!black.has(next) && visit(next)) {
                return true;
            }
        }
        gray.delete(id);
        black.add(id);
        return false;
    };

    for (const n of graph.nodes) {
        if (!black.has(n.id) && visit(n.id)) {
            return true;
        }
    }
    return false;
}
