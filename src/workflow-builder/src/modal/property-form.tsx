import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Checkbox from '@cloudscape-design/components/checkbox';
import Select from '@cloudscape-design/components/select';
import { fieldsForType } from './fields-for-type';
import type { FieldSpec } from './field-spec';
import { enumOptions, joinList, selectedOption, splitList, textValue } from './field-mappers';

export interface PropertyFormProps {
    type: string;
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
}

// The schema-driven property form (docs section 2). It derives its fields from the
// bundled schema for the step `type` and renders a Cloudscape control per field.
// Controlled: every edit produces the updated `with` payload via onChange. No
// per-type code lives here - add a step type to the schema and its form appears.
export function PropertyForm({ type, value, onChange }: PropertyFormProps): React.JSX.Element {
    const fields = fieldsForType(type);
    const set = (name: string, v: unknown): void => {
        onChange({ ...value, [name]: v });
    };

    return (
        <div>
            {fields.map((field) => (
                <FormField key={field.name} label={field.name} description={field.description}>
                    <FieldControl field={field} value={value[field.name]} onChange={(v) => set(field.name, v)} />
                </FormField>
            ))}
        </div>
    );
}

interface FieldControlProps {
    field: FieldSpec;
    value: unknown;
    onChange: (v: unknown) => void;
}

function FieldControl({ field, value, onChange }: FieldControlProps): React.JSX.Element {
    switch (field.kind) {
        case 'boolean':
            return (
                <Checkbox
                    ariaLabel={field.name}
                    checked={value === true}
                    onChange={(e) => onChange(e.detail.checked)}
                />
            );
        case 'enum':
            return (
                <Select
                    ariaLabel={field.name}
                    selectedOption={selectedOption(value)}
                    options={enumOptions(field)}
                    onChange={(e) => onChange(e.detail.selectedOption.value)}
                />
            );
        case 'stringList':
            return (
                <Input
                    ariaLabel={field.name}
                    value={joinList(value)}
                    onChange={(e) => onChange(splitList(e.detail.value))}
                />
            );
        default:
            return (
                <Input
                    ariaLabel={field.name}
                    value={textValue(value)}
                    onChange={(e) => onChange(e.detail.value)}
                />
            );
    }
}
