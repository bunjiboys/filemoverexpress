import { describe, it, expect } from 'vitest';
import { convertText } from './convert-text';

const yaml = [
    'apiVersion: fme.dev/workflow/v1',
    'kind: Workflow',
    'spec:',
    '  steps:',
    '    - id: a',
    '      type: Sleep',
    '      with:',
    '        duration: 30s',
    '',
].join('\n');

describe('convertText', () => {
    it('converts YAML to JSON preserving the document content', () => {
        const json = convertText(yaml, 'yaml', 'json');
        const parsed = JSON.parse(json);
        expect(parsed.kind).toBe('Workflow');
        expect(parsed.spec.steps[0].with.duration).toBe('30s');
    });

    it('converts JSON back to YAML preserving content', () => {
        const json = convertText(yaml, 'yaml', 'json');
        const backToYaml = convertText(json, 'json', 'yaml');
        expect(backToYaml).toContain('kind: Workflow');
        expect(backToYaml).toContain('duration: 30s');
    });

    it('is a no-op when the source and target formats are the same', () => {
        expect(convertText(yaml, 'yaml', 'yaml')).toBe(yaml);
    });

    it('returns the original text unchanged when it cannot be parsed', () => {
        const broken = '{ not valid yaml or json';
        expect(convertText(broken, 'json', 'yaml')).toBe(broken);
    });
});
