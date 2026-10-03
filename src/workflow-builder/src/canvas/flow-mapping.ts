import type { Connection, Edge, Node } from '@xyflow/react';
import type { WorkflowEdge, WorkflowGraph } from '../workflow/graph';
import type { PositionedNode } from '../layout/layout';

// The data a custom workflow node renders: its step type (drives chrome/label) and
// its display name. Everything else about the node (its `with` payload) is edited in
// the property modal, not shown on the canvas chrome, so it is not projected here.
export interface WorkflowNodeData extends Record<string, unknown> {
    stepType: string;
    name: string | undefined;
}

// The single React Flow node type key; one custom component handles every step type
// and branches on data.stepType (docs section 5: a generic node shape per type).
export const WORKFLOW_NODE_TYPE = 'workflow';

export type FlowNode = Node<WorkflowNodeData>;

// Project the model nodes (plus their computed positions) into React Flow nodes.
// Positions are builder-only state overlaid here, never part of the model/file
// (docs sections 8-9). A node with no computed position falls back to the origin.
export function toFlowNodes(graph: WorkflowGraph, positions: PositionedNode[]): FlowNode[] {
    const byId = new Map(positions.map((p) => [p.id, p]));
    return graph.nodes.map((n) => {
        const pos = byId.get(n.id);
        return {
            id: n.id,
            type: WORKFLOW_NODE_TYPE,
            position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
            data: { stepType: n.type, name: n.name },
        };
    });
}

// A stable React Flow edge id derived from the endpoints. Dependency edges are unique
// per (source, target) pair, so the pair is a natural key - stable across re-renders
// so React Flow does not treat a re-projected edge as new.
export function edgeId(edge: WorkflowEdge): string {
    return `${edge.source}->${edge.target}`;
}

// Inverse of edgeId: recover the endpoints from a derived React Flow edge id. Splits
// on the FIRST separator so a node id that itself contains the arrow still parses
// (source is everything before the first `->`, target the rest). Returns undefined for
// an id with no separator, so a non-derived id is ignored rather than mis-parsed.
export function parseEdgeId(id: string): WorkflowEdge | undefined {
    const index = id.indexOf('->');
    if (index === -1) {
        return undefined;
    }
    return { source: id.slice(0, index), target: id.slice(index + 2) };
}

// Project the model's dependency edges into React Flow edges.
export function toFlowEdges(graph: WorkflowGraph): Edge[] {
    return graph.edges.map((e) => ({ id: edgeId(e), source: e.source, target: e.target }));
}

// Convert a React Flow Connection (its source/target are nullable in the type) into a
// dependency edge, or undefined if either endpoint is missing. Both the connect
// handler and isValidConnection go through this so the null guard lives in one place.
export function connectionToEdge(connection: Connection): WorkflowEdge | undefined {
    if (connection.source === null || connection.target === null) {
        return undefined;
    }
    return { source: connection.source, target: connection.target };
}
