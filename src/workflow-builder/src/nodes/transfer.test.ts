import { describe, it, expect } from 'vitest';
import { uploadDescriptor, downloadDescriptor } from './transfer';
import type { WorkflowStep } from './descriptor';

// Test-first for the transfer node descriptors. Fields asserted here are the real
// UploadStep / DownloadStep payloads from schemas/workflow/v1.json: transferProfile/
// sources/destination required, plus uploadBasePath (Upload) or s3PrefixToTrim
// (Download) and force optional. The transfer direction is the step type, not a
// `with` field.
describe('uploadDescriptor', () => {
    it('handles the Upload step type', () => {
        expect(uploadDescriptor.type).toBe('Upload');
    });

    it('exposes a single generic in/out port pair', () => {
        expect(uploadDescriptor.ports).toEqual({ inputs: 1, outputs: 1 });
    });

    it('builds a node from an Upload step (import), carrying envelope and payload', () => {
        const step: WorkflowStep = {
            id: 'ingest',
            name: 'Ingest cards',
            type: 'Upload',
            with: {
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
                force: true,
            },
            dependsOn: ['prep'],
            continueOnError: true,
        };
        const node = uploadDescriptor.fromStep(step);
        expect(node).toEqual({
            id: 'ingest',
            type: 'Upload',
            name: 'Ingest cards',
            with: {
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
                force: true,
            },
            continueOnError: true,
        });
    });

    it('defaults continueOnError to false when the step omits it', () => {
        const step: WorkflowStep = {
            id: 'x',
            type: 'Upload',
            with: { transferProfile: 'p', sources: ['s'], destination: 'd' },
        };
        expect(uploadDescriptor.fromStep(step).continueOnError).toBe(false);
    });

    it('builds a step from a node (export), emitting name/continueOnError only when meaningful', () => {
        const node = {
            id: 'ingest',
            type: 'Upload',
            name: 'Ingest cards',
            with: {
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
            },
            continueOnError: true,
        };
        const step = uploadDescriptor.toStep(node);
        expect(step).toEqual({
            id: 'ingest',
            name: 'Ingest cards',
            type: 'Upload',
            with: {
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
            },
            continueOnError: true,
        });
    });

    it('omits name and continueOnError from the step when they are empty/false', () => {
        const node = {
            id: 'x',
            type: 'Upload',
            with: { transferProfile: 'p', sources: ['s'], destination: 'd' },
            continueOnError: false,
        };
        const step = uploadDescriptor.toStep(node);
        expect(step).not.toHaveProperty('name');
        expect(step).not.toHaveProperty('continueOnError');
        expect(step).not.toHaveProperty('dependsOn');
    });

    it('round-trips an Upload step through fromStep then toStep losslessly', () => {
        const step: WorkflowStep = {
            id: 'ingest',
            name: 'Ingest',
            type: 'Upload',
            with: {
                transferProfile: 'prod',
                sources: ['/vol/a', '/vol/b'],
                destination: 'shows/x',
                uploadBasePath: '/vol',
                force: false,
            },
            continueOnError: true,
        };
        expect(uploadDescriptor.toStep(uploadDescriptor.fromStep(step))).toEqual(step);
    });
});

describe('downloadDescriptor', () => {
    it('handles the Download step type', () => {
        expect(downloadDescriptor.type).toBe('Download');
    });

    it('round-trips a Download step (with s3PrefixToTrim) losslessly', () => {
        const step: WorkflowStep = {
            id: 'pull',
            name: 'Pull',
            type: 'Download',
            with: {
                transferProfile: 'prod',
                sources: ['s3://bucket/incoming/'],
                destination: '/mnt/ingest',
                s3PrefixToTrim: 'incoming/',
                force: false,
            },
            continueOnError: true,
        };
        expect(downloadDescriptor.toStep(downloadDescriptor.fromStep(step))).toEqual(step);
    });
});
