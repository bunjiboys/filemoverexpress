import { describe, it, expect } from 'vitest';
import { graphToText, textToGraph } from './model-text-sync';
import type { WorkflowGraph } from '../workflow/graph';
import { API_VERSION, KIND } from '../workflow/graph';

// The two views project from one model (docs section 10). These pure helpers are the
// seam: graphToText serializes the model for the editor (canvas -> editor), textToGraph
// parses editor text back into the model (editor -> canvas), returning undefined when
// the text does not parse/validate so the canvas can hold its last valid render.
describe('graphToText', () => {
    it('serializes a graph to canonical YAML', () => {
        const graph: WorkflowGraph = {
            nodes: [{ id: 'step-1', type: 'Sleep', with: { duration: '30s' }, continueOnError: false }],
            edges: [],
        };
        const text = graphToText(graph, 'yaml');
        expect(text).toContain(`apiVersion: ${API_VERSION}`);
        expect(text).toContain('duration: 30s');
    });

    it('serializes a graph to JSON when asked', () => {
        const graph: WorkflowGraph = {
            nodes: [{ id: 'step-1', type: 'Sleep', with: { duration: '30s' }, continueOnError: false }],
            edges: [],
        };
        const text = graphToText(graph, 'json');
        const parsed = JSON.parse(text);
        expect(parsed.kind).toBe(KIND);
        expect(parsed.spec.steps[0].id).toBe('step-1');
    });
});

describe('textToGraph', () => {
    it('parses valid YAML back into a graph', () => {
        const text = [
            `apiVersion: ${API_VERSION}`,
            `kind: ${KIND}`,
            'spec:',
            '  steps:',
            '    - id: step-1',
            '      type: Sleep',
            '      with:',
            '        duration: 30s',
            '',
        ].join('\n');
        const graph = textToGraph(text, 'yaml');
        expect(graph?.nodes.map((n) => n.id)).toEqual(['step-1']);
    });

    it('reconstructs edges from dependsOn', () => {
        const text = [
            `apiVersion: ${API_VERSION}`,
            `kind: ${KIND}`,
            'spec:',
            '  steps:',
            '    - id: a',
            '      type: Sleep',
            '      with: { duration: 1s }',
            '    - id: b',
            '      type: Sleep',
            '      with: { duration: 1s }',
            '      dependsOn: [a]',
            '',
        ].join('\n');
        const graph = textToGraph(text, 'yaml');
        expect(graph?.edges).toEqual([{ source: 'a', target: 'b' }]);
    });

    it('returns undefined for text that does not parse', () => {
        expect(textToGraph(': : not yaml : :', 'json')).toBeUndefined();
    });

    it('returns undefined for text that parses but fails schema validation', () => {
        // Missing the required apiVersion/kind/spec envelope.
        expect(textToGraph('{"foo": "bar"}', 'json')).toBeUndefined();
    });

    it('round-trips a graph through text', () => {
        const graph: WorkflowGraph = {
            nodes: [
                { id: 'a', type: 'Sleep', with: { duration: '1s' }, continueOnError: false }, { id: 'b', type: 'Sleep', with: { duration: '2s' }, continueOnError: false },
            ],
            edges: [{ source: 'a', target: 'b' }],
        };
        const back = textToGraph(graphToText(graph, 'yaml'), 'yaml');
        expect(back).toEqual(graph);
    });
});
