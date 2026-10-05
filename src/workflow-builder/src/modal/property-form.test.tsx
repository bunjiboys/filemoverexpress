import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { PropertyForm } from './property-form';

// Driven with Cloudscape's own test-utils wrappers (createWrapper), the supported
// way to interact with Cloudscape components in unit tests
// (https://cloudscape.design/get-started/testing/). FormField labels are matched by
// text; the controls are found and operated via their component wrappers.
const uploadValue = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    transferProfile: 'p',
    sources: ['s'],
    destination: 'd',
    ...over,
});

describe('PropertyForm', () => {
    it('renders a form field for every schema-derived property of the type', () => {
        const { container } = render(<PropertyForm type="Sleep" value={{ duration: '30s' }} onChange={vi.fn()} />);
        const formFields = createWrapper(container).findAllFormFields();
        expect(formFields).toHaveLength(1);
        expect(formFields[0].findLabel()?.getElement().textContent).toMatch(/duration/i);
    });

    it('reflects the current value in a text input', () => {
        const { container } = render(<PropertyForm type="Sleep" value={{ duration: '30s' }} onChange={vi.fn()} />);
        const input = createWrapper(container).findInput();
        expect(input?.findNativeInput().getElement()).toHaveValue('30s');
    });

    it('fires onChange with the updated payload when a text input changes', () => {
        const onChange = vi.fn();
        const { container } = render(<PropertyForm type="Sleep" value={{ duration: '' }} onChange={onChange} />);
        createWrapper(container).findInput()?.setInputValue('5m');
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ duration: '5m' }));
    });

    it('renders and toggles a boolean field', () => {
        const onChange = vi.fn();
        const { container } = render(<PropertyForm type="Upload" value={uploadValue({ force: false })} onChange={onChange} />);
        const checkbox = createWrapper(container).findCheckbox();
        expect(checkbox?.findNativeInput().getElement()).not.toBeChecked();
        checkbox?.findLabel().click();
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    });

    it('renders an enum field as a select and fires onChange on selection', () => {
        const onChange = vi.fn();
        const { container } = render(
            <PropertyForm type="Checksum" value={{ sources: ['s'], algorithm: 'xxh3' }} onChange={onChange} />,
        );
        const select = createWrapper(container).findSelect();
        expect(select).not.toBeNull();
        select!.openDropdown();
        select!.selectOptionByValue('md5');
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ algorithm: 'md5' }));
    });

    it('renders an enum field with no value selected without error', () => {
        const { container } = render(<PropertyForm type="Checksum" value={{ sources: ['s'] }} onChange={vi.fn()} />);
        const select = createWrapper(container).findSelect();
        expect(select?.findTrigger().getElement().textContent ?? '').not.toContain('md5');
    });

    it('edits a stringList field, splitting on commas', () => {
        const onChange = vi.fn();
        const { container } = render(<PropertyForm type="Upload" value={uploadValue({ sources: [] })} onChange={onChange} />);
        // sources is the stringList field; it is the only input whose label is "sources".
        const field = createWrapper(container)
            .findAllFormFields()
            .find((f) => /sources/i.test(f.findLabel()?.getElement().textContent ?? ''));
        field?.findControl()?.findInput()?.setInputValue('/a, /b');
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sources: ['/a', '/b'] }));
    });

    it('renders camelCase schema keys as humanized Title Case labels', () => {
        const { container } = render(<PropertyForm type="Upload" value={uploadValue()} onChange={vi.fn()} />);
        const labels = createWrapper(container)
            .findAllFormFields()
            .map((f) => f.findLabel()?.getElement().textContent ?? '');
        expect(labels).toContain('Transfer Profile');
        expect(labels).toContain('Destination');
    });
});
