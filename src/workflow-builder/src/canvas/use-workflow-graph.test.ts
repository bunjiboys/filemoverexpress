import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkflowGraph } from './use-workflow-graph';
import type { WorkflowGraph } from '../workflow/graph';
import type { PositionedNode } from '../layout/layout';

// layoutGraph wraps ELK, which is async and does not run meaningfully in jsdom; mock
// it at the module boundary so the hook's layout wiring is testable with deterministic
// positions (docs section 13). Real layout math is covered by layout.test.ts.
const layoutGraph = vi.fn<(graph: WorkflowGraph) => Promise<PositionedNode[]>>();
vi.mock('../layout/layout', () => ({
    layoutGraph: (graph: WorkflowGraph) => layoutGraph(graph),
}));

const node = (id: string, type = 'Sleep'): WorkflowGraph['nodes'][number] => ({
    id,
    type,
    with: {},
    continueOnError: false,
});

beforeEach(() => {
    layoutGraph.mockReset();
    // Default: lay every node out at a fixed spot keyed by index.
    layoutGraph.mockImplementation((graph) =>
        Promise.resolve(graph.nodes.map((n, i) => ({ id: n.id, x: i * 100, y: 0 }))),
    );
});

describe('useWorkflowGraph', () => {
    it('starts from the initial graph and lays it out', async () => {
        const initial: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));

        expect(result.current.graph.nodes.map((n) => n.id)).toEqual(['a', 'b']);
        await waitFor(() => expect(result.current.positions).toHaveLength(2));
        expect(result.current.positions).toEqual([
            { id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 },
        ]);
    });

    it('adds a node and re-lays out, assigning it a position', async () => {
        const { result } = renderHook(() => useWorkflowGraph({ nodes: [], edges: [] }));
        await waitFor(() => expect(layoutGraph).toHaveBeenCalled());

        act(() => result.current.addNode('Job'));

        expect(result.current.graph.nodes.map((n) => n.type)).toEqual(['Job']);
        await waitFor(() => expect(result.current.positions).toHaveLength(1));
    });

    it('deletes a node and its edges', async () => {
        const initial: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        await act(async () => result.current.deleteNode('a'));

        expect(result.current.graph.nodes.map((n) => n.id)).toEqual(['b']);
        expect(result.current.graph.edges).toEqual([]);
    });

    it('connects two nodes when the connection does not create a cycle', async () => {
        const initial: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        await act(async () => result.current.connect({ source: 'a', target: 'b' }));

        expect(result.current.graph.edges).toEqual([{ source: 'a', target: 'b' }]);
    });

    it('refuses a connection that would create a cycle', async () => {
        const initial: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        act(() => result.current.connect({ source: 'b', target: 'a' }));

        // The back edge is rejected, so only the original edge remains.
        expect(result.current.graph.edges).toEqual([{ source: 'a', target: 'b' }]);
    });

    it('reports connection validity via isValidConnection', async () => {
        const initial: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        expect(result.current.isValidConnection({ source: 'a', target: 'b' })).toBe(true);
        expect(result.current.isValidConnection({ source: 'b', target: 'a' })).toBe(false);
    });

    it('deletes an edge', async () => {
        const initial: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        await act(async () => result.current.deleteEdge({ source: 'a', target: 'b' }));

        expect(result.current.graph.edges).toEqual([]);
    });

    it('updates a node payload through the controller', async () => {
        const initial: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(1));

        act(() => result.current.updateNode('a', { name: 'Pause', with: { duration: '9s' } }));

        expect(result.current.graph.nodes[0].name).toBe('Pause');
        expect(result.current.graph.nodes[0].with).toEqual({ duration: '9s' });
    });

    it('clears a node\'s connections through the controller', async () => {
        const initial: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        await act(async () => result.current.clearConnections('b'));

        expect(result.current.graph.edges).toEqual([]);
        expect(result.current.graph.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    });

    it('updates document fields through the controller', async () => {
        const initial: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(1));

        act(() => result.current.setDocument({ metadata: { name: 'Flow' }, defaults: { force: true } }));

        expect(result.current.graph.metadata).toEqual({ name: 'Flow' });
        expect(result.current.graph.defaults).toEqual({ force: true });
    });

    it('moves a node to a new position without re-running layout', async () => {
        const initial: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(1));
        layoutGraph.mockClear();

        act(() => result.current.moveNode('a', { x: 42, y: 7 }));

        expect(result.current.positions).toEqual([{ id: 'a', x: 42, y: 7 }]);
        expect(layoutGraph).not.toHaveBeenCalled();
    });

    it('re-runs layout on demand, discarding manual positions', async () => {
        const initial: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(1));
        act(() => result.current.moveNode('a', { x: 42, y: 7 }));
        layoutGraph.mockClear();

        act(() => result.current.relayout());

        await waitFor(() => expect(layoutGraph).toHaveBeenCalled());
        await waitFor(() => expect(result.current.positions).toEqual([{ id: 'a', x: 0, y: 0 }]));
    });

    it('replaces the whole model via setGraph (editor-driven sync) and re-lays out', async () => {
        const { result } = renderHook(() => useWorkflowGraph({ nodes: [], edges: [] }));
        await waitFor(() => expect(layoutGraph).toHaveBeenCalled());
        layoutGraph.mockClear();

        const next: WorkflowGraph = { nodes: [node('x'), node('y')], edges: [] };
        act(() => result.current.setGraph(next));

        expect(result.current.graph.nodes.map((n) => n.id)).toEqual(['x', 'y']);
        await waitFor(() => expect(layoutGraph).toHaveBeenCalled());
    });

    it('preserves a manual position for a node that survives a model edit', async () => {
        const initial: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] };
        const { result } = renderHook(() => useWorkflowGraph(initial));
        await waitFor(() => expect(result.current.positions).toHaveLength(2));
        act(() => result.current.moveNode('a', { x: 500, y: 500 }));

        // Deleting b should not disturb a's hand-placed position.
        act(() => result.current.deleteNode('b'));

        await waitFor(() => expect(result.current.positions).toContainEqual({ id: 'a', x: 500, y: 500 }));
    });
});
