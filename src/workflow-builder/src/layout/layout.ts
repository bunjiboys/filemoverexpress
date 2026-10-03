import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { WorkflowGraph } from '../workflow/graph';

// Cardinal flow directions the user can switch between (docs section 8). These are
// ELK's own direction tokens.
export type FlowDirection = 'RIGHT' | 'DOWN';

export interface PositionedNode {
    id: string;
    x: number;
    y: number;
}

// Fixed node box used for layout. The canvas renders its own node chrome; these are
// just the dimensions ELK reserves so nodes do not overlap.
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

const elk = new ELK();

// Compute a layered (Sugiyama) layout for the graph using ELK (docs section 8):
// longest-path layering, crossing minimization (LAYER_SWEEP), and balanced
// node placement (BRANDES_KOEPF) so fork/join diamonds read cleanly with the fewest
// crossings. `direction` picks left-to-right (RIGHT) or top-to-bottom (DOWN).
export async function layoutGraph(
    graph: WorkflowGraph,
    direction: FlowDirection = 'RIGHT',
): Promise<PositionedNode[]> {
    if (graph.nodes.length === 0) {
        return [];
    }

    const elkGraph: ElkNode = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction,
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.layered.spacing.nodeNodeBetweenLayers': '80',
            'elk.spacing.nodeNode': '40',
        },
        children: graph.nodes.map((n) => ({
            id: n.id,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        })),
        edges: graph.edges.map((e, i) => ({
            id: `e${i}`,
            sources: [e.source],
            targets: [e.target],
        })),
    };

    const laidOut = await elk.layout(elkGraph);
    // The empty-graph case returned early above, so after a resolved layout ELK has
    // produced one positioned child per input node, each with x/y set.
    const children = laidOut.children as (ElkNode & { x: number; y: number })[];
    return children.map((child) => ({
        id: child.id,
        x: child.x,
        y: child.y,
    }));
}
