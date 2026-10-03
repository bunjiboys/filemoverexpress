import { ReactFlowProvider } from '@xyflow/react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { NodePalette } from './node-palette';
import { WorkflowCanvas } from './workflow-canvas';
import type { WorkflowGraphController } from './use-workflow-graph';

export interface CanvasPaneProps {
    controller: WorkflowGraphController;
}

// The Visual-mode pane: the node palette on the left, the React Flow canvas filling
// the rest, and a small layout toolbar. A thin composition over the controller (docs
// section 13) - every action is a controller method, no logic lives here. The canvas
// is wrapped in ReactFlowProvider so React Flow's Controls/MiniMap can reach its
// store at runtime (mocked in tests).
export function CanvasPane({ controller }: CanvasPaneProps): React.JSX.Element {
    return (
        <div style={{ display: 'flex', gap: 12, height: '70vh' }}>
            <div style={{ width: 180, flexShrink: 0 }}>
                <SpaceBetween size="s">
                    <Box variant="h3">Steps</Box>
                    <NodePalette onAdd={controller.addNode} />
                    <Button data-testid="relayout" iconName="refresh" onClick={controller.relayout}>
                        Re-layout
                    </Button>
                </SpaceBetween>
            </div>
            <div style={{ flex: 1, border: '1px solid #8c8c94', borderRadius: 8 }}>
                <ReactFlowProvider>
                    <WorkflowCanvas controller={controller} />
                </ReactFlowProvider>
            </div>
        </div>
    );
}
