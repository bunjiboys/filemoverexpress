import type { EdgeChange, NodeChange } from '@xyflow/react';
import { parseEdgeId } from './flow-mapping';
import type { WorkflowGraphController } from './use-workflow-graph';

// Translate a React Flow node-change batch into model mutations (docs section 13).
// Only position (a free drag) and remove (delete) changes mutate the model; selection
// and dimension changes are React Flow's own view concern and are ignored. Keeping
// this pure lets the branch logic be unit-tested without the un-renderable canvas.
export function applyNodeChangesToModel(
    controller: WorkflowGraphController,
    changes: NodeChange[],
): void {
    for (const change of changes) {
        if (change.type === 'position' && change.position !== undefined) {
            controller.moveNode(change.id, change.position);
        } else if (change.type === 'remove') {
            controller.deleteNode(change.id);
        }
    }
}

// Translate a React Flow edge-change batch into model mutations. Only remove changes
// matter (a deleted wire drops the dependency); the edge's derived id is parsed back
// to its endpoints. A non-derived id is ignored rather than mis-deleted.
export function applyEdgeChangesToModel(
    controller: WorkflowGraphController,
    changes: EdgeChange[],
): void {
    for (const change of changes) {
        if (change.type === 'remove') {
            const edge = parseEdgeId(change.id);
            if (edge !== undefined) {
                controller.deleteEdge(edge);
            }
        }
    }
}
