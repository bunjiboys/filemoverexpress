import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STEP_TYPES, validateAgainstSchema, WORKFLOW_SCHEMA } from './loader';

// Resolve from the gui package cwd (stable under both plain and coverage-instrumented
// runs, unlike import.meta.url which the coverage transform can relocate). Tests run
// with cwd = src/gui, so the repo root is two levels up.
const rootSchemaPath = resolve(process.cwd(), '../../schemas/workflow/v1.json');
const bundledSchemaPath = resolve(process.cwd(), 'src/app/classes/workflow/schema/v1.json');

describe('workflow schema loader', () => {
    it('bundles a copy byte-identical to the authoritative root schema', () => {
        const root = readFileSync(rootSchemaPath, 'utf8');
        const bundled = readFileSync(bundledSchemaPath, 'utf8');
        expect(bundled).toBe(root);
    });

    it('exposes the schema with its canonical $id', () => {
        expect(WORKFLOW_SCHEMA.$id).toBe('https://fme.dev/schemas/workflow/v1.json');
    });

    it('exposes the four v1 step types from the schema enum', () => {
        expect(STEP_TYPES).toEqual(['Job',
            'Checksum',
            'Sleep',
            'InventoryReport']);
    });

    it('includes string_array in the parameter type enum', () => {
        const types = WORKFLOW_SCHEMA.$defs.parameter.properties.type.enum;
        expect(types).toContain('string_array');
    });

    it('accepts a minimal valid single-step workflow', () => {
        const result = validateAgainstSchema({
            apiVersion: 'fme.dev/workflow/v1',
            kind: 'Workflow',
            spec: {
                steps: [
                    {
                        id: 'ingest',
                        type: 'Job',
                        with: {
                            direction: 'upload',
                            transferProfile: 'prod',
                            sources: ['/vol/card-a'],
                            destination: 'shows/x/day-012',
                        },
                    },
                ],
            },
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('rejects a document missing required top-level fields', () => {
        const result = validateAgainstSchema({ kind: 'Workflow' });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
