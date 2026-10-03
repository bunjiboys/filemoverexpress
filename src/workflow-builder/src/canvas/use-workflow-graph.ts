import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowEdge, WorkflowGraph } from '../workflow/graph';
import { layoutGraph, type FlowDirection, type PositionedNode } from '../layout/layout';
import { wouldCreateCycle, type CandidateEdge } from './cycle';
import {
    addNode as addNodeReducer,
    connectNodes,
    deleteEdge as deleteEdgeReducer,
    deleteNode as deleteNodeReducer,
    updateNode as updateNodeReducer,
    clearNodeEdges as clearNodeEdgesReducer,
    updateDocument as updateDocumentReducer,
    type NodePatch,
    type DocumentPatch,
} from './graph-mutations';

export interface Point {
    x: number;
    y: number;
}

// What the canvas (and App) drive the graph through. The hook owns the single
// source-of-truth model and the builder-only node positions (docs sections 6, 10);
// every mutation goes through here so the editor can re-serialize from one model.
export interface WorkflowGraphController {
    graph: WorkflowGraph;
    positions: PositionedNode[];
    // Increments each time a layout pass runs, so the canvas can fit-to-view then.
    fitSignal: number;
    addNode: (type: string) => void;
    deleteNode: (id: string) => void;
    updateNode: (id: string, patch: NodePatch) => void;
    clearConnections: (id: string) => void;
    setDocument: (patch: DocumentPatch) => void;
    connect: (edge: WorkflowEdge) => void;
    deleteEdge: (edge: WorkflowEdge) => void;
    moveNode: (id: string, position: Point) => void;
    isValidConnection: (edge: CandidateEdge) => boolean;
    relayout: () => void;
    setGraph: (graph: WorkflowGraph) => void;
}

// The lifted state hook: owns the workflow graph model, computes a layered layout on
// structural change, and overlays manual drag positions. Visual (canvas) and Editor
// views both project from the model this hook holds, keeping them in sync (docs
// section 10). Layout math is in layout/ (async ELK); this hook only orchestrates
// when it runs and how its result merges with hand-placed positions.
export function useWorkflowGraph(
    initial: WorkflowGraph,
    direction: FlowDirection = 'RIGHT',
): WorkflowGraphController {
    const [graph, setGraphState] = useState<WorkflowGraph>(initial);
    const [positions, setPositions] = useState<PositionedNode[]>([]);
    // Bumped by relayout() to force a fresh layout that discards manual positions.
    const [relayoutEpoch, setRelayoutEpoch] = useState(0);
    // Bumped each time a layout pass sets positions (load, structural change,
    // relayout), so the canvas can fit the viewport to the whole graph then - but not
    // on a plain drag, which does not run layout.
    const [fitSignal, setFitSignal] = useState(0);
    // Latest positions, read inside the async layout effect without making it depend
    // on (and re-run from) every drag.
    const positionsRef = useRef<PositionedNode[]>(positions);
    positionsRef.current = positions;
    // When true, the next layout keeps existing manual positions; relayout() clears it
    // so the computed layout wins.
    const preserveManualRef = useRef(true);

    // Recompute layout whenever the graph structure or direction changes, or relayout
    // is requested. The computed positions are overlaid with retained manual ones for
    // nodes that still exist, so a hand-arranged node is not snapped back by an
    // unrelated edit (docs section 9); a forced relayout drops them.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const computed = await layoutGraph(graph, direction);
            if (cancelled) {
                return;
            }
            const manual = preserveManualRef.current
                ? new Map(positionsRef.current.map((p) => [p.id, p]))
                : new Map<string, PositionedNode>();
            preserveManualRef.current = true;
            setPositions(computed.map((p) => manual.get(p.id) ?? p));
            setFitSignal((s) => s + 1);
        })();
        return () => {
            cancelled = true;
        };
    }, [graph,
        direction,
        relayoutEpoch]);

    const addNode = useCallback((type: string) => {
        setGraphState((g) => addNodeReducer(g, type));
    }, []);

    const deleteNode = useCallback((id: string) => {
        setGraphState((g) => deleteNodeReducer(g, id));
    }, []);

    // Property-modal save: patch one node's name/with/continueOnError. The structure
    // (nodes/edges) is unchanged, so the layout re-run overlays existing positions and
    // nothing visibly moves.
    const updateNode = useCallback((id: string, patch: NodePatch) => {
        setGraphState((g) => updateNodeReducer(g, id, patch));
    }, []);

    // Right-click "clear connections": drop every edge touching the node, keeping the
    // node itself. Structure changes, so layout re-runs and overlays existing positions.
    const clearConnections = useCallback((id: string) => {
        setGraphState((g) => clearNodeEdgesReducer(g, id));
    }, []);

    // Document panel save: patch metadata/parameters/defaults. Nodes/edges unchanged,
    // so the layout re-run overlays existing positions and nothing visibly moves.
    const setDocument = useCallback((patch: DocumentPatch) => {
        setGraphState((g) => updateDocumentReducer(g, patch));
    }, []);

    const connect = useCallback((edge: WorkflowEdge) => {
        setGraphState((g) => (wouldCreateCycle(g, edge) ? g : connectNodes(g, edge)));
    }, []);

    const deleteEdge = useCallback((edge: WorkflowEdge) => {
        setGraphState((g) => deleteEdgeReducer(g, edge));
    }, []);

    // Move is position-only state and must not re-run layout, so it writes positions
    // directly rather than touching the graph model.
    const moveNode = useCallback((id: string, position: Point) => {
        setPositions((ps) => ps.map((p) => (p.id === id ? { id, x: position.x, y: position.y } : p)));
    }, []);

    const isValidConnection = useCallback(
        (edge: CandidateEdge) => !wouldCreateCycle(graph, edge),
        [graph],
    );

    const relayout = useCallback(() => {
        preserveManualRef.current = false;
        setRelayoutEpoch((e) => e + 1);
    }, []);

    const setGraph = useCallback((next: WorkflowGraph) => {
        setGraphState(next);
    }, []);

    return {
        graph,
        positions,
        fitSignal,
        addNode,
        deleteNode,
        updateNode,
        clearConnections,
        setDocument,
        connect,
        deleteEdge,
        moveNode,
        isValidConnection,
        relayout,
        setGraph,
    };
}
