import { describe, it, expect } from 'vitest';
import { jobDescriptor } from './job';
import type { WorkflowStep } from './descriptor';

// Test-first for the Job node descriptor. Fields asserted here are the real JobStep
// payload from schemas/workflow/v1.json: required direction/transferProfile/sources/
// destination, optional uploadBasePath/s3PrefixToTrim/force.
describe('jobDescriptor', () => {
    it('handles the Job step type', () => {
        expect(jobDescriptor.type).toBe('Job');
    });

    it('exposes a single generic in/out port pair', () => {
        expect(jobDescriptor.ports).toEqual({ inputs: 1, outputs: 1 });
    });

    it('builds a node from a Job step (import), carrying envelope and payload', () => {
        const step: WorkflowStep = {
            id: 'ingest',
            name: 'Ingest cards',
            type: 'Job',
            with: {
                direction: 'upload',
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
                force: true,
            },
            dependsOn: ['prep'],
            continueOnError: true,
        };
        const node = jobDescriptor.fromStep(step);
        expect(node).toEqual({
            id: 'ingest',
            type: 'Job',
            name: 'Ingest cards',
            with: {
                direction: 'upload',
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
            type: 'Job',
            with: { direction: 'download', transferProfile: 'p', sources: ['s'], destination: 'd' },
        };
        expect(jobDescriptor.fromStep(step).continueOnError).toBe(false);
    });

    it('builds a step from a node (export), emitting name/continueOnError only when meaningful', () => {
        const node = {
            id: 'ingest',
            type: 'Job',
            name: 'Ingest cards',
            with: {
                direction: 'upload',
                transferProfile: 'prod',
                sources: ['/vol/a'],
                destination: 'shows/x',
            },
            continueOnError: true,
        };
        const step = jobDescriptor.toStep(node);
        expect(step).toEqual({
            id: 'ingest',
            name: 'Ingest cards',
            type: 'Job',
            with: {
                direction: 'upload',
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
            type: 'Job',
            with: { direction: 'download', transferProfile: 'p', sources: ['s'], destination: 'd' },
            continueOnError: false,
        };
        const step = jobDescriptor.toStep(node);
        expect(step).not.toHaveProperty('name');
        expect(step).not.toHaveProperty('continueOnError');
        expect(step).not.toHaveProperty('dependsOn');
    });

    it('round-trips a step through fromStep then toStep losslessly', () => {
        const step: WorkflowStep = {
            id: 'ingest',
            name: 'Ingest',
            type: 'Job',
            with: {
                direction: 'upload',
                transferProfile: 'prod',
                sources: ['/vol/a', '/vol/b'],
                destination: 'shows/x',
                uploadBasePath: '/vol',
                force: false,
            },
            continueOnError: true,
        };
        expect(jobDescriptor.toStep(jobDescriptor.fromStep(step))).toEqual(step);
    });
});
