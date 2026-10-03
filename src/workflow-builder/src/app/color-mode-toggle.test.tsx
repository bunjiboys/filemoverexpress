import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { ColorModeToggle } from './color-mode-toggle';

describe('ColorModeToggle', () => {
    it('labels the action to switch to dark when in light mode', () => {
        const { container } = render(<ColorModeToggle mode="light" onToggle={vi.fn()} />);
        const button = createWrapper(container).findButton();
        expect(button?.getElement().textContent).toMatch(/dark/i);
    });

    it('labels the action to switch to light when in dark mode', () => {
        const { container } = render(<ColorModeToggle mode="dark" onToggle={vi.fn()} />);
        expect(createWrapper(container).findButton()?.getElement().textContent).toMatch(/light/i);
    });

    it('fires onToggle when clicked', () => {
        const onToggle = vi.fn();
        const { container } = render(<ColorModeToggle mode="light" onToggle={onToggle} />);
        createWrapper(container).findButton()!.click();
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
