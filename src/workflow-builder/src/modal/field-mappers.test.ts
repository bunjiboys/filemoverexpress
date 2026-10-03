import { describe, it, expect } from 'vitest';
import { selectedOption, enumOptions, joinList, splitList, textValue } from './field-mappers';
import type { FieldSpec } from './field-spec';

describe('field-mappers', () => {
    it('selectedOption returns null for an unset value', () => {
        expect(selectedOption(undefined)).toBeNull();
        expect(selectedOption(null)).toBeNull();
    });

    it('selectedOption wraps a set value as an option', () => {
        expect(selectedOption('upload')).toEqual({ value: 'upload', label: 'upload' });
    });

    it('enumOptions maps enum values, or empty when absent', () => {
        const f: FieldSpec = { name: 'direction', kind: 'enum', required: true, enumValues: ['upload', 'download'] };
        expect(enumOptions(f)).toEqual([
            { value: 'upload', label: 'upload' }, { value: 'download', label: 'download' },
        ]);
        expect(enumOptions({ name: 'x', kind: 'enum', required: false })).toEqual([]);
    });

    it('joinList comma-joins an array and renders empty for a non-array', () => {
        expect(joinList(['/a', '/b'])).toBe('/a, /b');
        expect(joinList(undefined)).toBe('');
    });

    it('splitList trims and drops empty entries', () => {
        expect(splitList('/a, /b ,, /c')).toEqual(['/a',
            '/b',
            '/c']);
        expect(splitList('')).toEqual([]);
    });

    it('textValue stringifies a value or renders empty for null/undefined', () => {
        expect(textValue('x')).toBe('x');
        expect(textValue(undefined)).toBe('');
        expect(textValue(null)).toBe('');
        expect(textValue(true)).toBe('true');
    });
});
