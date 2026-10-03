import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { PropertyModal } from './property-modal';
import type { WorkflowNode } from '../nodes/descriptor';

const sleepNode: WorkflowNode = {
    id: 'step-1',
    type: 'Sleep',
    name: 'Pause',
    with: { duration: '30s' },
    continueOnError: false,
};

// Cloudscape Modal portals its content to document.body, so the modal is queried
// through a body-scoped wrapper rather than the render container.
const body = () => createWrapper(document.body);

afterEach(cleanup);

// The property modal opens on a node double-click (docs section 2): it edits the
// node's name and schema-driven `with` payload, and offers delete. The PropertyForm
// inside is already unit-tested, so this exercises the modal's own wiring (open/close,
// name edit, save patch, delete). CloudScape components are driven via createWrapper.
describe('PropertyModal', () => {
    it('renders no open modal when no node is selected', () => {
        render(<PropertyModal node={null} onSave={vi.fn()} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        expect(body().findModal()?.isVisible()).not.toBe(true);
    });

    it('shows the node type in the header and the name in a field when open', () => {
        render(<PropertyModal node={sleepNode} onSave={vi.fn()} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        expect(body().findModal()?.findHeader()?.getElement().textContent).toMatch(/Sleep/);
        expect(body().findInput('[data-testid="node-name"]')?.findNativeInput().getElement())
            .toHaveValue('Pause');
    });

    it('saves the edited name and payload as a patch', () => {
        const onSave = vi.fn();
        render(<PropertyModal node={sleepNode} onSave={onSave} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        body().findInput('[data-testid="node-name"]')!.setInputValue('Wait');
        body().findButton('[data-testid="modal-save"]')!.click();
        expect(onSave).toHaveBeenCalledWith('step-1', expect.objectContaining({
            name: 'Wait',
            with: { duration: '30s' },
        }));
    });

    it('fires onDelete with the node id', () => {
        const onDelete = vi.fn();
        render(<PropertyModal node={sleepNode} onSave={vi.fn()} onDelete={onDelete} onDismiss={vi.fn()} />);
        body().findButton('[data-testid="modal-delete"]')!.click();
        expect(onDelete).toHaveBeenCalledWith('step-1');
    });

    it('fires onDismiss from the cancel button', () => {
        const onDismiss = vi.fn();
        render(<PropertyModal node={sleepNode} onSave={vi.fn()} onDelete={vi.fn()} onDismiss={onDismiss} />);
        body().findButton('[data-testid="modal-cancel"]')!.click();
        expect(onDismiss).toHaveBeenCalled();
    });

    it('edits the schema-driven payload and includes it in the save patch', () => {
        const onSave = vi.fn();
        render(<PropertyModal node={sleepNode} onSave={onSave} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        const duration = body()
            .findAllFormFields()
            .find((f) => /duration/i.test(f.findLabel()?.getElement().textContent ?? ''));
        duration?.findControl()?.findInput()?.setInputValue('5m');
        body().findButton('[data-testid="modal-save"]')!.click();
        expect(onSave).toHaveBeenCalledWith('step-1', expect.objectContaining({
            with: { duration: '5m' },
        }));
    });

    it('starts fresh from the node each time it opens (no stale edits)', () => {
        const onSave = vi.fn();
        const { rerender } = render(
            <PropertyModal node={sleepNode} onSave={onSave} onDelete={vi.fn()} onDismiss={vi.fn()} />,
        );
        body().findInput('[data-testid="node-name"]')!.setInputValue('Edited');
        rerender(<PropertyModal node={null} onSave={onSave} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        const other: WorkflowNode = {
            id: 'step-2',
            type: 'Sleep',
            name: 'Other',
            with: { duration: '1s' },
            continueOnError: false,
        };
        rerender(<PropertyModal node={other} onSave={onSave} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        expect(body().findInput('[data-testid="node-name"]')!.findNativeInput().getElement())
            .toHaveValue('Other');
    });

    it('starts the name field empty for a node with no name', () => {
        const unnamed: WorkflowNode = {
            id: 'step-3',
            type: 'Sleep',
            with: { duration: '1s' },
            continueOnError: false,
        };
        render(<PropertyModal node={unnamed} onSave={vi.fn()} onDelete={vi.fn()} onDismiss={vi.fn()} />);
        expect(body().findInput('[data-testid="node-name"]')!.findNativeInput().getElement())
            .toHaveValue('');
    });
});
