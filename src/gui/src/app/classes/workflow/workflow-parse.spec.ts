import { describe, expect, it } from 'vitest';
import { parseWorkflowDocument } from './workflow-parse';

const minimalYaml = `apiVersion: fme.dev/workflow/v1
kind: Workflow
metadata:
  name: nightly-media-sync
spec:
  parameters:
    - name: bucket
      type: string
      required: true
      pattern: "^[a-z0-9.-]+$"
    - name: max_parallel
      type: int
      default: 4
      min: 1
      max: 16
    - name: overwrite
      type: bool
      default: false
    - name: profile
      type: enum
      values: ["fast", "safe"]
      default: safe
    - name: source_dir
      type: string_array
      required: true
  steps:
    - id: ingest
      name: Ingest cards
      type: Upload
      with:
        transferProfile: "\${params.profile}"
        sources: ["\${params.source_dir}"]
        destination: "archive/\${params.bucket}"
    - id: verify
      type: Checksum
      with:
        sources: ["\${params.source_dir}"]
`;

describe('parseWorkflowDocument', () => {
    describe('valid documents', () => {
        it('parses a valid YAML workflow into a ParsedWorkflowDocument', () => {
            const result = parseWorkflowDocument(minimalYaml, 'yaml');
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.document.name).toBe('nightly-media-sync');
            expect(result.document.format).toBe('yaml');
            expect(result.document.documentText).toBe(minimalYaml);
            expect(result.document.steps).toEqual([
                {id: 'ingest', name: 'Ingest cards', type: 'Upload'}, {id: 'verify', name: undefined, type: 'Checksum'},
            ]);
        });

        it('maps each parameter with its type, required, default, and constraints', () => {
            const result = parseWorkflowDocument(minimalYaml, 'yaml');
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            const params = result.document.parameters;
            expect(params).toHaveLength(5);

            expect(params[0]).toEqual({
                name: 'bucket', type: 'string', required: true, pattern: '^[a-z0-9.-]+$',
            });
            expect(params[1]).toEqual({
                name: 'max_parallel', type: 'int', required: false, default: 4, min: 1, max: 16,
            });
            expect(params[2]).toEqual({
                name: 'overwrite', type: 'bool', required: false, default: false,
            });
            expect(params[3]).toEqual({
                name: 'profile', type: 'enum', required: false, default: 'safe', values: ['fast', 'safe'],
            });
            expect(params[4]).toEqual({
                name: 'source_dir', type: 'string_array', required: true,
            });
        });

        it('parses the equivalent JSON document', () => {
            const json = JSON.stringify({
                apiVersion: 'fme.dev/workflow/v1',
                kind: 'Workflow',
                metadata: {name: 'from-json'},
                spec: {
                    steps: [{id: 'a', type: 'Sleep', with: {duration: '5s'}}],
                },
            });
            const result = parseWorkflowDocument(json, 'json');
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.document.name).toBe('from-json');
            expect(result.document.parameters).toEqual([]);
            expect(result.document.steps).toEqual([{id: 'a', name: undefined, type: 'Sleep'}]);
        });

        it('falls back to a label when metadata.name is absent', () => {
            const json = JSON.stringify({
                apiVersion: 'fme.dev/workflow/v1',
                kind: 'Workflow',
                spec: {steps: [{id: 'a', type: 'Sleep', with: {duration: '5s'}}]},
            });
            const result = parseWorkflowDocument(json, 'json');
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.document.name).toBe('(unnamed workflow)');
        });

        it('defaults absent parameters to an empty list', () => {
            const json = JSON.stringify({
                apiVersion: 'fme.dev/workflow/v1',
                kind: 'Workflow',
                spec: {steps: [{id: 'a', type: 'Sleep', with: {duration: '5s'}}]},
            });
            const result = parseWorkflowDocument(json, 'json');
            if (!result.ok) {
                throw new Error('expected ok');
            }
            expect(result.document.parameters).toEqual([]);
        });
    });

    describe('malformed input', () => {
        it('rejects unparseable YAML with a syntax error', () => {
            const result = parseWorkflowDocument('key: : : nope\n  - broken', 'yaml');
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error.kind).toBe('syntax');
            expect(result.error.message.length).toBeGreaterThan(0);
        });

        it('rejects unparseable JSON with a syntax error', () => {
            const result = parseWorkflowDocument('{ not json ', 'json');
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error.kind).toBe('syntax');
        });

        it('rejects a non-object document', () => {
            const result = parseWorkflowDocument('"just a string"', 'json');
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error.kind).toBe('schema');
        });
    });

    describe('schema-invalid input', () => {
        it('rejects a document that violates the schema', () => {
            const json = JSON.stringify({kind: 'Workflow'});
            const result = parseWorkflowDocument(json, 'json');
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error.kind).toBe('schema');
            expect(result.error.message.length).toBeGreaterThan(0);
        });

        it('rejects a workflow with an unknown parameter type', () => {
            const json = JSON.stringify({
                apiVersion: 'fme.dev/workflow/v1',
                kind: 'Workflow',
                spec: {
                    parameters: [{name: 'x', type: 'date'}],
                    steps: [{id: 'a', type: 'Sleep', with: {duration: '5s'}}],
                },
            });
            const result = parseWorkflowDocument(json, 'json');
            expect(result.ok).toBe(false);
        });
    });
});
