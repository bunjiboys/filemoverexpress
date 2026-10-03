import { describe, it, expect } from 'vitest';
import { layoutGraph, type FlowDirection } from './layout';
import type { WorkflowGraph } from '../workflow/graph';

const node = (id: string): WorkflowGraph['nodes'][number] => ({
    id,
    type: 'Sleep',
    with: { duration: '1s' },
    continueOnError: false,
});

// a -> b -> c chain, plus an independent root d.
const chain: WorkflowGraph = {
    nodes: [node('a'),
        node('b'),
        node('c'),
        node('d')],
    edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
};

const pos = (positioned: Awaited<ReturnType<typeof layoutGraph>>, id: string): { x: number; y: number } => {
    const n = positioned.find((p) => p.id === id);
    if (n === undefined) {
        throw new Error(`node ${id} not found`);
    }
    return { x: n.x, y: n.y };
};

describe('layoutGraph', () => {
    it('returns a position for every node', async () => {
        const result = await layoutGraph(chain, 'RIGHT');
        expect(result.map((n) => n.id).sort()).toEqual(['a',
            'b',
            'c',
            'd']);
        for (const n of result) {
            expect(typeof n.x).toBe('number');
            expect(typeof n.y).toBe('number');
        }
    });

    it('left-to-right: a dependency sits to the left of its dependent', async () => {
        const result = await layoutGraph(chain, 'RIGHT');
        expect(pos(result, 'a').x).toBeLessThan(pos(result, 'b').x);
        expect(pos(result, 'b').x).toBeLessThan(pos(result, 'c').x);
    });

    it('top-to-bottom: a dependency sits above its dependent', async () => {
        const result = await layoutGraph(chain, 'DOWN');
        expect(pos(result, 'a').y).toBeLessThan(pos(result, 'b').y);
        expect(pos(result, 'b').y).toBeLessThan(pos(result, 'c').y);
    });

    it('is deterministic: same input yields the same positions', async () => {
        const a = await layoutGraph(chain, 'RIGHT');
        const b = await layoutGraph(chain, 'RIGHT');
        expect(a).toEqual(b);
    });

    it('lays out an empty graph as an empty result', async () => {
        const result = await layoutGraph({ nodes: [], edges: [] }, 'RIGHT');
        expect(result).toEqual([]);
    });

    it('defaults to left-to-right when no direction is given', async () => {
        const result = await layoutGraph(chain);
        expect(pos(result, 'a').x).toBeLessThan(pos(result, 'c').x);
    });

    it('places a fork-join diamond without overlapping the branches', async () => {
        // a forks to b and c, which both join at d.
        const diamond: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c'),
                node('d')],
            edges: [
                { source: 'a', target: 'b' },
                { source: 'a', target: 'c' },
                { source: 'b', target: 'd' },
                { source: 'c', target: 'd' },
            ],
        };
        const result = await layoutGraph(diamond, 'RIGHT');
        // The two branch nodes share a layer (same x) but differ in y so they do not
        // overlap; the join sits past both.
        expect(pos(result, 'b').y).not.toBe(pos(result, 'c').y);
        expect(pos(result, 'd').x).toBeGreaterThan(pos(result, 'b').x);
    });
});

// Type export sanity.
const _dir: FlowDirection = 'DOWN';
void _dir;
