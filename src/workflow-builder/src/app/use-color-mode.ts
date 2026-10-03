import { useCallback, useEffect, useState } from 'react';
import { applyMode, Mode } from '@cloudscape-design/global-styles';

// Light/dark color mode (a UI preference, builder state - never part of the workflow
// file). Dark mode is a first-class Cloudscape feature: applyMode(Mode.Dark) sets the
// document mode so every Cloudscape component and token switches at once.
export type ColorMode = 'light' | 'dark';

export const COLOR_MODE_KEY = 'fme.workflow-builder.colorMode';

export interface ColorModeState {
    mode: ColorMode;
    toggle: () => void;
}

function readStored(): ColorMode {
    return localStorage.getItem(COLOR_MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function useColorMode(): ColorModeState {
    const [mode, setMode] = useState<ColorMode>(readStored);

    // Keep Cloudscape and the stored preference in sync with the current mode.
    useEffect(() => {
        applyMode(mode === 'dark' ? Mode.Dark : Mode.Light);
        localStorage.setItem(COLOR_MODE_KEY, mode);
    }, [mode]);

    const toggle = useCallback(() => {
        setMode((m) => (m === 'dark' ? 'light' : 'dark'));
    }, []);

    return { mode, toggle };
}
