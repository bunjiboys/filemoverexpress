import Button from '@cloudscape-design/components/button';
import type { ColorMode } from './use-color-mode';

export interface ColorModeToggleProps {
    mode: ColorMode;
    onToggle: () => void;
}

// Header control to switch light/dark. The label names the mode it switches TO, so
// the action reads clearly ("Dark mode" when currently light).
export function ColorModeToggle({ mode, onToggle }: ColorModeToggleProps): React.JSX.Element {
    const label = mode === 'light' ? 'Dark mode' : 'Light mode';
    return (
        <Button iconName="settings" onClick={onToggle} ariaLabel={label}>
            {label}
        </Button>
    );
}
