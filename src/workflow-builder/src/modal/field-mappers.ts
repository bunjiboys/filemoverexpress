import type { FieldSpec } from './field-spec';

// Pure value-mapping helpers for the property form controls. Extracted from the
// React components so their branches are unit-testable without driving Cloudscape
// widgets in jsdom (the widget interaction itself is covered by Tier-2 Playwright).

export interface SelectOption {
    value: string;
    label: string;
}

// The Select's current selection, or null when the field has no value yet.
export function selectedOption(value: unknown): SelectOption | null {
    if (value === undefined || value === null) {
        return null;
    }
    return { value: String(value), label: String(value) };
}

// The options a Select offers for an enum field.
export function enumOptions(field: FieldSpec): SelectOption[] {
    return (field.enumValues ?? []).map((v) => ({ value: v, label: v }));
}

// A stringList field's current value rendered for the text input (comma-joined).
export function joinList(value: unknown): string {
    return Array.isArray(value) ? value.join(', ') : '';
}

// Split a comma-separated list field into trimmed, non-empty entries.
export function splitList(raw: string): string[] {
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
}

// A string/text field's current value rendered for the input.
export function textValue(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
}
