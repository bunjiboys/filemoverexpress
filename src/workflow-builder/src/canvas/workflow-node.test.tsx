import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// React Flow's Handle needs the ReactFlowProvider store to render; the node component
// is otherwise plain markup. Mock Handle at the module boundary so the node renders in
// jsdom (docs section 13) - real port wiring is Tier-2 Playwright. The mock records
// the handle type so the test can assert one input and one output are rendered.
vi.mock('@xyflow/react', () => ({
    Handle: ({ type }: { type: string }) => <div data-testid={`handle-${type}`} />,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

import { WorkflowNodeView } from './workflow-node';
import type { NodeProps } from '@xyflow/react';

const nodeProps = (
    data: { stepType: string; name: string | undefined; colorMode?: 'light' | 'dark' },
    selected = false,
): NodeProps => ({ data: { colorMode: 'light', ...data }, selected } as unknown as NodeProps);

describe('WorkflowNodeView', () => {
    it('shows the step type', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Upload', name: undefined })} />);
        expect(screen.getByText('Upload')).toBeInTheDocument();
    });

    it('shows the node name when present', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Checksum', name: 'Verify' })} />);
        expect(screen.getByText('Verify')).toBeInTheDocument();
    });

    it('falls back to the id-less unnamed label when no name is set', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Sleep', name: undefined })} />);
        expect(screen.getByText(/unnamed/i)).toBeInTheDocument();
    });

    it('renders one input and one output handle', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Upload', name: 'x' })} />);
        expect(screen.getByTestId('handle-target')).toBeInTheDocument();
        expect(screen.getByTestId('handle-source')).toBeInTheDocument();
    });

    it('marks itself selected when React Flow selects it', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Upload', name: 'x' }, true)} />);
        expect(screen.getByText('x').closest('[data-selected="true"]')).not.toBeNull();
    });

    it('uses the dark surface color in dark mode', () => {
        render(<WorkflowNodeView {...nodeProps({ stepType: 'Upload', name: 'x', colorMode: 'dark' })} />);
        const box = screen.getByText('x').closest('[data-selected]') as HTMLElement;
        // Dark surface is not white; jsdom reports rgb, so just assert it is not white.
        expect(box.style.background).not.toBe('');
        expect(box.style.background.toLowerCase()).not.toContain('255, 255, 255');
    });
});
