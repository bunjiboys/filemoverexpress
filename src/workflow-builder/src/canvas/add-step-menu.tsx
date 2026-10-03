import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import { STEP_TYPES } from '../schema/loader';

export interface AddStepMenuProps {
    // Add a node of the chosen step type.
    onAdd: (type: string) => void;
}

// The add-step control (docs sections 4, 5): a dropdown listing the schema-derived
// step types, so a new format step type appears here with no code change. Chosen over
// a per-type button column because the list grows as step types are added. The item
// id is the step type, which the detail carries straight to onAdd.
export function AddStepMenu({ onAdd }: AddStepMenuProps): React.JSX.Element {
    const items = STEP_TYPES.map((type) => ({ id: type, text: type }));
    return (
        <ButtonDropdown
            items={items}
            onItemClick={(e) => onAdd(e.detail.id)}
            variant="primary"
        >
            Add step
        </ButtonDropdown>
    );
}
