import { describe, it, expect } from 'vitest';
import { getDescriptor, hasDescriptor, descriptorTypes, DESCRIPTORS } from './registry';
import { STEP_TYPES } from '../schema/loader';
import { jobDescriptor } from './job';

// The registry maps a step `type` to its descriptor. Its defining invariant: the set
// of registered types must EXACTLY equal the schema's step-type enum (STEP_TYPES).
// This is what enforces the schema-driven design (docs sections 2, 13): a schema type
// with no descriptor, or a descriptor for a non-schema type, is a bug the suite
// catches here rather than at runtime.
describe('descriptor registry', () => {
    it('registers exactly the schema step types - no more, no less', () => {
        expect([...descriptorTypes()].sort()).toEqual([...STEP_TYPES].sort());
    });

    it('every registered descriptor reports the type it is keyed under', () => {
        for (const type of descriptorTypes()) {
            expect(getDescriptor(type).type).toBe(type);
        }
    });

    it('looks up a descriptor by type', () => {
        expect(getDescriptor('Job')).toBe(jobDescriptor);
    });

    it('reports whether a type has a descriptor', () => {
        expect(hasDescriptor('Job')).toBe(true);
        expect(hasDescriptor('NotAType')).toBe(false);
    });

    it('throws a clear error for an unknown type', () => {
        expect(() => getDescriptor('NotAType')).toThrow(/unknown step type: NotAType/i);
    });

    it('exposes the descriptor map keyed by type', () => {
        expect(Object.keys(DESCRIPTORS).sort()).toEqual([...STEP_TYPES].sort());
    });
});
