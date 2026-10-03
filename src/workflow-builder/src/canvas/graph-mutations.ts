import type { WorkflowEdge, WorkflowGraph } from '../workflow/graph';
import type { WorkflowNode } from '../nodes/descriptor';

// Pure reducers over the graph model (docs section 13). Each returns a new WorkflowGraph
// and never mutates its input, so React state updates stay predictable and the canvas
// interactions are testable without rendering React Flow. Document-level fields
// (metadata/parameters/defaults) are carried through unchanged.

const ID_PREFIX = 'step-';

// Generate the next unused `step-N` id. N is one past the highest step-number already
// present, so ids stay unique even after deletes and regardless of non-step ids a
// user imported.
export function nextNodeId(graph: WorkflowGraph): string {
    let max = 0;
    for (const node of graph.nodes) {
        if (node.id.startsWith(ID_PREFIX)) {
            const n = Number(node.id.slice(ID_PREFIX.length));
            if (Number.isInteger(n) && n > max) {
                max = n;
            }
        }
    }
    return `${ID_PREFIX}${max + 1}`;
}

// Add a new node of `type` with a generated id and an empty `with` payload. The user
// fills the payload in the property modal; export validation (docs section 7) flags a
// still-incomplete node, so the builder never silently drops required fields.
export function addNode(graph: WorkflowGraph, type: string): WorkflowGraph {
    const node: WorkflowNode = {
        id: nextNodeId(graph),
        type,
        with: {},
        continueOnError: false,
    };
    return withNodesEdges(graph, [...graph.nodes, node], graph.edges);
}

// Remove a node and every edge incident to it (a dangling edge would fail
// edge-integrity validation), keeping the graph structurally valid.
export function deleteNode(graph: WorkflowGraph, id: string): WorkflowGraph {
    const nodes = graph.nodes.filter((n) => n.id !== id);
    const edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
    return withNodesEdges(graph, nodes, edges);
}

// Add a dependency edge (source must complete before target). Idempotent: an edge
// that already exists is not duplicated, so re-wiring the same pair is a no-op.
export function connectNodes(graph: WorkflowGraph, edge: WorkflowEdge): WorkflowGraph {
    if (graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
        return graph;
    }
    return withNodesEdges(graph, graph.nodes, [...graph.edges, edge]);
}

// Remove a dependency edge. A no-op when the edge is absent.
export function deleteEdge(graph: WorkflowGraph, edge: WorkflowEdge): WorkflowGraph {
    const edges = graph.edges.filter((e) => !(e.source === edge.source && e.target === edge.target));
    return withNodesEdges(graph, graph.nodes, edges);
}

// What a property-modal save can change on a node: its display name, its `with`
// payload, and the continue-on-error flag. The id and type are fixed once created.
export interface NodePatch {
    name?: string;
    with?: Record<string, unknown>;
    continueOnError?: boolean;
}

// Apply a property-modal save to one node. Fields absent from the patch keep their
// current value, so a partial save is fine. A no-op for an unknown id. Returns a new
// graph; the input is not mutated.
export function updateNode(graph: WorkflowGraph, id: string, patch: NodePatch): WorkflowGraph {
    const nodes = graph.nodes.map((n) => {
        if (n.id !== id) {
            return n;
        }
        return {
            ...n,
            name: patch.name ?? n.name,
            with: patch.with ?? n.with,
            continueOnError: patch.continueOnError ?? n.continueOnError,
        };
    });
    return withNodesEdges(graph, nodes, graph.edges);
}

// Remove every edge incident to a node WITHOUT removing the node (right-click "clear
// connections"). Distinct from deleteNode, which also drops the node.
export function clearNodeEdges(graph: WorkflowGraph, id: string): WorkflowGraph {
    const edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
    return withNodesEdges(graph, graph.nodes, edges);
}

// A patch for the document-level fields (everything that is not per-node): metadata,
// parameters, defaults. A key PRESENT in the patch sets that field (even to undefined,
// which clears it); a key ABSENT leaves the field as it was.
export interface DocumentPatch {
    metadata?: WorkflowGraph['metadata'];
    parameters?: WorkflowGraph['parameters'];
    defaults?: WorkflowGraph['defaults'];
}

// Apply a document-level patch (docs section 15 document panel). Nodes and edges are
// untouched; only the metadata/parameters/defaults the patch names are changed.
// Returns a new graph; the input is not mutated.
export function updateDocument(graph: WorkflowGraph, patch: DocumentPatch): WorkflowGraph {
    const next: WorkflowGraph = { nodes: graph.nodes, edges: graph.edges };
    const metadata = 'metadata' in patch ? patch.metadata : graph.metadata;
    const parameters = 'parameters' in patch ? patch.parameters : graph.parameters;
    const defaults = 'defaults' in patch ? patch.defaults : graph.defaults;
    if (metadata !== undefined) {
        next.metadata = metadata;
    }
    if (parameters !== undefined) {
        next.parameters = parameters;
    }
    if (defaults !== undefined) {
        next.defaults = defaults;
    }
    return next;
}

// Rebuild a graph with new nodes/edges while carrying document-level fields through
// unchanged. Centralizes the pass-through so each reducer stays a one-liner and no
// reducer forgets to preserve metadata/parameters/defaults.
function withNodesEdges(graph: WorkflowGraph, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
    const next: WorkflowGraph = { nodes, edges };
    if (graph.metadata !== undefined) {
        next.metadata = graph.metadata;
    }
    if (graph.parameters !== undefined) {
        next.parameters = graph.parameters;
    }
    if (graph.defaults !== undefined) {
        next.defaults = graph.defaults;
    }
    return next;
}
