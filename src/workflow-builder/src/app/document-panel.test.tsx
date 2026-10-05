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

    it('offers string_array as a selectable parameter type', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-type-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('string_array');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'string_array' }],
        });
    });

    it('offers transfer_profile as a selectable parameter type', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-type-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('transfer_profile');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'transfer_profile' }],
        });
    });

    it('shows a pattern field for a string parameter and patches it', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        const pattern = createWrapper(container).findInput('[data-testid="param-pattern-0"]');
        expect(pattern).not.toBeNull();
        pattern!.setInputValue('^[a-z]+$');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'string', pattern: '^[a-z]+$' }],
        });
    });

    it('clears the pattern field when emptied', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'profile', type: 'string', pattern: '^x$' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-pattern-0"]')!.setInputValue('');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'profile', type: 'string', pattern: undefined }],
        });
    });

    it('shows a pattern field for a string_array parameter', () => {
        const g = graph({ parameters: [{ name: 'cards', type: 'string_array' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        expect(createWrapper(container).findInput('[data-testid="param-pattern-0"]')).not.toBeNull();
    });

    it('shows min and max fields for an int parameter and patches a bound', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'n', type: 'int' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const min = createWrapper(container).findInput('[data-testid="param-min-0"]');
        const max = createWrapper(container).findInput('[data-testid="param-max-0"]');
        expect(min).not.toBeNull();
        expect(max).not.toBeNull();
        min!.setInputValue('3');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'n', type: 'int', min: 3 }] });
    });

    it('patches the max bound for a numeric parameter', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'n', type: 'float', min: 0 }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-max-0"]')!.setInputValue('10');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'n', type: 'float', min: 0, max: 10 }] });
    });

    it('renders existing min and max bounds in their inputs', () => {
        const g = graph({ parameters: [{ name: 'n', type: 'int', min: 1, max: 5 }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        expect(createWrapper(container).findInput('[data-testid="param-min-0"]')!.findNativeInput().getElement())
            .toHaveValue(1);
        expect(createWrapper(container).findInput('[data-testid="param-max-0"]')!.findNativeInput().getElement())
            .toHaveValue(5);
    });

    it('clears a numeric bound when emptied', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'n', type: 'float', min: 1 }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-min-0"]')!.setInputValue('');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'n', type: 'float', min: undefined }] });
    });

    it('shows a values field for an enum parameter and patches it', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'env', type: 'enum', values: ['prod'] }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const values = createWrapper(container).findInput('[data-testid="param-values-0"]');
        expect(values).not.toBeNull();
        values!.setInputValue('prod, staging');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'env', type: 'enum', values: ['prod', 'staging'] }],
        });
    });

    it('shows no extra field for a bool parameter', () => {
        const g = graph({ parameters: [{ name: 'force', type: 'bool' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        expect(createWrapper(container).findInput('[data-testid="param-pattern-0"]')).toBeNull();
        expect(createWrapper(container).findInput('[data-testid="param-min-0"]')).toBeNull();
        expect(createWrapper(container).findInput('[data-testid="param-values-0"]')).toBeNull();
    });

    it('shows no extra field for a transfer_profile parameter', () => {
        const g = graph({ parameters: [{ name: 'profile', type: 'transfer_profile' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        expect(createWrapper(container).findInput('[data-testid="param-pattern-0"]')).toBeNull();
        expect(createWrapper(container).findInput('[data-testid="param-values-0"]')).toBeNull();
    });

    it('strips a stale pattern when the type changes away from string', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'profile', type: 'string', pattern: '^x$' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-type-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('int');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'profile', type: 'int' }] });
    });

    it('marks the pattern field as optional', () => {
        const g = graph({ parameters: [{ name: 'profile', type: 'string' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const patternField = createWrapper(container)
            .findAllFormFields()
            .find((f) => f.findControl()?.findInput('[data-testid="param-pattern-0"]') !== null);
        expect(patternField).toBeDefined();
        expect(patternField!.findInfo()?.getElement().textContent).toContain('optional');
    });

    it('marks the min and max fields as optional', () => {
        const g = graph({ parameters: [{ name: 'n', type: 'int' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const infos = createWrapper(container)
            .findAllFormFields()
            .map((f) => f.findInfo()?.getElement().textContent ?? '');
        const optionalCount = infos.filter((t) => t.includes('optional')).length;
        expect(optionalCount).toBeGreaterThanOrEqual(2);
    });

    it('does not mark the enum values field as optional', () => {
        const g = graph({ parameters: [{ name: 'env', type: 'enum', values: ['a'] }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const valuesField = createWrapper(container)
            .findAllFormFields()
            .find((f) => f.findControl()?.findInput('[data-testid="param-values-0"]') !== null);
        expect(valuesField).toBeDefined();
        expect(valuesField!.findInfo()).toBeNull();
    });

    it('shows a text default editor for a string parameter and patches it', () => {
        const onChange = vi.fn();
        const { container } = render(<DocumentPanel graph={graph()} onChange={onChange} />);
        const input = createWrapper(container).findInput('[data-testid="param-default-0"]');
        expect(input).not.toBeNull();
        input!.setInputValue('prod');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'profile', type: 'string', default: 'prod' }] });
    });

    it('clears the default when the text editor is emptied', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'profile', type: 'string', default: 'prod' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-default-0"]')!.setInputValue('');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'profile', type: 'string', default: undefined }] });
    });

    it('renders an existing string default in the editor', () => {
        const g = graph({ parameters: [{ name: 'profile', type: 'string', default: 'staging' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        expect(createWrapper(container).findInput('[data-testid="param-default-0"]')!.findNativeInput().getElement())
            .toHaveValue('staging');
    });

    it('patches a numeric default for an int parameter, truncating', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'n', type: 'int' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-default-0"]')!.setInputValue('4.8');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'n', type: 'int', default: 4 }] });
    });

    it('patches a comma-list default for a string_array parameter', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'cards', type: 'string_array' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        createWrapper(container).findInput('[data-testid="param-default-0"]')!.setInputValue('/vol/A, /vol/B');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'cards', type: 'string_array', default: ['/vol/A', '/vol/B'] }],
        });
    });

    it('patches a bool default via the (unset)/true/false select', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'force', type: 'bool' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('true');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'force', type: 'bool', default: true }] });
    });

    it('clears a bool default when (unset) is chosen', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'force', type: 'bool', default: true }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('__unset__');
        expect(onChange).toHaveBeenCalledWith({ parameters: [{ name: 'force', type: 'bool', default: undefined }] });
    });

    it('renders a false bool default as the "false" selection', () => {
        const g = graph({ parameters: [{ name: 'force', type: 'bool', default: false }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        expect(select.findTrigger().getElement().textContent).toContain('false');
    });

    it('renders an existing enum default as the current selection', () => {
        const g = graph({ parameters: [{ name: 'env', type: 'enum', values: ['prod', 'staging'], default: 'staging' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        expect(select.findTrigger().getElement().textContent).toContain('staging');
    });

    it('clears an enum default when (unset) is chosen', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'env', type: 'enum', values: ['prod'], default: 'prod' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('__unset__');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'env', type: 'enum', values: ['prod'], default: undefined }],
        });
    });

    it('renders an enum default select even when no values are declared yet', () => {
        const g = graph({ parameters: [{ name: 'env', type: 'enum' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]');
        expect(select).not.toBeNull();
        expect(select!.findTrigger().getElement().textContent).toContain('(unset)');
    });

    it('patches an enum default via a select over the declared values', () => {
        const onChange = vi.fn();
        const g = graph({ parameters: [{ name: 'env', type: 'enum', values: ['prod', 'staging'] }] });
        const { container } = render(<DocumentPanel graph={g} onChange={onChange} />);
        const select = createWrapper(container).findSelect('[data-testid="param-default-0"]')!;
        select.openDropdown();
        select.selectOptionByValue('staging');
        expect(onChange).toHaveBeenCalledWith({
            parameters: [{ name: 'env', type: 'enum', values: ['prod', 'staging'], default: 'staging' }],
        });
    });

    it('marks the default field as optional', () => {
        const g = graph({ parameters: [{ name: 'profile', type: 'string' }] });
        const { container } = render(<DocumentPanel graph={g} onChange={vi.fn()} />);
        const defaultField = createWrapper(container)
            .findAllFormFields()
            .find((f) => f.findControl()?.findInput('[data-testid="param-default-0"]') !== null);
        expect(defaultField!.findInfo()?.getElement().textContent).toContain('optional');
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
