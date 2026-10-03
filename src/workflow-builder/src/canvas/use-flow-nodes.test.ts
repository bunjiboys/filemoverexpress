import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { NodeChange } from '@xyflow/react';
import { useFlowNodes } from './use-flow-nodes';
import type { FlowNode } from './flow-mapping';
import type { WorkflowGraphController } from './use-workflow-graph';
import type { PositionedNode } from '../layout/layout';
import type { WorkflowGraph } from '../workflow/graph';

const node = (id: string, type = 'Sleep', name?: string): WorkflowGraph['nodes'][number] => ({
    id,
    type,
    name,
    with: {},
    continueOnError: false,
});

function controllerStub(
    graph: WorkflowGraph,
    positions: PositionedNode[],
    overrides: Partial<WorkflowGraphController> = {},
): WorkflowGraphController {
    return {
        graph,
        positions,
        addNode: vi.fn(),
        deleteNode: vi.fn(),
        updateNode: vi.fn(),
        clearConnections: vi.fn(),
        connect: vi.fn(),
        deleteEdge: vi.fn(),
        moveNode: vi.fn(),
        isValidConnection: vi.fn(),
        relayout: vi.fn(),
        setGraph: vi.fn(),
        ...overrides,
    };
}

let controller: WorkflowGraphController;

beforeEach(() => {
    controller = controllerStub(
        { nodes: [node('a', 'Job', 'Copy'), node('b')], edges: [] },
        [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
    );
});

// React Flow runs in CONTROLLED mode, so it holds no internal node state: every change
// it emits (including the measurement/init changes that make a node draggable) must be
// applied back to the nodes array or the node stays "uninitialized" (error#015). This
// hook keeps that React-Flow-owned view state locally via applyNodeChanges, reconciles
// it with the model when the structure changes, and forwards structural changes
// (position on drag, remove) to the model.
describe('useFlowNodes', () => {
    it('projects the model into initial flow nodes', () => {
        const { result } = renderHook(() => useFlowNodes(controller, 'light'));
        expect(result.current.nodes.map((n) => n.id)).toEqual(['a', 'b']);
        expect(result.current.nodes[0].data).toEqual({ stepType: 'Job', name: 'Copy', colorMode: 'light' });
    });

    it('applies React Flow changes to its local nodes so init/measurement is kept', () => {
        const { result } = renderHook(() => useFlowNodes(controller, 'light'));
        act(() => {
            result.current.onNodesChange([
                { id: 'a', type: 'dimensions', dimensions: { width: 150, height: 40 }, setAttributes: true },
            ] as NodeChange<FlowNode>[]);
        });
        // The dimensions change is retained on the local node (React Flow needs this to
        // consider the node initialized and allow dragging).
        const a = result.current.nodes.find((n) => n.id === 'a');
        expect(a).toBeDefined();
        expect(controller.moveNode).not.toHaveBeenCalled();
        expect(controller.deleteNode).not.toHaveBeenCalled();
    });

    it('forwards a position change to the model', () => {
        const { result } = renderHook(() => useFlowNodes(controller, 'light'));
        act(() => {
            result.current.onNodesChange([{ id: 'a', type: 'position', position: { x: 5, y: 6 } }]);
        });
        expect(controller.moveNode).toHaveBeenCalledWith('a', { x: 5, y: 6 });
    });

    it('forwards a remove change to the model', () => {
        const { result } = renderHook(() => useFlowNodes(controller, 'light'));
        act(() => {
            result.current.onNodesChange([{ id: 'b', type: 'remove' }]);
        });
        expect(controller.deleteNode).toHaveBeenCalledWith('b');
    });

    it('re-syncs local nodes when the model adds a node', () => {
        const { result, rerender } = renderHook((c: WorkflowGraphController) => useFlowNodes(c, 'light'), {
            initialProps: controller,
        });
        const grown = controllerStub(
            { nodes: [node('a'),
                node('b'),
                node('c')], edges: [] },
            [{ id: 'a', x: 0, y: 0 },
                { id: 'b', x: 100, y: 0 },
                { id: 'c', x: 200, y: 0 }],
        );
        rerender(grown);
        expect(result.current.nodes.map((n) => n.id)).toEqual(['a',
            'b',
            'c']);
    });

    it('re-syncs local nodes when the model removes a node', () => {
        const { result, rerender } = renderHook((c: WorkflowGraphController) => useFlowNodes(c, 'light'), {
            initialProps: controller,
        });
        const shrunk = controllerStub({ nodes: [node('a')], edges: [] }, [{ id: 'a', x: 0, y: 0 }]);
        rerender(shrunk);
        expect(result.current.nodes.map((n) => n.id)).toEqual(['a']);
    });

    it('adopts new positions when the model re-lays out', () => {
        const { result, rerender } = renderHook((c: WorkflowGraphController) => useFlowNodes(c, 'light'), {
            initialProps: controller,
        });
        const relaid = controllerStub(
            { nodes: [node('a', 'Job', 'Copy'), node('b')], edges: [] },
            [{ id: 'a', x: 50, y: 50 }, { id: 'b', x: 300, y: 50 }],
        );
        rerender(relaid);
        const a = result.current.nodes.find((n) => n.id === 'a');
        expect(a?.position).toEqual({ x: 50, y: 50 });
    });

    it('reflects a data change (node renamed in the model)', () => {
        const { result, rerender } = renderHook((c: WorkflowGraphController) => useFlowNodes(c, 'light'), {
            initialProps: controller,
        });
        const renamed = controllerStub(
            { nodes: [node('a', 'Job', 'Renamed'), node('b')], edges: [] },
            [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
        );
        rerender(renamed);
        const a = result.current.nodes.find((n) => n.id === 'a');
        expect(a?.data).toEqual({ stepType: 'Job', name: 'Renamed', colorMode: 'light' });
    });
});



