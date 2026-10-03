import { describe, it, expect } from 'vitest';
import { WORKFLOW_SCHEMA, STEP_TYPES, validateWorkflow } from './loader';

// First test, written before the loader exists (red-green-refactor, section 13).
// Everything asserts against the REAL bundled schema (src/schema/v1.json), the
// authoritative contract per section 13's build-order rule.
describe('schema loader', () => {
    it('bundles the v1 workflow schema with its canonical $id', () => {
        expect(WORKFLOW_SCHEMA.$id).toBe('https://fme.dev/schemas/workflow/v1.json');
    });

    it('exposes exactly the four v1 step types from the schema', () => {
        expect(STEP_TYPES).toEqual([
            'Job',
            'Checksum',
            'Sleep',
            'InventoryReport',
        ]);
    });

    it('accepts a minimal valid single-step workflow', () => {
        const doc = {
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
        };
        const result = validateWorkflow(doc);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('rejects a document missing required top-level fields', () => {
        const result = validateWorkflow({ kind: 'Workflow' });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a Job step whose with payload omits a required field', () => {
        const doc = {
            apiVersion: 'fme.dev/workflow/v1',
            kind: 'Workflow',
            spec: {
                steps: [
                    {
                        id: 'bad',
                        type: 'Job',
                        with: {
                            direction: 'upload',
                            transferProfile: 'prod',
                            // sources and destination missing
                        },
                    },
                ],
            },
        };
        const result = validateWorkflow(doc);
        expect(result.valid).toBe(false);
    });
});
