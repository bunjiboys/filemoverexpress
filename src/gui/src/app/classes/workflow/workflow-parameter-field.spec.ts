import {
    isEffectivelyRequired,
    WorkflowParameter,
} from '@app/classes/workflow/workflow-parameter.model';
import {
    initialFieldValue,
    isFieldOverridden,
    toParamSubmission,
    validateField,
} from '@app/classes/workflow/workflow-parameter-field';
import { describe, expect, it } from 'vitest';

// Phase 2 leads with the string_array field (multi-chip Browse). These specs
// pin its model: initial value from the file default, element-wise pattern
// validation, required = at least one element, and the submit encoding into the
// `values` field (not a joined `value` string).

function arrayParam(overrides: Partial<WorkflowParameter> = {}): WorkflowParameter {
    return {
        name: 'source_dir',
        type: 'string_array',
        required: true,
        ...overrides,
    };
}

describe('string_array field model', () => {
    describe('initialFieldValue', () => {
        it('uses the file default array when set', () => {
            const param = arrayParam({required: false, default: ['/a', '/b']});
            expect(initialFieldValue(param)).toEqual(['/a', '/b']);
        });

        it('is an empty array when no default is set', () => {
            expect(initialFieldValue(arrayParam())).toEqual([]);
        });

        it('returns a fresh array (never aliases the parameter default)', () => {
            const param = arrayParam({required: false, default: ['/a']});
            const first = initialFieldValue(param) as string[];
            first.push('/mutated');
            expect(initialFieldValue(param)).toEqual(['/a']);
        });
    });

    describe('validateField', () => {
        it('rejects an empty required string_array', () => {
            expect(validateField(arrayParam(), [])).toBe('source_dir requires at least one value');
        });

        it('accepts an empty optional string_array', () => {
            expect(validateField(arrayParam({required: false}), [])).toBeNull();
        });

        it('accepts a non-empty string_array with no pattern', () => {
            expect(validateField(arrayParam(), ['/a', '/b'])).toBeNull();
        });

        it('applies pattern full-match to every element and reports the offender', () => {
            const param = arrayParam({pattern: '^/.*'});
            expect(validateField(param, ['/ok',
                'bad',
                '/fine'])).toBe(
                'source_dir element "bad" does not match pattern ^/.*',
            );
        });

        it('requires a full match, not a partial one', () => {
            const param = arrayParam({pattern: '/mnt'});
            // "/mnt/x" contains /mnt but is not a full match -> invalid.
            expect(validateField(param, ['/mnt/x'])).toBe(
                'source_dir element "/mnt/x" does not match pattern /mnt',
            );
            expect(validateField(param, ['/mnt'])).toBeNull();
        });

        it('passes when every element matches the pattern', () => {
            const param = arrayParam({pattern: '^/.*'});
            expect(validateField(param, ['/a', '/b/c'])).toBeNull();
        });
    });

    describe('isFieldOverridden', () => {
        it('is false when the value equals the file default array', () => {
            const param = arrayParam({required: false, default: ['/a', '/b']});
            expect(isFieldOverridden(param, ['/a', '/b'])).toBe(false);
        });

        it('is true when the value differs from the default array (order matters)', () => {
            const param = arrayParam({required: false, default: ['/a', '/b']});
            expect(isFieldOverridden(param, ['/b', '/a'])).toBe(true);
        });

        it('is true when any element differs', () => {
            const param = arrayParam({required: false, default: ['/a']});
            expect(isFieldOverridden(param, ['/a', '/b'])).toBe(true);
        });

        it('treats a non-empty value against no default as overridden', () => {
            expect(isFieldOverridden(arrayParam(), ['/a'])).toBe(true);
        });

        it('treats an empty value against no default as not overridden', () => {
            expect(isFieldOverridden(arrayParam(), [])).toBe(false);
        });
    });

    describe('toParamSubmission', () => {
        it('encodes a string_array into values, leaving value empty', () => {
            const sub = toParamSubmission(arrayParam(), ['/a', '/b']);
            expect(sub).toEqual({name: 'source_dir', value: '', values: ['/a', '/b']});
        });

        it('encodes an empty string_array as no values', () => {
            const sub = toParamSubmission(arrayParam({required: false}), []);
            expect(sub).toEqual({name: 'source_dir', value: '', values: []});
        });
    });
});

describe('isEffectivelyRequired (string_array)', () => {
    it('is required when the file marks it required', () => {
        expect(isEffectivelyRequired(arrayParam())).toBe(true);
    });

    it('is not required when optional (empty array is a valid empty form)', () => {
        expect(isEffectivelyRequired(arrayParam({required: false}))).toBe(false);
    });
});

// The scalar paths share the same field model. These specs cover the scalar
// branches (initial value, override detection, submit encoding into `value`, and
// effective-required rules) so the whole module is exercised. Scalar client
// validation is a later Phase 2 slice and currently returns null.
function scalarParam(overrides: Partial<WorkflowParameter> = {}): WorkflowParameter {
    return {
        name: 'bucket',
        type: 'string',
        required: false,
        ...overrides,
    };
}

describe('scalar field model', () => {
    describe('initialFieldValue', () => {
        it('uses the file default string when set', () => {
            expect(initialFieldValue(scalarParam({default: 'media'}))).toBe('media');
        });

        it('stringifies a non-string default (int/bool)', () => {
            expect(initialFieldValue(scalarParam({type: 'int', default: 12}))).toBe('12');
            expect(initialFieldValue(scalarParam({type: 'bool', default: true}))).toBe('true');
        });

        it('is empty when no default is set', () => {
            expect(initialFieldValue(scalarParam())).toBe('');
        });
    });

    describe('validateField', () => {
        it('returns null for a scalar (scalar validation is a later slice)', () => {
            expect(validateField(scalarParam({required: true}), '')).toBeNull();
        });
    });

    describe('isFieldOverridden', () => {
        it('is false when the value equals the default', () => {
            expect(isFieldOverridden(scalarParam({default: 'media'}), 'media')).toBe(false);
        });

        it('is true when the value differs from the default', () => {
            expect(isFieldOverridden(scalarParam({default: 'media'}), 'archive')).toBe(true);
        });

        it('treats a non-array value against an array field position defensively as empty', () => {
            // A scalar field never holds an array, but the guard coerces defensively.
            expect(isFieldOverridden(scalarParam(), [] as unknown as string)).toBe(false);
        });
    });

    describe('toParamSubmission', () => {
        it('encodes a scalar into value, leaving values empty', () => {
            expect(toParamSubmission(scalarParam(), 'archive')).toEqual({
                name: 'bucket',
                value: 'archive',
                values: [],
            });
        });

        it('coerces a non-string scalar value defensively to empty', () => {
            expect(toParamSubmission(scalarParam(), [] as unknown as string)).toEqual({
                name: 'bucket',
                value: '',
                values: [],
            });
        });
    });
});

describe('isEffectivelyRequired (scalar)', () => {
    it('is required when the file marks it required', () => {
        expect(isEffectivelyRequired(scalarParam({required: true}))).toBe(true);
    });

    it('a string/enum with no default is not required (has an empty form)', () => {
        expect(isEffectivelyRequired(scalarParam())).toBe(false);
        expect(isEffectivelyRequired(scalarParam({type: 'enum', values: ['a']}))).toBe(false);
    });

    it('a bool/int/float with no default is effectively required', () => {
        expect(isEffectivelyRequired(scalarParam({type: 'bool'}))).toBe(true);
        expect(isEffectivelyRequired(scalarParam({type: 'int'}))).toBe(true);
        expect(isEffectivelyRequired(scalarParam({type: 'float'}))).toBe(true);
    });

    it('a bool/int/float with a default is not required', () => {
        expect(isEffectivelyRequired(scalarParam({type: 'int', default: 0}))).toBe(false);
    });
});
