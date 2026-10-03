import { describe, it, expect, vi } from 'vitest';
import { importWorkflow, exportWorkflow } from './io-actions';
import type { FileAccess } from './file-access';
import { API_VERSION, KIND, type WorkflowGraph } from '../workflow/graph';

const validYaml = [
    `apiVersion: ${API_VERSION}`,
    `kind: ${KIND}`,
    'spec:',
    '  steps:',
    '    - id: step-1',
    '      type: Sleep',
    '      with: { duration: 30s }',
    '',
].join('\n');

const graph: WorkflowGraph = {
    nodes: [{ id: 'step-1', type: 'Sleep', with: { duration: '30s' }, continueOnError: false }],
    edges: [],
    metadata: { name: 'My Flow' },
};

function fileAccess(over: Partial<FileAccess> = {}): FileAccess {
    return { open: vi.fn(), save: vi.fn(), ...over };
}

// The import/export orchestration (docs sections 6, 9): open a file through the
// FileAccess seam, infer its format from the name, parse+validate to a graph, and hand
// back the result; or serialize the current graph and save it. The browser dialog glue
// lives in file-access (excluded); here the flow is tested with a mock FileAccess.
describe('importWorkflow', () => {
    it('opens a file, parses it, and returns the imported graph and format', async () => {
        const access = fileAccess({ open: vi.fn().mockResolvedValue({ name: 'wf.yaml', text: validYaml }) });
        const result = await importWorkflow(access);
        expect(result.status).toBe('imported');
        if (result.status === 'imported') {
            expect(result.format).toBe('yaml');
            expect(result.text).toBe(validYaml);
            expect(result.graph.nodes.map((n) => n.id)).toEqual(['step-1']);
        }
    });

    it('infers json format from the file name', async () => {
        const json = JSON.stringify({
            apiVersion: API_VERSION,
            kind: KIND,
            spec: { steps: [{ id: 'a', type: 'Sleep', with: { duration: '1s' } }] },
        });
        const access = fileAccess({ open: vi.fn().mockResolvedValue({ name: 'wf.json', text: json }) });
        const result = await importWorkflow(access);
        expect(result.status === 'imported' && result.format).toBe('json');
    });

    it('returns cancelled when the user dismisses the dialog', async () => {
        const access = fileAccess({ open: vi.fn().mockResolvedValue(undefined) });
        expect((await importWorkflow(access)).status).toBe('cancelled');
    });

    it('returns invalid when the opened file does not parse/validate', async () => {
        const access = fileAccess({ open: vi.fn().mockResolvedValue({ name: 'bad.yaml', text: 'kind: nope' }) });
        const result = await importWorkflow(access);
        expect(result.status).toBe('invalid');
    });

    it('imports directly-provided file content without opening a dialog (file-drop)', async () => {
        const access = fileAccess();
        const result = await importWorkflow(access, { name: 'dropped.yaml', text: validYaml });
        expect(access.open).not.toHaveBeenCalled();
        expect(result.status).toBe('imported');
    });
});

describe('exportWorkflow', () => {
    it('serializes the graph and saves it under a name derived from the workflow', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        await exportWorkflow(fileAccess({ save }), graph, 'yaml');
        expect(save).toHaveBeenCalledTimes(1);
        const [name,
            text,
            format] = save.mock.calls[0];
        expect(name).toBe('my-flow.yaml');
        expect(format).toBe('yaml');
        expect(text).toContain('apiVersion');
    });

    it('exports as JSON when the format is json', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        await exportWorkflow(fileAccess({ save }), graph, 'json');
        const [name, text] = save.mock.calls[0];
        expect(name).toBe('my-flow.json');
        expect(() => JSON.parse(text)).not.toThrow();
    });
});
