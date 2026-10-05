import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { AddStepMenu } from './add-step-menu';
import { STEP_TYPES } from '../schema/loader';

// The add-step control is a dropdown of the schema-derived step types (so new format
// step types appear with no code change), replacing the old per-type button column -
// it scales as more step types are added. Selecting an item adds a node of that type.
describe('AddStepMenu', () => {
    it('offers one dropdown item per schema step type', () => {
        const { container } = render(<AddStepMenu onAdd={vi.fn()} />);
        const dropdown = createWrapper(container).findButtonDropdown();
        expect(dropdown).not.toBeNull();
        dropdown!.openDropdown();
        for (const type of STEP_TYPES) {
            expect(dropdown!.findItemById(type)).not.toBeNull();
        }
    });

    it('calls onAdd with the step type when an item is chosen', () => {
        const onAdd = vi.fn();
        const { container } = render(<AddStepMenu onAdd={onAdd} />);
        const dropdown = createWrapper(container).findButtonDropdown()!;
        dropdown.openDropdown();
        dropdown.findItemById('Upload')!.click();
        expect(onAdd).toHaveBeenCalledWith('Upload');
    });
});
