import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { WORKFLOW_SCHEMA, STEP_TYPES, validateWorkflow } from './loader';

// Resolve from the workflow-builder package cwd (stable under both plain and
// coverage-instrumented runs, unlike import.meta.url which the coverage transform can
// relocate). Tests run with cwd = src/workflow-builder, so the repo root is two levels up.
const rootSchemaPath = resolve(process.cwd(), '../../schemas/workflow/v1.json');
const bundledSchemaPath = resolve(process.cwd(), 'src/schema/v1.json');

// First test, written before the loader exists (red-green-refactor, section 13).
// Everything asserts against the REAL bundled schema (src/schema/v1.json), the
// authoritative contract per section 13's build-order rule.
describe('schema loader', () => {
    // The bundled copy MUST stay byte-identical to the authoritative root schema
    // (schemas/workflow/v1.json); the builder bundles that exact file and never authors a
    // divergent copy (section 13). This guard fails CI if the copy drifts, matching the
    // CLI's TestEmbeddedSchemaMatchesRoot and the GUI loader's byte-identity guard. Run
    // `task schema:sync` to regenerate the copies from the source of truth.
    it('bundles a copy byte-identical to the authoritative root schema', () => {
        const root = readFileSync(rootSchemaPath, 'utf8');
        const bundled = readFileSync(bundledSchemaPath, 'utf8');
        expect(bundled).toBe(root);
    });

    it('bundles the v1 workflow schema with its canonical $id', () => {
        expect(WORKFLOW_SCHEMA.$id).toBe('https://fme.dev/schemas/workflow/v1.json');
    });

    it('exposes exactly the five v1 step types from the schema', () => {
        expect(STEP_TYPES).toEqual([
            'Upload',
            'Download',
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
                        type: 'Upload',
                        with: {
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

    it('rejects an Upload step whose with payload omits a required field', () => {
        const doc = {
            apiVersion: 'fme.dev/workflow/v1',
            kind: 'Workflow',
            spec: {
                steps: [
                    {
                        id: 'bad',
                        type: 'Upload',
                        with: {
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
