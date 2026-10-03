import { useCallback, useEffect, useRef, useState } from 'react';
import { clampRatio, ratioFromPointer } from './split-ratio';

export interface SplitLayoutProps {
    left: React.ReactNode;
    right: React.ReactNode;
    // The left-pane fraction (0..1), owned by the parent so it survives this
    // component unmounting on a view switch (session state, not persisted).
    ratio: number;
    onRatioChange: (ratio: number) => void;
}

// Keyboard resize step per arrow press.
const KEY_STEP = 0.05;

// A horizontally resizable two-pane layout for Split view (docs section 10): the left
// pane's width is a controlled ratio of the container, adjusted by dragging the
// divider or by arrow keys on it (accessible). The ratio is lifted to the parent so a
// view switch (which unmounts this) does not reset it. The ratio math lives in
// split-ratio (pure, tested); this component only wires pointer/keyboard events and
// renders. The divider is a focusable slider so it is operable without a mouse.
export function SplitLayout({ left, right, ratio, onRatioChange }: SplitLayoutProps): React.JSX.Element {
    const [dragging, setDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // While dragging, follow the pointer against the container's current bounds. The
    // listeners live on window so a fast drag that leaves the divider still tracks.
    useEffect(() => {
        if (!dragging) {
            return undefined;
        }
        const onMove = (e: PointerEvent): void => {
            // During an active drag the container is always mounted; measure it and let
            // ratioFromPointer handle a degenerate (zero-width) rect, so no branch is
            // needed here. The non-null assertion is safe: the slider cannot receive a
            // pointerdown unless its sibling container is in the DOM.
            const rect = containerRef.current!.getBoundingClientRect();
            onRatioChange(ratioFromPointer(rect.left, rect.width, e.clientX));
        };
        const onUp = (): void => setDragging(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragging, onRatioChange]);

    const onKeyDown = useCallback((e: React.KeyboardEvent): void => {
        if (e.key === 'ArrowLeft') {
            onRatioChange(clampRatio(ratio - KEY_STEP));
        } else if (e.key === 'ArrowRight') {
            onRatioChange(clampRatio(ratio + KEY_STEP));
        }
    }, [ratio, onRatioChange]);

    const leftPercent = `${ratio * 100}%`;
    const rightPercent = `${(1 - ratio) * 100}%`;
    const percentNow = Math.round(ratio * 100);

    return (
        <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%' }}>
            <div data-testid="split-left" style={{ flexBasis: leftPercent, flexGrow: 0, flexShrink: 0, minWidth: 0 }}>
                {left}
            </div>
            <div
                role="slider"
                aria-label="Resize panes"
                aria-orientation="vertical"
                aria-valuemin={15}
                aria-valuemax={85}
                aria-valuenow={percentNow}
                tabIndex={0}
                onPointerDown={() => setDragging(true)}
                onKeyDown={onKeyDown}
                style={{
                    width: 8,
                    margin: '0 8px',
                    borderRadius: 4,
                    cursor: 'col-resize',
                    flexGrow: 0,
                    flexShrink: 0,
                    background: '#8c8c94',
                    opacity: 0.4,
                }}
            />
            <div data-testid="split-right" style={{ flexBasis: rightPercent, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                {right}
            </div>
        </div>
    );
}
