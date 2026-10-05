import { describe, it, expect } from 'vitest';
import {
    addParameter,
    removeParameter,
    patchParameter,
    patchParameterType,
    extraFieldsForType,
    isExtraFieldRequired,
    parseBound,
    joinValues,
    splitValues,
    defaultToText,
    parseDefault,
    asParameterList,
    defaultsToText,
    textToDefaults,
} from './document-fields';
import type { ParameterSpec } from '../workflow/parameters';

// Pure helpers behind the document panel's parameters table and defaults field (docs
// section 15). The panel component stays thin; the array edits and the defaults
// text<->object conversion are tested here.
describe('asParameterList', () => {
    it('returns an empty array for undefined', () => {
        expect(asParameterList(undefined)).toEqual([]);
    });

    it('passes a parameter array through', () => {
        const p: ParameterSpec[] = [{ name: 'a', type: 'string' }];
        expect(asParameterList(p)).toEqual(p);
    });
});

describe('addParameter', () => {
    it('appends a new string parameter with a generated unique name', () => {
        const result = addParameter([]);
        expect(result).toEqual([{ name: 'param1', type: 'string' }]);
    });

    it('avoids colliding with existing generated names', () => {
        const result = addParameter([{ name: 'param1', type: 'string' }]);
        expect(result[1].name).toBe('param2');
    });

    it('does not mutate the input', () => {
        const input: ParameterSpec[] = [];
        addParameter(input);
        expect(input).toEqual([]);
    });
});

describe('removeParameter', () => {
    it('removes the parameter at the index', () => {
        const result = removeParameter([{ name: 'a', type: 'string' }, { name: 'b', type: 'int' }], 0);
        expect(result).toEqual([{ name: 'b', type: 'int' }]);
    });
});

describe('patchParameter', () => {
    it('updates fields of the parameter at the index', () => {
        const result = patchParameter([{ name: 'a', type: 'string' }], 0, { name: 'renamed', required: true });
        expect(result[0]).toEqual({ name: 'renamed', type: 'string', required: true });
    });

    it('changes the type', () => {
        const result = patchParameter([{ name: 'a', type: 'string' }], 0, { type: 'int' });
        expect(result[0].type).toBe('int');
    });

    it('leaves other rows untouched', () => {
        const result = patchParameter(
            [{ name: 'a', type: 'string' }, { name: 'b', type: 'int' }],
            1,
            { name: 'b2' },
        );
        expect(result[0]).toEqual({ name: 'a', type: 'string' });
        expect(result[1].name).toBe('b2');
    });
});

describe('extraFieldsForType', () => {
    it('offers pattern for string and string_array', () => {
        expect(extraFieldsForType('string')).toEqual(['pattern']);
        expect(extraFieldsForType('string_array')).toEqual(['pattern']);
    });

    it('offers min and max for int and float', () => {
        expect(extraFieldsForType('int')).toEqual(['min', 'max']);
        expect(extraFieldsForType('float')).toEqual(['min', 'max']);
    });

    it('offers values for enum', () => {
        expect(extraFieldsForType('enum')).toEqual(['values']);
    });

    it('offers no extra fields for bool or transfer_profile', () => {
        expect(extraFieldsForType('bool')).toEqual([]);
        expect(extraFieldsForType('transfer_profile')).toEqual([]);
    });
});

describe('isExtraFieldRequired', () => {
    it('marks only enum values as required', () => {
        expect(isExtraFieldRequired('values')).toBe(true);
    });

    it('marks pattern, min and max as optional', () => {
        expect(isExtraFieldRequired('pattern')).toBe(false);
        expect(isExtraFieldRequired('min')).toBe(false);
        expect(isExtraFieldRequired('max')).toBe(false);
    });
});

describe('patchParameterType', () => {
    it('sets the new type', () => {
        const result = patchParameterType([{ name: 'a', type: 'string' }], 0, 'int');
        expect(result[0].type).toBe('int');
    });

    it('drops a pattern when switching away from string', () => {
        const result = patchParameterType([{ name: 'a', type: 'string', pattern: '^x$' }], 0, 'int');
        expect(result[0]).toEqual({ name: 'a', type: 'int' });
    });

    it('keeps the pattern when switching string -> string_array', () => {
        const result = patchParameterType([{ name: 'a', type: 'string', pattern: '^x$' }], 0, 'string_array');
        expect(result[0]).toEqual({ name: 'a', type: 'string_array', pattern: '^x$' });
    });

    it('drops min/max when switching away from a numeric type', () => {
        const result = patchParameterType([{ name: 'a', type: 'int', min: 1, max: 5 }], 0, 'string');
        expect(result[0]).toEqual({ name: 'a', type: 'string' });
    });

    it('drops values when switching away from enum', () => {
        const result = patchParameterType([{ name: 'a', type: 'enum', values: ['x'] }], 0, 'transfer_profile');
        expect(result[0]).toEqual({ name: 'a', type: 'transfer_profile' });
    });

    it('preserves name and required but clears default across a type change', () => {
        const result = patchParameterType(
            [{ name: 'a', type: 'int', min: 1, required: true, default: 3 }],
            0,
            'string',
        );
        expect(result[0]).toEqual({ name: 'a', type: 'string', required: true });
    });

    it('leaves other rows untouched', () => {
        const result = patchParameterType(
            [{ name: 'a', type: 'string', pattern: '^x$' }, { name: 'b', type: 'int' }],
            1,
            'float',
        );
        expect(result[0]).toEqual({ name: 'a', type: 'string', pattern: '^x$' });
        expect(result[1]).toEqual({ name: 'b', type: 'float' });
    });
});

describe('parseBound', () => {
    it('returns undefined for empty or whitespace', () => {
        expect(parseBound('')).toBeUndefined();
        expect(parseBound('   ')).toBeUndefined();
    });

    it('parses a numeric string', () => {
        expect(parseBound('5')).toBe(5);
        expect(parseBound('-2.5')).toBe(-2.5);
    });

    it('returns undefined for a non-numeric string', () => {
        expect(parseBound('abc')).toBeUndefined();
    });
});

describe('enum values text round-trip', () => {
    it('joins values for the input', () => {
        expect(joinValues(['a', 'b'])).toBe('a, b');
        expect(joinValues(undefined)).toBe('');
    });

    it('splits trimmed non-empty entries', () => {
        expect(splitValues('a, b , ,c')).toEqual(['a',
            'b',
            'c']);
        expect(splitValues('   ')).toEqual([]);
    });
});

describe('defaultToText', () => {
    it('renders undefined and null as empty', () => {
        expect(defaultToText(undefined)).toBe('');
        expect(defaultToText(null)).toBe('');
    });

    it('renders a string, number and bool as text', () => {
        expect(defaultToText('x')).toBe('x');
        expect(defaultToText(3)).toBe('3');
        expect(defaultToText(true)).toBe('true');
    });

    it('comma-joins an array default', () => {
        expect(defaultToText(['a', 'b'])).toBe('a, b');
    });
});

describe('parseDefault', () => {
    it('clears on empty or whitespace for any type', () => {
        expect(parseDefault('string', '')).toBeUndefined();
        expect(parseDefault('int', '   ')).toBeUndefined();
        expect(parseDefault('string_array', '')).toBeUndefined();
    });

    it('truncates an int toward zero', () => {
        expect(parseDefault('int', '3.9')).toBe(3);
        expect(parseDefault('int', '-2.9')).toBe(-2);
    });

    it('keeps a float as-is', () => {
        expect(parseDefault('float', '1.5')).toBe(1.5);
    });

    it('clears a non-numeric int/float entry rather than storing NaN', () => {
        expect(parseDefault('int', 'abc')).toBeUndefined();
        expect(parseDefault('float', 'x')).toBeUndefined();
    });

    it('splits a string_array default into a list', () => {
        expect(parseDefault('string_array', '/vol/A, /vol/B')).toEqual(['/vol/A', '/vol/B']);
    });

    it('returns the raw string for string, enum and transfer_profile', () => {
        expect(parseDefault('string', 'hello')).toBe('hello');
        expect(parseDefault('enum', 'prod')).toBe('prod');
        expect(parseDefault('transfer_profile', 'fast-upload')).toBe('fast-upload');
    });
});

describe('defaults text round-trip', () => {
    it('renders defaults as pretty JSON', () => {
        expect(defaultsToText({ force: true })).toBe('{\n    "force": true\n}');
    });

    it('renders undefined defaults as an empty object', () => {
        expect(defaultsToText(undefined)).toBe('{}');
    });

    it('parses valid JSON object text to defaults', () => {
        expect(textToDefaults('{ "force": false }')).toEqual({ ok: true, value: { force: false } });
    });

    it('reports an error for invalid JSON', () => {
        expect(textToDefaults('{ not json').ok).toBe(false);
    });

    it('reports an error when the JSON is not an object', () => {
        expect(textToDefaults('42').ok).toBe(false);
        expect(textToDefaults('[1, 2]').ok).toBe(false);
    });

    it('treats empty/whitespace text as cleared defaults (undefined)', () => {
        expect(textToDefaults('   ')).toEqual({ ok: true, value: undefined });
    });
});
