// Split-view divider math (docs section 10). The ratio is the LEFT pane's fraction of
// the container width; it is clamped so neither pane collapses to nothing. Pure, so
// the drag arithmetic is unit-tested without a real pointer; the SplitLayout component
// only wires pointer events to these.

// Neither pane may shrink below 15% of the container.
export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

// Clamp a raw ratio into the allowed range so a drag to the edge keeps both panes
// usable.
export function clampRatio(ratio: number): number {
    if (ratio < MIN_RATIO) {
        return MIN_RATIO;
    }
    if (ratio > MAX_RATIO) {
        return MAX_RATIO;
    }
    return ratio;
}

// The clamped left-pane ratio for a pointer at clientX, given the container's left edge
// and width. A zero-width container (not yet laid out) yields the minimum rather than a
// divide-by-zero NaN.
export function ratioFromPointer(containerLeft: number, containerWidth: number, clientX: number): number {
    if (containerWidth <= 0) {
        return MIN_RATIO;
    }
    return clampRatio((clientX - containerLeft) / containerWidth);
}
