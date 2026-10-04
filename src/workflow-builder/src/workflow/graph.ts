import type { WorkflowNode } from '../nodes/descriptor';

// An edge is a dependency: `source` must complete before `target` runs. It maps to
// `target.dependsOn` containing `source.id`. Edges are the canvas's wires; the
// serializer is the only place they turn into dependsOn and back.
export interface WorkflowEdge {
    source: string;
    target: string;
}

// The in-memory graph the builder edits: canvas nodes plus dependency edges, and the
// document-level fields that are not per-node (metadata, parameters, defaults). This
// is the single source of truth both the canvas and the editor project from
// (docs/designs/workflows/Workflow-Builder-App.md section 10).
export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata?: WorkflowMetadata;
    parameters?: unknown[];
    defaults?: Record<string, unknown>;
}

// Document-level metadata and spec-level inputs that are not per-node.
export interface WorkflowMetadata {
    name?: string;
    description?: string;
    labels?: Record<string, string>;
}

// A full workflow document, matching the shape of schemas/workflow/v1.json. The
// serializer carries metadata/parameters/defaults through unchanged; only steps and
// their dependsOn are derived from the graph.
export interface WorkflowDocument {
    apiVersion: string;
    kind: string;
    metadata?: WorkflowMetadata;
    spec: {
        parameters?: unknown[];
        defaults?: Record<string, unknown>;
        steps: WorkflowStepDoc[];
    };
}

export interface WorkflowStepDoc {
    id: string;
    name?: string;
    type: string;
    with: Record<string, unknown>;
    dependsOn?: string[];
    continueOnError?: boolean;
}

export const API_VERSION = 'fme.dev/workflow/v1';
export const KIND = 'Workflow';
