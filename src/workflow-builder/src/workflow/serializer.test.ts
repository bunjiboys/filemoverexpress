import { describe, it, expect } from 'vitest';
import { toWorkflow, fromWorkflow } from './serializer';
import { API_VERSION, KIND, type WorkflowGraph, type WorkflowDocument } from './graph';

const jobWith = (dest: string): Record<string, unknown> => ({
    direction: 'upload',
    transferProfile: 'prod',
    sources: ['/vol/a'],
    destination: dest,
});

describe('toWorkflow', () => {
    it('emits a well-formed v1 document with apiVersion and kind', () => {
        const graph: WorkflowGraph = {
            nodes: [{ id: 'a', type: 'Upload', with: jobWith('x'), continueOnError: false }],
            edges: [],
        };
        const doc = toWorkflow(graph);
        expect(doc.apiVersion).toBe(API_VERSION);
        expect(doc.kind).toBe(KIND);
        expect(doc.spec.steps).toHaveLength(1);
    });

    it('reconstructs dependsOn from incoming edges', () => {
        const graph: WorkflowGraph = {
            nodes: [
                { id: 'a', type: 'Upload', with: jobWith('x'), continueOnError: false },
                { id: 'b', type: 'Upload', with: jobWith('y'), continueOnError: false },
                { id: 'c', type: 'Sleep', with: { duration: '5s' }, continueOnError: false },
            ],
            edges: [
                { source: 'a', target: 'c' }, { source: 'b', target: 'c' },
            ],
        };
        const doc = toWorkflow(graph);
        const c = doc.spec.steps.find((s) => s.id === 'c');
        expect(c?.dependsOn).toEqual(['a', 'b']);
        // A node with no incoming edge has no dependsOn key at all.
        expect(doc.spec.steps.find((s) => s.id === 'a')).not.toHaveProperty('dependsOn');
    });

    it('carries metadata, parameters, and defaults through unchanged', () => {
        const graph: WorkflowGraph = {
            nodes: [{ id: 'a', type: 'Upload', with: jobWith('x'), continueOnError: false }],
            edges: [],
            metadata: { name: 'nightly', labels: { show: 'x' } },
            parameters: [{ name: 'day', type: 'string', required: true }],
            defaults: { transferProfile: 'prod' },
        } as WorkflowGraph & Record<string, unknown>;
        const doc = toWorkflow(graph);
        expect(doc.metadata).toEqual({ name: 'nightly', labels: { show: 'x' } });
        expect(doc.spec.parameters).toEqual([{ name: 'day', type: 'string', required: true }]);
        expect(doc.spec.defaults).toEqual({ transferProfile: 'prod' });
    });
});

describe('fromWorkflow', () => {
    it('builds nodes and reconstructs edges from dependsOn', () => {
        const doc: WorkflowDocument = {
            apiVersion: API_VERSION,
            kind: KIND,
            spec: {
                steps: [
                    { id: 'a', type: 'Upload', with: jobWith('x') }, { id: 'c', type: 'Sleep', with: { duration: '5s' }, dependsOn: ['a'] },
                ],
            },
        };
        const graph = fromWorkflow(doc);
        expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'c']);
        expect(graph.edges).toEqual([{ source: 'a', target: 'c' }]);
    });

    it('throws on a step whose type has no descriptor', () => {
        const doc: WorkflowDocument = {
            apiVersion: API_VERSION,
            kind: KIND,
            spec: { steps: [{ id: 'a', type: 'Mystery', with: {} }] },
        };
        expect(() => fromWorkflow(doc)).toThrow(/unknown step type: Mystery/i);
    });

    it('carries parameters and defaults back onto the graph', () => {
        const doc: WorkflowDocument = {
            apiVersion: API_VERSION,
            kind: KIND,
            spec: {
                parameters: [{ name: 'day', type: 'string' }],
                defaults: { force: false },
                steps: [{ id: 'a', type: 'Sleep', with: { duration: '1s' } }],
            },
        };
        const graph = fromWorkflow(doc);
        expect(graph.parameters).toEqual([{ name: 'day', type: 'string' }]);
        expect(graph.defaults).toEqual({ force: false });
    });
});

describe('round-trip', () => {
    it('toWorkflow(fromWorkflow(doc)) is canonical', () => {
        const doc: WorkflowDocument = {
            apiVersion: API_VERSION,
            kind: KIND,
            metadata: { name: 'nightly' },
            spec: {
                steps: [
                    { id: 'a', name: 'Ingest', type: 'Upload', with: jobWith('x') },
                    { id: 'b', type: 'Checksum', with: { sources: ['/vol/a'], algorithm: 'xxh3' } },
                    { id: 'c', type: 'Sleep', with: { duration: '5s' }, dependsOn: ['a', 'b'], continueOnError: true },
                ],
            },
        };
        expect(toWorkflow(fromWorkflow(doc))).toEqual(doc);
    });
});
