import { describe, it, expect } from 'vitest';
import { instancePathToPosition } from './source-position';

const yamlDoc = [
    'apiVersion: fme.dev/workflow/v1', // line 1
    'kind: Workflow', // line 2
    'spec:', // line 3
    '  steps:', // line 4
    '    - id: step-1', // line 5
    '      type: Sleep', // line 6
    '      with:', // line 7
    '        duration: 30s', // line 8
    '', // line 9
].join('\n');

const jsonDoc = [
    '{', // 1
    '    "apiVersion": "fme.dev/workflow/v1",', // 2
    '    "kind": "Workflow",', // 3
    '    "spec": {', // 4
    '        "steps": [', // 5
    '            { "id": "step-1", "type": "Sleep", "with": { "duration": "30s" } }', // 6
    '        ]', // 7
    '    }', // 8
    '}', // 9
].join('\n');

// ajv reports a JSON-pointer instancePath (e.g. /spec, /spec/steps/0/with/duration),
// not an editor line/column, so schema annotations would otherwise all land on line 1
// (docs section 10). This maps a pointer to the 0-based {row, column} of the node it
// addresses, using the yaml library's position info (which parses JSON too).
describe('instancePathToPosition', () => {
    it('maps the document root (empty path) to the start of the document', () => {
        const pos = instancePathToPosition(yamlDoc, '');
        expect(pos).toEqual({ row: 0, column: 0 });
    });

    it('maps a top-level key path to that value in YAML', () => {
        // /spec addresses the mapping that starts on line 4 (its first key `steps`).
        const pos = instancePathToPosition(yamlDoc, '/spec');
        expect(pos?.row).toBe(3); // 0-based line 4
    });

    it('maps a nested path to the right line in YAML', () => {
        // /spec/steps/0/with/duration -> line 8 (0-based 7).
        const pos = instancePathToPosition(yamlDoc, '/spec/steps/0/with/duration');
        expect(pos?.row).toBe(7);
    });

    it('maps a path in JSON input too', () => {
        // /spec -> the object opening on line 4 (0-based 3).
        const pos = instancePathToPosition(jsonDoc, '/spec');
        expect(pos?.row).toBe(3);
    });

    it('maps an array index path in JSON', () => {
        // /spec/steps/0 -> the first array element on line 6 (0-based 5).
        const pos = instancePathToPosition(jsonDoc, '/spec/steps/0');
        expect(pos?.row).toBe(5);
    });

    it('returns undefined for a path that does not resolve to a node', () => {
        expect(instancePathToPosition(yamlDoc, '/spec/missing/deep')).toBeUndefined();
    });

    it('returns undefined when the text does not parse', () => {
        expect(instancePathToPosition(': : not : :', '/spec')).toBeUndefined();
    });

    it('decodes JSON-pointer escapes (~1 -> /, ~0 -> ~)', () => {
        const doc = ['weird:',
            '  "a/b": 1',
            ''].join('\n');
        // /weird/a~1b addresses the key "a/b".
        const pos = instancePathToPosition(doc, '/weird/a~1b');
        expect(pos?.row).toBe(1);
    });
});
