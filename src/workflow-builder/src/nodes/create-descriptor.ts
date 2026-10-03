import type { NodeDescriptor, WorkflowNode, WorkflowStep } from './descriptor';

// All v1 step types share the same envelope conversion between a workflow step and a
// canvas node - they differ only in their `with` payload shape (validated by the
// schema, not by the descriptor) and their `type`. This factory captures that shared
// behavior so each descriptor is a one-line declaration.
//
// Invariants (see docs/Workflow-Builder-App.md section 5):
// - A node carries id, type, name, with, continueOnError.
// - dependsOn is NOT owned here; edges are the canvas's concern, reconstructed by the
//   graph serializer, so fromStep drops it and toStep never emits it.
// - toStep emits name and continueOnError only when meaningful, keeping the
//   serialized step minimal and the round-trip stable.
export function createDescriptor(type: string): NodeDescriptor {
    return {
        type,
        ports: { inputs: 1, outputs: 1 },

        fromStep(step: WorkflowStep): WorkflowNode {
            return {
                id: step.id,
                type,
                name: step.name,
                with: { ...step.with },
                continueOnError: step.continueOnError ?? false,
            };
        },

        toStep(node: WorkflowNode): WorkflowStep {
            const step: WorkflowStep = {
                id: node.id,
                type,
                with: { ...node.with },
            };
            if (node.name !== undefined && node.name !== '') {
                step.name = node.name;
            }
            if (node.continueOnError) {
                step.continueOnError = true;
            }
            return step;
        },
    };
}
