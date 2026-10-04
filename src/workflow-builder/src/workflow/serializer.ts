import { getDescriptor } from '../nodes/registry';
import type { WorkflowNode } from '../nodes/descriptor';
import {
    API_VERSION,
    KIND,
    type WorkflowDocument,
    type WorkflowEdge,
    type WorkflowGraph,
    type WorkflowStepDoc,
} from './graph';

// Serialize the editable graph to a canonical workflow document (export direction).
// Each node is converted through its descriptor's toStep; dependsOn is reconstructed
// here from the incoming edges, because edges - not descriptors - own dependency
// (docs/designs/workflows/Workflow-Builder-App.md sections 5, 9). Document-level metadata/parameters/
// defaults pass through unchanged.
export function toWorkflow(graph: WorkflowGraph): WorkflowDocument {
    // Group edge sources by their target, preserving the order sources appear in the
    // edge list so dependsOn ordering is deterministic and round-trips.
    const incoming = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const list = incoming.get(edge.target) ?? [];
        list.push(edge.source);
        incoming.set(edge.target, list);
    }

    const steps: WorkflowStepDoc[] = graph.nodes.map((node) => {
        const step: WorkflowStepDoc = getDescriptor(node.type).toStep(node);
        const deps = incoming.get(node.id);
        if (deps !== undefined && deps.length > 0) {
            step.dependsOn = deps;
        }
        return step;
    });

    const doc: WorkflowDocument = {
        apiVersion: API_VERSION,
        kind: KIND,
        spec: { steps },
    };
    if (graph.metadata !== undefined) {
        doc.metadata = graph.metadata;
    }
    if (graph.parameters !== undefined) {
        doc.spec.parameters = graph.parameters;
    }
    if (graph.defaults !== undefined) {
        doc.spec.defaults = graph.defaults;
    }
    return doc;
}

// Deserialize a workflow document into the editable graph (import direction). Each
// step becomes a node via its descriptor's fromStep; each dependsOn entry becomes an
// edge. Document-level fields pass through unchanged.
export function fromWorkflow(doc: WorkflowDocument): WorkflowGraph {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    for (const step of doc.spec.steps) {
        nodes.push(getDescriptor(step.type).fromStep(step));
        for (const source of step.dependsOn ?? []) {
            edges.push({ source, target: step.id });
        }
    }

    const graph: WorkflowGraph = { nodes, edges };
    if (doc.metadata !== undefined) {
        graph.metadata = doc.metadata;
    }
    if (doc.spec.parameters !== undefined) {
        graph.parameters = doc.spec.parameters;
    }
    if (doc.spec.defaults !== undefined) {
        graph.defaults = doc.spec.defaults;
    }
    return graph;
}
