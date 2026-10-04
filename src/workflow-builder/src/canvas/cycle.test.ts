import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from './cycle';
import type { WorkflowGraph } from '../workflow/graph';

const node = (id: string): WorkflowGraph['nodes'][number] => ({
    id,
    type: 'Sleep',
    with: { duration: '1s' },
    continueOnError: false,
});

// A candidate edge is only safe to draw if adding it keeps the graph acyclic
// (docs/designs/workflows/Workflow-Builder-App.md sections 2, 7): the canvas forbids a connection at
// draw time rather than surfacing a cycle at export. wouldCreateCycle is the pure
// predicate behind React Flow's isValidConnection hook.
describe('wouldCreateCycle', () => {
    it('allows an edge that keeps the graph acyclic', () => {
        const graph: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] };
        expect(wouldCreateCycle(graph, { source: 'a', target: 'b' })).toBe(false);
    });

    it('rejects a direct back edge that closes a 2-cycle', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        expect(wouldCreateCycle(graph, { source: 'b', target: 'a' })).toBe(true);
    });

    it('rejects a self-loop', () => {
        const graph: WorkflowGraph = { nodes: [node('a')], edges: [] };
        expect(wouldCreateCycle(graph, { source: 'a', target: 'a' })).toBe(true);
    });

    it('rejects an edge that closes a longer cycle (a->b->c, then c->a)', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c')],
            edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
        };
        expect(wouldCreateCycle(graph, { source: 'c', target: 'a' })).toBe(true);
    });

    it('allows a fan-in join that does not create a cycle (diamond close)', () => {
        // a -> b, a -> c, b -> d; adding c -> d completes a diamond, still acyclic.
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c'),
                node('d')],
            edges: [{ source: 'a', target: 'b' },
                { source: 'a', target: 'c' },
                { source: 'b', target: 'd' }],
        };
        expect(wouldCreateCycle(graph, { source: 'c', target: 'd' })).toBe(false);
    });

    it('treats an already-present duplicate edge as safe (no new reachability)', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        expect(wouldCreateCycle(graph, { source: 'a', target: 'b' })).toBe(false);
    });

    it('allows an edge from an unreached node, traversing a diamond without looping', () => {
        // a -> b, a -> c, b -> d, c -> d: a diamond whose join d is reached by two
        // paths, so the reachability DFS pushes d twice and must skip the second visit.
        // Node z is unreachable from a, so the edge z -> a is safe.
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c'),
                node('d'),
                node('z')],
            edges: [{ source: 'a', target: 'b' },
                { source: 'a', target: 'c' },
                { source: 'b', target: 'd' },
                { source: 'c', target: 'd' }],
        };
        expect(wouldCreateCycle(graph, { source: 'z', target: 'a' })).toBe(false);
    });
});
