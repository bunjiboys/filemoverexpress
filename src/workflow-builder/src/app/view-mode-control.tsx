import SegmentedControl from '@cloudscape-design/components/segmented-control';
import { VIEW_MODES, type ViewMode } from './use-view-mode';

export interface ViewModeControlProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

const LABELS: Record<ViewMode, string> = {
    visual: 'Visual',
    editor: 'Editor',
    split: 'Split',
};

// The Visual / Editor / Split switcher (docs section 10), a thin wrapper over
// Cloudscape's SegmentedControl. Segment ids are the ViewMode values, so the change
// handler maps straight back to a mode.
export function ViewModeControl({ mode, onChange }: ViewModeControlProps): React.JSX.Element {
    return (
        <SegmentedControl
            selectedId={mode}
            onChange={(e) => onChange(e.detail.selectedId as ViewMode)}
            label="View mode"
            options={VIEW_MODES.map((m) => ({ id: m, text: LABELS[m] }))}
        />
    );
}
