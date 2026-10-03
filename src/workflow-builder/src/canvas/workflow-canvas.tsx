import { useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type Connection,
    type EdgeChange,
    type IsValidConnection,
    type NodeChange,
    type NodeTypes,
} from '@xyflow/react';
import type { WorkflowGraphController } from './use-workflow-graph';
import { connectionToEdge, toFlowEdges, toFlowNodes, WORKFLOW_NODE_TYPE } from './flow-mapping';
import { WorkflowNodeView } from './workflow-node';
import { applyEdgeChangesToModel, applyNodeChangesToModel } from './flow-change-handlers';
import { readDroppedStepType } from './drop';

export interface WorkflowCanvasProps {
    controller: WorkflowGraphController;
}

// One custom node type handles every step type (it branches on data.stepType).
const NODE_TYPES: NodeTypes = { [WORKFLOW_NODE_TYPE]: WorkflowNodeView };

// The Visual-mode canvas (docs sections 4, 5, 8): a thin wrapper over React Flow that
// projects the single-source-of-truth graph (via the controller) into nodes/edges,
// routes React Flow's change/connect callbacks back into model mutations, forbids a
// cycle-creating connection at draw time (isValidConnection), and accepts a palette
// drop to add a node. All the real logic lives in the pure modules it composes
// (flow-mapping, flow-change-handlers, drop, cycle); React Flow itself only draws.
export function WorkflowCanvas({ controller }: WorkflowCanvasProps): React.JSX.Element {
    const nodes = useMemo(
        () => toFlowNodes(controller.graph, controller.positions),
        [controller.graph, controller.positions],
    );
    const edges = useMemo(() => toFlowEdges(controller.graph), [controller.graph]);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => applyNodeChangesToModel(controller, changes),
        [controller],
    );
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => applyEdgeChangesToModel(controller, changes),
        [controller],
    );
    const onConnect = useCallback((connection: Connection) => {
        const edge = connectionToEdge(connection);
        if (edge !== undefined) {
            controller.connect(edge);
        }
    }, [controller]);
    const isValidConnection = useCallback<IsValidConnection>((connection) => {
        const edge = connectionToEdge(connection as Connection);
        return edge !== undefined && controller.isValidConnection(edge);
    }, [controller]);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const type = readDroppedStepType(event.dataTransfer);
        if (type !== undefined) {
            controller.addNode(type);
        }
    }, [controller]);
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
    }, []);

    return (
        <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                fitView
                deleteKeyCode={['Backspace', 'Delete']}
            >
                <Background />
                <Controls />
                <MiniMap />
            </ReactFlow>
        </div>
    );
}
