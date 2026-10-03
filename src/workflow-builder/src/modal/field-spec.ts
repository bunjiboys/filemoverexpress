// A single form field derived from a step type's `with` schema. The property modal
// is GENERATED from these, not hand-coded per step type (docs section 2) - a new
// field in the schema appears in the form automatically.

export type FieldKind = 'string' | 'boolean' | 'enum' | 'stringList';

export interface FieldSpec {
    name: string;
    kind: FieldKind;
    required: boolean;
    description?: string;
    enumValues?: string[]; // enum only
    default?: unknown;
}
