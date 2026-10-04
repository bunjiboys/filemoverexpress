// The node-model types and the NodeDescriptor contract.
//
// A NodeDescriptor is the bridge between a workflow step (the file format) and a
// canvas node (what React Flow renders). One descriptor per step `type`. The set of
// descriptors is keyed by the schema's step-type enum, so a new format step type is
// added by registering a descriptor - no envelope or engine change
// (docs/designs/workflows/Workflow-Builder-App.md sections 2 and 5).

// A single step as it appears in a workflow document's spec.steps[].
export interface WorkflowStep {
    id: string;
    name?: string;
    type: string;
    with: Record<string, unknown>;
    dependsOn?: string[];
    continueOnError?: boolean;
}

// A node on the canvas. Position is builder-only state and never part of the file
// (docs sections 8-9). `data` carries the step's editable payload (`with`) plus the
// envelope fields the node owns.
export interface WorkflowNode {
    id: string;
    type: string;
    name?: string;
    with: Record<string, unknown>;
    continueOnError: boolean;
}

export interface PortSpec {
    // v1 uses a single generic in/out pair per node; the wire is a dependency edge,
    // not typed data flow (docs section 5).
    inputs: number;
    outputs: number;
}

// Describes one step type for the builder: how it renders, and how it converts
// between a canvas node and a workflow step.
export interface NodeDescriptor {
    // The step `type` discriminator this descriptor handles.
    readonly type: string;
    // Ports the node exposes.
    readonly ports: PortSpec;
    // Build a canvas node from an existing workflow step (import direction).
    fromStep(step: WorkflowStep): WorkflowNode;
    // Build a workflow step from a canvas node (export direction).
    toStep(node: WorkflowNode): WorkflowStep;
}
