import { describe, it, expect, vi } from 'vitest';
import type { NodeChange, EdgeChange } from '@xyflow/react';
import { applyNodeChangesToModel, applyEdgeChangesToModel } from './flow-change-handlers';
import type { WorkflowGraphController } from './use-workflow-graph';

// A minimal controller spy: only the mutators the change handlers call need to be
// real functions; the rest are present to satisfy the type.
function controllerSpy(): WorkflowGraphController {
    return {
        graph: { nodes: [], edges: [] },
        positions: [],
        fitSignal: 0,
        addNode: vi.fn(),
        deleteNode: vi.fn(),
        updateNode: vi.fn(),
        clearConnections: vi.fn(),
        setDocument: vi.fn(),
        connect: vi.fn(),
        deleteEdge: vi.fn(),
        moveNode: vi.fn(),
        isValidConnection: vi.fn(),
        relayout: vi.fn(),
        setGraph: vi.fn(),
    };
}

// React Flow emits change batches (drag, delete, select); these pure handlers
// translate the ones that mutate the model into controller calls, so the canvas
// component stays a thin pass-through and the branch logic is unit-tested here rather
// than through the un-renderable React Flow (docs section 13).
describe('applyNodeChangesToModel', () => {
    it('moves a node on a position change that carries a position', () => {
        const c = controllerSpy();
        const changes: NodeChange[] = [{ id: 'a', type: 'position', position: { x: 5, y: 6 } }];
        applyNodeChangesToModel(c, changes);
        expect(c.moveNode).toHaveBeenCalledWith('a', { x: 5, y: 6 });
    });

    it('ignores a position change with no position (drag start/end without coords)', () => {
        const c = controllerSpy();
        const changes: NodeChange[] = [{ id: 'a', type: 'position' }];
        applyNodeChangesToModel(c, changes);
        expect(c.moveNode).not.toHaveBeenCalled();
    });

    it('deletes a node on a remove change', () => {
        const c = controllerSpy();
        const changes: NodeChange[] = [{ id: 'a', type: 'remove' }];
        applyNodeChangesToModel(c, changes);
        expect(c.deleteNode).toHaveBeenCalledWith('a');
    });

    it('ignores selection and dimension changes', () => {
        const c = controllerSpy();
        const changes: NodeChange[] = [
            { id: 'a', type: 'select', selected: true }, { id: 'a', type: 'dimensions', dimensions: { width: 1, height: 1 } },
        ];
        applyNodeChangesToModel(c, changes);
        expect(c.moveNode).not.toHaveBeenCalled();
        expect(c.deleteNode).not.toHaveBeenCalled();
    });

    it('applies several changes in one batch', () => {
        const c = controllerSpy();
        const changes: NodeChange[] = [
            { id: 'a', type: 'position', position: { x: 1, y: 2 } }, { id: 'b', type: 'remove' },
        ];
        applyNodeChangesToModel(c, changes);
        expect(c.moveNode).toHaveBeenCalledWith('a', { x: 1, y: 2 });
        expect(c.deleteNode).toHaveBeenCalledWith('b');
    });
});

describe('applyEdgeChangesToModel', () => {
    it('deletes the matching edge on a remove change, parsing the derived id', () => {
        const c = controllerSpy();
        const changes: EdgeChange[] = [{ id: 'a->b', type: 'remove' }];
        applyEdgeChangesToModel(c, changes);
        expect(c.deleteEdge).toHaveBeenCalledWith({ source: 'a', target: 'b' });
    });

    it('ignores a remove change whose id is not a derived edge id', () => {
        const c = controllerSpy();
        const changes: EdgeChange[] = [{ id: 'not-an-edge', type: 'remove' }];
        applyEdgeChangesToModel(c, changes);
        expect(c.deleteEdge).not.toHaveBeenCalled();
    });

    it('ignores edge selection changes', () => {
        const c = controllerSpy();
        const changes: EdgeChange[] = [{ id: 'a->b', type: 'select', selected: true }];
        applyEdgeChangesToModel(c, changes);
        expect(c.deleteEdge).not.toHaveBeenCalled();
    });
});



