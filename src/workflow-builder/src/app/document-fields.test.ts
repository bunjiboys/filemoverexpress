import { describe, it, expect } from 'vitest';
import {
    addParameter,
    removeParameter,
    patchParameter,
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
