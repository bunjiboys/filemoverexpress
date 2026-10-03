import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { ViewModeControl } from './view-mode-control';

describe('ViewModeControl', () => {
    it('renders a segmented control with the three modes', () => {
        const { container } = render(<ViewModeControl mode="visual" onChange={vi.fn()} />);
        const segmented = createWrapper(container).findSegmentedControl();
        expect(segmented).not.toBeNull();
        expect(segmented!.findSegments()).toHaveLength(3);
    });

    it('reflects the current mode as the selected segment', () => {
        const { container } = render(<ViewModeControl mode="editor" onChange={vi.fn()} />);
        const segmented = createWrapper(container).findSegmentedControl();
        expect(segmented!.findSelectedSegment()?.getElement().textContent).toMatch(/editor/i);
    });

    it('fires onChange with the chosen mode when a segment is clicked', () => {
        const onChange = vi.fn();
        const { container } = render(<ViewModeControl mode="visual" onChange={onChange} />);
        const segmented = createWrapper(container).findSegmentedControl();
        segmented!.findSegmentById('split')!.click();
        expect(onChange).toHaveBeenCalledWith('split');
    });
});
