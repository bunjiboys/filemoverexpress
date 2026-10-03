import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { DocumentPanel } from './document-panel';
import type { WorkflowGraph } from '../workflow/graph';

const graph = (over: Partial<WorkflowGraph> = {}): WorkflowGraph => ({
    nodes: [],
    edges: [],
    metadata: { name: 'My Flow', description: 'desc' },
    parameters: [{ name: 'profile', type: 'string' }],
    defaults: { force: false },
    ...over,
});

// The document panel edits workflow-level fields - metadata, parameters, defaults
// (docs section 15). It is controlled: every change produces a DocumentPatch for the
// parent (the controller's setDocument). The array/defaults logic is unit-tested in
// document-fields; this covers the panel's control wiring, driven via Cloudscape
// test-utils.
describe('DocumentPanel', () => {
    it('renders the current metadata name and description', () => {
        const { container } = render(<DocumentPanel graph={graph()} onChange={vi.fn()} />);
        const inputs = createWrapper(container).findAllInputs();
        const name = createWrapper(container).findInput('[data-testid="meta-name"]');
        expect(name?.findNativeInput().getElement()).toHaveValue('My Flow');
        expect(inputs.length).toBeGreaterThan(0);
    });

    it('patches metadata.name on edit, preserving description', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="meta-name"]')!.setInputValue('Renamed');
        expect(onChange).toHaveBeenCalledWith({ metadata: { name: 'Renamed', description: 'desc' } });
    });

    it('patches metadata.description on edit', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findTextarea('[data-testid="meta-description"]')!.setTextareaValue('new desc');
        expect(onChange).toHaveBeenCalledWith({ metadata: { name: 'My Flow', description: 'new desc' } });
    });

    it('adds a parameter', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findButton('[data-testid="add-param"]')!.click();
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'string' }, { name: 'param1', type: 'string' }],
        });
    });

    it('removes a parameter', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findButton('[data-testid="remove-param-0"]')!.click();
        expect(onChange).toHaveBeenCalledWith({ parameters: [] });
    });

    it('renames a parameter', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-name-0"]')!.setInputValue('transferProfile');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'transferProfile', type: 'string' }],
        });
    });

    it('changes a parameter type via the select', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-type-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('int');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'int' }],
        });
    });

    it('shows defaults as JSON and patches on a valid edit', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findTextarea('[data-testid="defaults"]')!.setTextareaValue('{ "force": true }');
        expect(onChange).toHaveBeenCalledWith({ defaults: { force: true } });
    });

    it('does not patch defaults while the JSON is invalid', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        createWrapper(container).findTextarea('[data-testid="defaults"]')!.setTextareaValue('{ not json');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('handles a graph with no document fields', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={{ nodes: [], edges: [] }} onChange={onChange} />);
        // Name is empty, no parameter rows, defaults an empty object.
        expect(createWrapper(container).findInput('[data-testid="meta-name"]')!.findNativeInput().getElement())
            .toHaveValue('');
        expect(createWrapper(container).findButton('[data-testid="remove-param-0"]')).toBeNull();
    });
});
