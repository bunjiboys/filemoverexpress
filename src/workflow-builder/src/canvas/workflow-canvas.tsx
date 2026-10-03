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
import type { ColorMode } from '../app/use-color-mode';

export interface ContextMenuTarget {
    kind: 'node' | 'edge';
    id: string;
    x: number;
    y: number;
}

export interface WorkflowCanvasProps {
    controller: WorkflowGraphController;
    // Open the property editor for a node (double-click).
    onEditNode: (id: string) => void;
    // Open the right-click context menu for a node or edge at a screen position.
    onContextMenu: (target: ContextMenuTarget) => void;
    // Active color mode, carried onto each node so it themes itself.
    colorMode: ColorMode;
}

// One custom node type handles every step type (it branches on data.stepType).
const NODE_TYPES: NodeTypes = { [WORKFLOW_NODE_TYPE]: WorkflowNodeView };

// The Visual-mode canvas (docs sections 4, 5, 8): a thin wrapper over React Flow that
// projects the single-source-of-truth graph (via the controller) into nodes/edges,
// routes React Flow's change/connect callbacks back into model mutations, forbids a
// cycle-creating connection at draw time (isValidConnection), opens the property
// editor on a node double-click, and raises a context-menu target on right-click of a
// node or edge. Node view state is controlled through useFlowNodes so React Flow can
// initialize and drag nodes; the real logic lives in the pure modules it composes
// (flow-mapping, flow-change-handlers, use-flow-nodes, cycle).
export function WorkflowCanvas({ controller, onEditNode, onContextMenu, colorMode }: WorkflowCanvasProps): React.JSX.Element {
    const { nodes, onNodesChange } = useFlowNodes(controller, colorMode);
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

    const onNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: { id: string }) => onEditNode(node.id),
        [onEditNode],
    );

    // Right-click a node: suppress the browser menu and raise our own at the cursor.
    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: { id: string }) => {
            event.preventDefault();
            onContextMenu({ kind: 'node', id: node.id, x: event.clientX, y: event.clientY });
        },
        [onContextMenu],
    );
    // Right-click an edge: same, for a wire.
    const onEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: { id: string }) => {
            event.preventDefault();
            onContextMenu({ kind: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
        },
        [onContextMenu],
    );

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDoubleClick={onNodeDoubleClick}
                onNodeContextMenu={onNodeContextMenu}
                onEdgeContextMenu={onEdgeContextMenu}
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
