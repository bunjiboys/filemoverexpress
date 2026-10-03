import { useEffect, useRef } from 'react';
import { surfaceColors } from './theme';
import type { ColorMode } from '../app/use-color-mode';

export interface ContextMenuItem {
    id: string;
    label: string;
    onSelect: () => void;
}

export interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    colorMode: ColorMode;
    onDismiss: () => void;
}

// A small positioned popover for right-click actions on a node or edge. It renders the
// items at the given screen position and dismisses on an outside pointer-down or
// Escape. It themes from colorMode via surfaceColors (like the node) because
// Cloudscape's container CSS variables do not resolve here, which left the menu white
// in dark mode. The menu is thin: each item runs its handler then dismisses; the real
// mutations live on the controller. Positioning over the zoomed canvas is exercised by
// Tier-2 Playwright, not here.
export function ContextMenu({ x, y, items, colorMode, onDismiss }: ContextMenuProps): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const colors = surfaceColors(colorMode);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent): void => {
            if (ref.current !== null && !ref.current.contains(e.target as Node)) {
                onDismiss();
            }
        };
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onDismiss();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [onDismiss]);

    return (
        <div
            ref={ref}
            role="menu"
            style={{
                position: 'fixed',
                left: x,
                top: y,
                zIndex: 1000,
                minWidth: 160,
                padding: 4,
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.background,
                color: colors.text,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
        >
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        item.onSelect();
                        onDismiss();
                    }}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        border: 'none',
                        borderRadius: 4,
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        font: 'inherit',
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
