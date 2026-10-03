import { useState } from 'react';

// The three workspace view modes (docs section 10). Order is the segmented-control
// display order: Visual (primary) | Editor | Split.
export type ViewMode = 'visual' | 'editor' | 'split';

export const VIEW_MODES: readonly ViewMode[] = [
    'visual',
    'editor',
    'split',
];

export interface ViewModeState {
    mode: ViewMode;
    setMode: (mode: ViewMode) => void;
    // Which panes the current mode shows. Split shows both; the canvas is the
    // primary pane, so visual shows it alone and editor shows the editor alone.
    showCanvas: boolean;
    showEditor: boolean;
}

export function useViewMode(initial: ViewMode = 'visual'): ViewModeState {
    const [mode, setMode] = useState<ViewMode>(initial);
    return {
        mode,
        setMode,
        showCanvas: mode === 'visual' || mode === 'split',
        showEditor: mode === 'editor' || mode === 'split',
    };
}
