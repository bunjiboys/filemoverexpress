import { describe, it, expect } from 'vitest';
import {
    addNode,
    deleteNode,
    connectNodes,
    deleteEdge,
    nextNodeId,
} from './graph-mutations';
import type { WorkflowGraph } from '../workflow/graph';

const node = (id: string, type = 'Sleep'): WorkflowGraph['nodes'][number] => ({
    id,
    type,
    with: {},
    continueOnError: false,
});

const empty: WorkflowGraph = { nodes: [], edges: [] };

// Pure reducers over the graph model: the canvas interactions (drop a palette node,
// wire two ports, delete a node/edge) are expressed as model transforms so the real
// correctness lives in fast unit tests, not the un-renderable React Flow component
// (docs section 13). Every reducer returns a NEW graph and never mutates its input.
describe('nextNodeId', () => {
    it('generates step-1 for an empty graph', () => {
        expect(nextNodeId(empty)).toBe('step-1');
    });

    it('skips ids already in use so generated ids stay unique', () => {
        const graph: WorkflowGraph = { nodes: [node('step-1'), node('step-2')], edges: [] };
        expect(nextNodeId(graph)).toBe('step-3');
    });

    it('ignores non-step ids when numbering', () => {
        const graph: WorkflowGraph = { nodes: [node('copy'), node('step-5')], edges: [] };
        expect(nextNodeId(graph)).toBe('step-6');
    });

    it('ignores a step-prefixed id whose suffix is not an integer', () => {
        const graph: WorkflowGraph = { nodes: [node('step-abc'), node('step-2')], edges: [] };
        expect(nextNodeId(graph)).toBe('step-3');
    });

    it('tracks the maximum regardless of id order', () => {
        const graph: WorkflowGraph = { nodes: [node('step-7'), node('step-3')], edges: [] };
        expect(nextNodeId(graph)).toBe('step-8');
    });
});

describe('addNode', () => {
    it('adds a node of the given type with a generated id and empty payload', () => {
        const result = addNode(empty, 'Job');
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0]).toEqual({
            id: 'step-1',
            type: 'Job',
            with: {},
            continueOnError: false,
        });
    });

    it('does not mutate the input graph', () => {
        addNode(empty, 'Sleep');
        expect(empty.nodes).toHaveLength(0);
    });

    it('leaves edges untouched', () => {
        const graph: WorkflowGraph = { nodes: [node('step-1')], edges: [] };
        const result = addNode(graph, 'Checksum');
        expect(result.edges).toEqual([]);
        expect(result.nodes.map((n) => n.id)).toEqual(['step-1', 'step-2']);
    });
});

describe('deleteNode', () => {
    it('removes the node and every edge touching it', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c')],
            edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
        };
        const result = deleteNode(graph, 'b');
        expect(result.nodes.map((n) => n.id)).toEqual(['a', 'c']);
        expect(result.edges).toEqual([]);
    });

    it('is a no-op for an unknown id', () => {
        const graph: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const result = deleteNode(graph, 'ghost');
        expect(result.nodes.map((n) => n.id)).toEqual(['a']);
    });

    it('preserves document-level metadata/parameters/defaults', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a')],
            edges: [],
            metadata: { name: 'wf' },
            parameters: [{ name: 'p' }],
            defaults: { force: true },
        };
        const result = deleteNode(graph, 'a');
        expect(result.metadata).toEqual({ name: 'wf' });
        expect(result.parameters).toEqual([{ name: 'p' }]);
        expect(result.defaults).toEqual({ force: true });
    });
});

describe('connectNodes', () => {
    it('adds a dependency edge', () => {
        const graph: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] };
        const result = connectNodes(graph, { source: 'a', target: 'b' });
        expect(result.edges).toEqual([{ source: 'a', target: 'b' }]);
    });

    it('does not duplicate an edge that already exists', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const result = connectNodes(graph, { source: 'a', target: 'b' });
        expect(result.edges).toEqual([{ source: 'a', target: 'b' }]);
    });
});

describe('deleteEdge', () => {
    it('removes the matching edge and leaves others', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c')],
            edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
        };
        const result = deleteEdge(graph, { source: 'a', target: 'b' });
        expect(result.edges).toEqual([{ source: 'b', target: 'c' }]);
    });

    it('is a no-op when the edge is absent', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        const result = deleteEdge(graph, { source: 'b', target: 'a' });
        expect(result.edges).toEqual([{ source: 'a', target: 'b' }]);
    });
});
