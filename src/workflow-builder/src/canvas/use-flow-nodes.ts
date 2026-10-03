import { useCallback, useEffect, useRef, useState } from 'react';
import { applyNodeChanges, type OnNodesChange } from '@xyflow/react';
import { toFlowNodes, type FlowNode } from './flow-mapping';
import { applyNodeChangesToModel } from './flow-change-handlers';
import type { WorkflowGraphController } from './use-workflow-graph';

export interface FlowNodesController {
    nodes: FlowNode[];
    onNodesChange: OnNodesChange<FlowNode>;
}

// Keep React Flow's CONTROLLED node state (error#015). In controlled mode React Flow
// stores no node state of its own, so the changes it emits to initialize a node -
// measurement/dimensions - must be applied back into the nodes array or the node is
// never "initialized" and cannot be dragged. This hook holds those React-Flow-owned
// view fields (measured, selected, dragging) in local state via applyNodeChanges,
// while the graph model (the controller) stays authoritative for structure: it
// reconciles local nodes with the model when the model's ids/positions/data change,
// and forwards position (drag) and remove changes to the model.
export function useFlowNodes(controller: WorkflowGraphController): FlowNodesController {
    const [nodes, setNodes] = useState<FlowNode[]>(() =>
        toFlowNodes(controller.graph, controller.positions),
    );
    // A signature of the model's node projection; the reconciliation effect only runs
    // when it changes, so applying a local-only change (dimensions, selection) does
    // not re-trigger a model->local sync and loop.
    const projected = toFlowNodes(controller.graph, controller.positions);
    const signature = projectionSignature(projected);
    const lastSignature = useRef(signature);

    useEffect(() => {
        if (lastSignature.current === signature) {
            return;
        }
        lastSignature.current = signature;
        setNodes((current) => reconcile(current, projected));
        // projected is recomputed each render but is fully described by `signature`;
        // depending on the signature keeps the effect from firing on local-only edits.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    const onNodesChange = useCallback<OnNodesChange<FlowNode>>((changes) => {
        // Apply EVERY change locally so React Flow's own init/measurement/selection
        // state is preserved, then mirror the structural ones into the model.
        setNodes((current) => applyNodeChanges<FlowNode>(changes, current));
        applyNodeChangesToModel(controller, changes);
    }, [controller]);

    return { nodes, onNodesChange };
}

// Merge the model projection into the current local nodes: keep each surviving node's
// React-Flow-owned view fields (measured dimensions, selection, drag state) but adopt
// the model's position and data; add nodes new to the model; drop nodes the model no
// longer has. Order follows the model.
function reconcile(current: FlowNode[], projected: FlowNode[]): FlowNode[] {
    const byId = new Map(current.map((n) => [n.id, n]));
    return projected.map((p) => {
        const existing = byId.get(p.id);
        if (existing === undefined) {
            return p;
        }
        return { ...existing, position: p.position, data: p.data };
    });
}

// Stable string capturing exactly the model-owned fields (id, position, data) so a
// local-only change (dimensions/selection) does not change it.
function projectionSignature(projected: FlowNode[]): string {
    return projected
        .map((n) => `${n.id}:${n.position.x},${n.position.y}:${n.data.stepType}:${n.data.name ?? ''}`)
        .join('|');
}
