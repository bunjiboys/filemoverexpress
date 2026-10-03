import { useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
// React Flow ships its own stylesheet for the canvas, nodes, edges, handles,
// controls and minimap; without it the nodes render unstyled and the controls break
// (reactflow.dev/error#013). Imported here, with the canvas, so it loads only in
// Visual mode. A CSS side-effect import carries no logic for the coverage gate.
import '@xyflow/react/dist/style.css';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { AddStepMenu } from './add-step-menu';
import { WorkflowCanvas } from './workflow-canvas';
import { PropertyModal } from '../modal/property-modal';
import type { NodePatch } from './graph-mutations';
import type { WorkflowGraphController } from './use-workflow-graph';

export interface CanvasPaneProps {
    controller: WorkflowGraphController;
}

// The Visual-mode pane: a toolbar across the top (add-step dropdown, re-layout, and a
// hint) with the React Flow canvas filling the rest, plus the property modal that
// opens on a node double-click (docs sections 2, 8). A thin composition over the
// controller (docs section 13): every mutation is a controller method, and the only
// local state is which node the modal is editing. The canvas is wrapped in
// ReactFlowProvider so React Flow's Controls/MiniMap can reach its store at runtime
// (mocked in tests).
export function CanvasPane({ controller }: CanvasPaneProps): React.JSX.Element {
    const [editingId, setEditingId] = useState<string | null>(null);
    const editingNode = controller.graph.nodes.find((n) => n.id === editingId) ?? null;

    const dismiss = useCallback(() => setEditingId(null), []);
    const save = useCallback((id: string, patch: NodePatch) => {
        controller.updateNode(id, patch);
        setEditingId(null);
    }, [controller]);
    const remove = useCallback((id: string) => {
        controller.deleteNode(id);
        setEditingId(null);
    }, [controller]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '75vh' }}>
            <Box>
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                    <AddStepMenu onAdd={controller.addNode} />
                    <Button data-testid="relayout" iconName="refresh" onClick={controller.relayout}>
                        Re-layout
                    </Button>
                    <Box variant="small" color="text-body-secondary">
                        Double-click a node to edit. Select a node or wire and press Delete to remove it.
                    </Box>
                </SpaceBetween>
            </Box>
            <div style={{ flex: 1, border: '1px solid #8c8c94', borderRadius: 8, minHeight: 0 }}>
                <ReactFlowProvider>
                    <WorkflowCanvas controller={controller} onEditNode={setEditingId} />
                </ReactFlowProvider>
            </div>
            <PropertyModal node={editingNode} onSave={save} onDelete={remove} onDismiss={dismiss} />
        </div>
    );
}
