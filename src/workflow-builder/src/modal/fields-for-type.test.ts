import { describe, it, expect } from 'vitest';
import { fieldsForType } from './fields-for-type';
import { STEP_TYPES } from '../schema/loader';

const field = (fields: ReturnType<typeof fieldsForType>, name: string) => {
    const f = fields.find((x) => x.name === name);
    if (f === undefined) {
        throw new Error(`field ${name} not found`);
    }
    return f;
};

// The property form is derived from the bundled schema's <T>Step $defs, so these
// assertions are against the real schema (docs section 2).
describe('fieldsForType', () => {
    it('derives Job fields with the right kinds and required flags', () => {
        const fields = fieldsForType('Job');
        const names = fields.map((f) => f.name);
        expect(names).toEqual([
            'direction',
            'transferProfile',
            'sources',
            'destination',
            'uploadBasePath',
            's3PrefixToTrim',
            'force',
        ]);
        expect(field(fields, 'direction').kind).toBe('enum');
        expect(field(fields, 'direction').enumValues).toEqual(['upload', 'download']);
        expect(field(fields, 'sources').kind).toBe('stringList');
        expect(field(fields, 'force').kind).toBe('boolean');
        expect(field(fields, 'transferProfile').required).toBe(true);
        expect(field(fields, 'uploadBasePath').required).toBe(false);
    });

    it('derives Checksum fields including the algorithm enum and its default', () => {
        const fields = fieldsForType('Checksum');
        expect(field(fields, 'algorithm').kind).toBe('enum');
        expect(field(fields, 'algorithm').enumValues).toEqual(['md5',
            'xxhash',
            'xxhash64',
            'xxh3']);
        expect(field(fields, 'algorithm').default).toBe('xxh3');
        expect(field(fields, 'sources').kind).toBe('stringList');
        expect(field(fields, 'writeMhl').kind).toBe('boolean');
    });

    it('derives Sleep with a single required duration string field', () => {
        const fields = fieldsForType('Sleep');
        expect(fields).toHaveLength(1);
        expect(field(fields, 'duration').kind).toBe('string');
        expect(field(fields, 'duration').required).toBe(true);
    });

    it('derives InventoryReport fields and has no prefix field', () => {
        const fields = fieldsForType('InventoryReport');
        const names = fields.map((f) => f.name);
        expect(names).toContain('transferProfile');
        expect(names).toContain('includeChecksums');
        expect(names).not.toContain('prefix');
    });

    it('produces a field set for every schema step type', () => {
        for (const type of STEP_TYPES) {
            expect(fieldsForType(type).length).toBeGreaterThan(0);
        }
    });

    it('throws for a type with no schema definition', () => {
        expect(() => fieldsForType('Mystery')).toThrow(/no schema definition.*Mystery/i);
    });
});
