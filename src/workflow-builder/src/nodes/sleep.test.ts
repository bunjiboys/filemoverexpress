import { describe, it, expect } from 'vitest';
import { sleepDescriptor } from './sleep';
import type { WorkflowStep } from './descriptor';

// SleepStep (schemas/workflow/v1.json): required duration (Go duration string).
describe('sleepDescriptor', () => {
    it('handles the Sleep step type with one in/out port pair', () => {
        expect(sleepDescriptor.type).toBe('Sleep');
        expect(sleepDescriptor.ports).toEqual({ inputs: 1, outputs: 1 });
    });

    it('round-trips a Sleep step losslessly', () => {
        const step: WorkflowStep = {
            id: 'settle',
            name: 'Settle',
            type: 'Sleep',
            with: { duration: '30s' },
            continueOnError: false,
        };
        // continueOnError:false is dropped from the serialized step (minimal form).
        const expected: WorkflowStep = {
            id: 'settle',
            name: 'Settle',
            type: 'Sleep',
            with: { duration: '30s' },
        };
        expect(sleepDescriptor.toStep(sleepDescriptor.fromStep(step))).toEqual(expected);
    });

    it('carries the duration payload onto the node', () => {
        const node = sleepDescriptor.fromStep({ id: 's', type: 'Sleep', with: { duration: '5m' } });
        expect(node.with).toEqual({ duration: '5m' });
    });
});
