import { describe, it, expect } from 'vitest';
import { validateGraph } from './validate-graph';
import type { WorkflowGraph } from './graph';

const node = (id: string, type = 'Sleep'): WorkflowGraph['nodes'][number] => ({
    id,
    type,
    with: { duration: '1s' },
    continueOnError: false,
});

// Structural validation the JSON Schema cannot express (docs section 7):
// unique ids, acyclic graph, and dependsOn/edge reference integrity.
describe('validateGraph', () => {
    it('accepts a valid acyclic graph with unique ids and resolvable edges', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c')],
            edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
        };
        expect(validateGraph(graph)).toEqual({ valid: true, errors: [] });
    });

    it('flags duplicate node ids', () => {
        const graph: WorkflowGraph = { nodes: [node('a'), node('a')], edges: [] };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /duplicate id: a/i.test(e))).toBe(true);
    });

    it('flags an edge referencing an unknown node', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a')],
            edges: [{ source: 'a', target: 'ghost' }],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /unknown node: ghost/i.test(e))).toBe(true);
    });

    it('flags an edge whose source is unknown', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a')],
            edges: [{ source: 'ghost', target: 'a' }],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /unknown node: ghost/i.test(e))).toBe(true);
    });

    it('flags a cycle', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
        };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /cycle/i.test(e))).toBe(true);
    });

    it('flags a self-loop as a cycle', () => {
        const graph: WorkflowGraph = { nodes: [node('a')], edges: [{ source: 'a', target: 'a' }] };
        const result = validateGraph(graph);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /cycle/i.test(e))).toBe(true);
    });
});
