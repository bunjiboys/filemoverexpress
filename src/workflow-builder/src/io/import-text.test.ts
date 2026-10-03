import { describe, it, expect } from 'vitest';
import { formatForFileName } from './import-text';

// On import the file's extension decides which parser to use (docs section 6): .json
// is JSON, .yaml/.yml (and anything else) is YAML, since YAML is the authored default
// and a superset that also parses JSON. Pure, so it is unit-tested without a file.
describe('formatForFileName', () => {
    it('treats a .json file as json', () => {
        expect(formatForFileName('workflow.json')).toBe('json');
        expect(formatForFileName('WORKFLOW.JSON')).toBe('json');
    });

    it('treats .yaml and .yml as yaml', () => {
        expect(formatForFileName('workflow.yaml')).toBe('yaml');
        expect(formatForFileName('workflow.yml')).toBe('yaml');
    });

    it('defaults an unknown or missing extension to yaml', () => {
        expect(formatForFileName('workflow')).toBe('yaml');
        expect(formatForFileName('workflow.txt')).toBe('yaml');
        expect(formatForFileName('')).toBe('yaml');
    });

    it('uses the last extension for a multi-dot name', () => {
        expect(formatForFileName('fme.workflow.json')).toBe('json');
    });
});
