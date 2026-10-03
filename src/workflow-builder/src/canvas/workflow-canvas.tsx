import { useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type Connection,
    type EdgeChange,
    type IsValidConnection,
    type NodeTypes,
} from '@xyflow/react';
import type { WorkflowGraphController } from './use-workflow-graph';
import { connectionToEdge, toFlowEdges, WORKFLOW_NODE_TYPE } from './flow-mapping';
import { WorkflowNodeView } from './workflow-node';
import { useFlowNodes } from './use-flow-nodes';
import { applyEdgeChangesToModel } from './flow-change-handlers';
import { readDroppedStepType } from './drop';

export interface WorkflowCanvasProps {
    controller: WorkflowGraphController;
    // Open the property editor for a node (double-click).
    onEditNode: (id: string) => void;
}

// One custom node type handles every step type (it branches on data.stepType).
const NODE_TYPES: NodeTypes = { [WORKFLOW_NODE_TYPE]: WorkflowNodeView };

// The Visual-mode canvas (docs sections 4, 5, 8): a thin wrapper over React Flow that
// projects the single-source-of-truth graph (via the controller) into nodes/edges,
// routes React Flow's change/connect callbacks back into model mutations, forbids a
// cycle-creating connection at draw time (isValidConnection), and accepts a palette
// drop to add a node. Node view state is controlled through useFlowNodes so React Flow
// can initialize and drag nodes; the real logic lives in the pure modules it composes
// (flow-mapping, flow-change-handlers, use-flow-nodes, drop, cycle).
export function WorkflowCanvas({ controller, onEditNode }: WorkflowCanvasProps): React.JSX.Element {
    const { nodes, onNodesChange } = useFlowNodes(controller);
    const edges = useMemo(() => toFlowEdges(controller.graph), [controller.graph]);

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

    const onNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: { id: string }) => onEditNode(node.id),
        [onEditNode],
    );

    return (
        <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDoubleClick={onNodeDoubleClick}
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
