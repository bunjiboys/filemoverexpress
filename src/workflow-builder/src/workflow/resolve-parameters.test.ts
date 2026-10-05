import { describe, it, expect } from 'vitest';
import { resolveParameters } from './resolve-parameters';
import type { ParameterSpec } from './parameters';

const run = (
    withValue: Record<string, unknown>,
    parameters: ParameterSpec[],
    values: Record<string, unknown> = {},
): { with: Record<string, unknown>; errors: string[] } => {
    const result = resolveParameters(withValue, parameters, values);
    return { with: result.resolved, errors: result.errors };
};

describe('resolveParameters', () => {
    it('substitutes an embedded reference as a string', () => {
        const r = run(
            { destination: 'shows/${params.show}/day-${params.day}' },
            [{ name: 'show', type: 'string' }, { name: 'day', type: 'string' }],
            { show: 'x', day: '012' },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.destination).toBe('shows/x/day-012');
    });

    it('preserves native type for a whole-value bool reference', () => {
        const r = run(
            { force: '${params.force}' },
            [{ name: 'force', type: 'bool', default: true }],
        );
        expect(r.with.force).toBe(true);
    });

    it('preserves native type for a whole-value int reference', () => {
        const r = run(
            { retries: '${params.n}' },
            [{ name: 'n', type: 'int', default: 3 }],
        );
        expect(r.with.retries).toBe(3);
    });

    it('renders an int as a plain decimal string when embedded', () => {
        const r = run(
            { tag: 'v${params.n}' },
            [{ name: 'n', type: 'int' }],
            { n: 12 },
        );
        expect(r.with.tag).toBe('v12');
    });

    it('renders a float without exponent or trailing-zero padding', () => {
        const r = run({ ratio: '${params.r}' }, [{ name: 'r', type: 'float' }], { r: 1.5 });
        expect(r.with.ratio).toBe(1.5);
    });

    it('uses a default when the value is omitted', () => {
        const r = run({ env: '${params.env}' }, [{ name: 'env', type: 'string', default: 'prod' }]);
        expect(r.with.env).toBe('prod');
    });

    it('errors when a required parameter has no value', () => {
        const r = run({ d: '${params.day}' }, [{ name: 'day', type: 'string', required: true }]);
        expect(r.errors.some((e) => /required parameter: day/i.test(e))).toBe(true);
    });

    it('resolves an omitted optional string to empty', () => {
        const r = run({ note: 'x${params.note}' }, [{ name: 'note', type: 'string' }]);
        expect(r.with.note).toBe('x');
    });

    it('errors when a bool parameter has no value and no default (no empty form)', () => {
        const r = run({ force: '${params.force}' }, [{ name: 'force', type: 'bool' }]);
        expect(r.errors.some((e) => /no value.*no default.*force/i.test(e))).toBe(true);
    });

    it('enforces enum membership', () => {
        const r = run(
            { env: '${params.env}' },
            [{ name: 'env', type: 'enum', values: ['prod', 'staging'] }],
            { env: 'dev' },
        );
        expect(r.errors.some((e) => /env.*not one of/i.test(e))).toBe(true);
    });

    it('enforces int min/max bounds', () => {
        const r = run({ n: '${params.n}' }, [{ name: 'n', type: 'int', min: 1, max: 5 }], { n: 9 });
        expect(r.errors.some((e) => /n.*out of range/i.test(e))).toBe(true);
    });

    it('flags a value below the minimum', () => {
        const r = run({ n: '${params.n}' }, [{ name: 'n', type: 'int', min: 3 }], { n: 1 });
        expect(r.errors.some((e) => /n.*out of range/i.test(e))).toBe(true);
    });

    it('accepts a float within bounds', () => {
        const r = run({ r: '${params.r}' }, [{ name: 'r', type: 'float', min: 0, max: 1 }], { r: 0.5 });
        expect(r.errors).toEqual([]);
        expect(r.with.r).toBe(0.5);
    });

    it('accepts a valid enum value', () => {
        const r = run(
            { e: '${params.e}' },
            [{ name: 'e', type: 'enum', values: ['a', 'b'] }],
            { e: 'a' },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.e).toBe('a');
    });

    it('accepts a string matching its pattern', () => {
        const r = run(
            { id: '${params.id}' },
            [{ name: 'id', type: 'string', pattern: '^[a-z]+$' }],
            { id: 'abc' },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.id).toBe('abc');
    });

    it('enforces a string pattern', () => {
        const r = run(
            { id: '${params.id}' },
            [{ name: 'id', type: 'string', pattern: '^[a-z]+$' }],
            { id: 'ABC' },
        );
        expect(r.errors.some((e) => /id.*does not match/i.test(e))).toBe(true);
    });

    it('leaves non-string with-values untouched', () => {
        const r = run({ flag: true, count: 2 }, []);
        expect(r.with).toEqual({ flag: true, count: 2 });
    });

    it('substitutes references nested in arrays and objects', () => {
        const r = run(
            { sources: ['/vol/${params.card}'], opts: { tag: 'v${params.card}' }, nums: [1,
                2,
                3] },
            [{ name: 'card', type: 'string' }],
            { card: 'A' },
        );
        expect(r.with.sources).toEqual(['/vol/A']);
        expect(r.with.opts).toEqual({ tag: 'vA' });
        expect(r.with.nums).toEqual([1,
            2,
            3]);
    });

    it('renders an embedded string parameter via its string form', () => {
        const r = run({ path: 'base/${params.name}' }, [{ name: 'name', type: 'string' }], { name: 'leaf' });
        expect(r.with.path).toBe('base/leaf');
    });

    it('renders an unresolved (undeclared) embedded reference as empty', () => {
        const r = run({ path: 'base/${params.ghost}' }, []);
        expect(r.with.path).toBe('base/');
    });

    it('leaves an unresolved whole-value reference as the literal string', () => {
        const r = run({ x: '${params.ghost}' }, []);
        expect(r.with.x).toBe('${params.ghost}');
    });

    it('renders a null-valued parameter as empty when embedded', () => {
        const r = run({ x: 'a${params.n}' }, [{ name: 'n', type: 'string', default: null }]);
        expect(r.with.x).toBe('a');
    });

    it('renders an embedded reference to an unresolved declared parameter as empty', () => {
        // A required param with no supplied value resolves to undefined; embedding it
        // renders empty (and the missing-required error is also reported).
        const r = run({ x: 'a${params.n}' }, [{ name: 'n', type: 'bool', required: true }]);
        expect(r.with.x).toBe('a');
        expect(r.errors.some((e) => /required parameter: n/i.test(e))).toBe(true);
    });

    it('preserves the array for a whole-value string_array reference', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array' }],
            { cards: ['/vol/A', '/vol/B'] },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.sources).toEqual(['/vol/A', '/vol/B']);
    });

    it('uses an array default for an omitted string_array', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array', default: ['/vol/X'] }],
        );
        expect(r.errors).toEqual([]);
        expect(r.with.sources).toEqual(['/vol/X']);
    });

    it('resolves an omitted optional string_array to an empty array', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array' }],
        );
        expect(r.errors).toEqual([]);
        expect(r.with.sources).toEqual([]);
    });

    it('errors when a required string_array has no value', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array', required: true }],
        );
        expect(r.errors.some((e) => /required parameter: cards/i.test(e))).toBe(true);
    });

    it('applies a string_array pattern element-wise and accepts a matching list', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array', pattern: '^/vol/[A-Z]$' }],
            { cards: ['/vol/A', '/vol/B'] },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.sources).toEqual(['/vol/A', '/vol/B']);
    });

    it('flags a string_array whose element violates the pattern', () => {
        const r = run(
            { sources: '${params.cards}' },
            [{ name: 'cards', type: 'string_array', pattern: '^/vol/[A-Z]$' }],
            { cards: ['/vol/A', '/bad'] },
        );
        expect(r.errors.some((e) => /cards.*element.*does not match/i.test(e))).toBe(true);
    });

    it('resolves a transfer_profile parameter as a plain string', () => {
        const r = run(
            { transferProfile: '${params.profile}' },
            [{ name: 'profile', type: 'transfer_profile' }],
            { profile: 'fast-upload' },
        );
        expect(r.errors).toEqual([]);
        expect(r.with.transferProfile).toBe('fast-upload');
    });

    it('resolves an omitted optional transfer_profile to empty (daemon validates membership)', () => {
        const r = run(
            { transferProfile: '${params.profile}' },
            [{ name: 'profile', type: 'transfer_profile' }],
        );
        expect(r.errors).toEqual([]);
        expect(r.with.transferProfile).toBe('');
    });

    it('errors when a required transfer_profile has no value', () => {
        const r = run(
            { transferProfile: '${params.profile}' },
            [{ name: 'profile', type: 'transfer_profile', required: true }],
        );
        expect(r.errors.some((e) => /required parameter: profile/i.test(e))).toBe(true);
    });
});
