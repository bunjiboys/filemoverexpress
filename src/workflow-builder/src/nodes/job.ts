import type { NodeDescriptor, WorkflowNode, WorkflowStep } from './descriptor';

// Descriptor for the `Job` step type (maps 1:1 to jobmanagertypes.JobConfig; see
// the JobStep payload in schemas/workflow/v1.json).
//
// The descriptor owns the step envelope fields a node carries (id, name, type, with,
// continueOnError) and the `with` payload. It deliberately does NOT own `dependsOn`:
// edges are the canvas's concern (wires), reconstructed by the graph serializer at
// export time, so a descriptor neither reads nor emits dependsOn.
export const jobDescriptor: NodeDescriptor = {
    type: 'Job',
    ports: { inputs: 1, outputs: 1 },

    fromStep(step: WorkflowStep): WorkflowNode {
        return {
            id: step.id,
            type: 'Job',
            name: step.name,
            with: { ...step.with },
            continueOnError: step.continueOnError ?? false,
        };
    },

    toStep(node: WorkflowNode): WorkflowStep {
        const step: WorkflowStep = {
            id: node.id,
            type: 'Job',
            with: { ...node.with },
        };
        // Emit optional envelope fields only when meaningful, so a serialized step
        // stays minimal and round-trips cleanly.
        if (node.name !== undefined && node.name !== '') {
            step.name = node.name;
        }
        if (node.continueOnError) {
            step.continueOnError = true;
        }
        return step;
    },
};
