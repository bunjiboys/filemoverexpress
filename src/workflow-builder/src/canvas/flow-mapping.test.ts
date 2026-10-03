import { describe, it, expect } from 'vitest';
import { toFlowNodes, toFlowEdges, edgeId, parseEdgeId, connectionToEdge } from './flow-mapping';
import type { WorkflowGraph } from '../workflow/graph';
import type { PositionedNode } from '../layout/layout';

const node = (id: string, type = 'Sleep', name?: string): WorkflowGraph['nodes'][number] => ({
    id,
    type,
    name,
    with: { duration: '1s' },
    continueOnError: false,
});

// The canvas is a projection of the single-source-of-truth graph model (docs section
// 6, 10). toFlowNodes/toFlowEdges turn the model (plus computed positions) into the
// React Flow shapes the <ReactFlow> component renders; the mapping is pure so it is
// unit-tested here rather than through the un-renderable canvas.
describe('toFlowNodes', () => {
    it('maps model nodes to React Flow nodes at their positioned coordinates', () => {
        const graph: WorkflowGraph = { nodes: [node('a', 'Job', 'Copy')], edges: [] };
        const positions: PositionedNode[] = [{ id: 'a', x: 10, y: 20 }];
        const result = toFlowNodes(graph, positions);
        expect(result).toEqual([
            {
                id: 'a',
                type: 'workflow',
                position: { x: 10, y: 20 },
                data: { stepType: 'Job', name: 'Copy' },
            },
        ]);
    });

    it('falls back to the origin for a node with no computed position', () => {
        const graph: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const result = toFlowNodes(graph, []);
        expect(result[0].position).toEqual({ x: 0, y: 0 });
    });

    it('carries an undefined name through as undefined', () => {
        const graph: WorkflowGraph = { nodes: [node('a')], edges: [] };
        const result = toFlowNodes(graph, [{ id: 'a', x: 0, y: 0 }]);
        expect(result[0].data).toEqual({ stepType: 'Sleep', name: undefined });
    });
});

describe('toFlowEdges', () => {
    it('maps model edges to React Flow edges with a stable derived id', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'), node('b')],
            edges: [{ source: 'a', target: 'b' }],
        };
        expect(toFlowEdges(graph)).toEqual([
            { id: 'a->b', source: 'a', target: 'b' },
        ]);
    });

    it('maps multiple edges preserving order', () => {
        const graph: WorkflowGraph = {
            nodes: [node('a'),
                node('b'),
                node('c')],
            edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
        };
        expect(toFlowEdges(graph).map((e) => e.id)).toEqual(['a->b', 'a->c']);
    });
});

describe('edgeId', () => {
    it('derives a stable id from the endpoints', () => {
        expect(edgeId({ source: 'x', target: 'y' })).toBe('x->y');
    });
});

describe('parseEdgeId', () => {
    it('round-trips an id produced by edgeId', () => {
        expect(parseEdgeId('x->y')).toEqual({ source: 'x', target: 'y' });
    });

    it('returns undefined for an id with no separator', () => {
        expect(parseEdgeId('not-an-edge')).toBeUndefined();
    });

    it('splits on the first separator so a node id may contain the arrow', () => {
        expect(parseEdgeId('a->b->c')).toEqual({ source: 'a', target: 'b->c' });
    });
});

describe('connectionToEdge', () => {
    it('maps a complete connection to a dependency edge', () => {
        expect(connectionToEdge({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null }))
            .toEqual({ source: 'a', target: 'b' });
    });

    it('returns undefined when the source is missing', () => {
        expect(connectionToEdge({ source: null, target: 'b', sourceHandle: null, targetHandle: null } as never))
            .toBeUndefined();
    });

    it('returns undefined when the target is missing', () => {
        expect(connectionToEdge({ source: 'a', target: null, sourceHandle: null, targetHandle: null } as never))
            .toBeUndefined();
    });
});
