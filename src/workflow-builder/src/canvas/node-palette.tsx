import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { STEP_TYPES } from '../schema/loader';

// The MIME-ish key under which a palette drag carries the step type, read by the
// canvas drop handler. A named constant so palette and canvas agree on the payload.
export const PALETTE_DRAG_TYPE = 'application/fme-step-type';

export interface NodePaletteProps {
    // Add a node of the given step type (click-to-add; drag-to-canvas also routes here
    // via the canvas drop handler).
    onAdd: (type: string) => void;
}

// The node palette (docs sections 4, 5): one item per schema-derived step type. Each
// item is both draggable (its step type rides on the drag payload for a canvas drop)
// and clickable (a keyboard/non-drag fallback that adds the node directly). Driving it
// off STEP_TYPES keeps it schema-driven - a new format step type appears here with no
// code change.
export function NodePalette({ onAdd }: NodePaletteProps): React.JSX.Element {
    return (
        <SpaceBetween size="xs">
            {STEP_TYPES.map((type) => (
                <div
                    key={type}
                    data-testid={`palette-${type}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(PALETTE_DRAG_TYPE, type)}
                >
                    <Button fullWidth iconName="add-plus" onClick={() => onAdd(type)}>
                        {type}
                    </Button>
                </div>
            ))}
        </SpaceBetween>
    );
}
