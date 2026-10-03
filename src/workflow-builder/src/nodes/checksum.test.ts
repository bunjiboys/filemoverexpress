import { describe, it, expect } from 'vitest';
import { checksumDescriptor } from './checksum';
import type { WorkflowStep } from './descriptor';

// ChecksumStep fields (schemas/workflow/v1.json): required sources; optional
// algorithm (md5|xxhash|xxhash64|xxh3), recursive, writeMhl, mhlOutput,
// failOnMismatch. The writeMhl->mhlOutput requirement is a schema if/then enforced
// at validation; the descriptor passes the payload through unchanged.
describe('checksumDescriptor', () => {
    it('handles the Checksum step type with one in/out port pair', () => {
        expect(checksumDescriptor.type).toBe('Checksum');
        expect(checksumDescriptor.ports).toEqual({ inputs: 1, outputs: 1 });
    });

    it('round-trips a Checksum step losslessly', () => {
        const step: WorkflowStep = {
            id: 'verify',
            name: 'Verify ingest',
            type: 'Checksum',
            with: {
                sources: ['/mnt/ingest'],
                algorithm: 'xxh3',
                recursive: true,
                writeMhl: true,
                mhlOutput: '/mnt/ingest/day.mhl',
                failOnMismatch: true,
            },
            continueOnError: true,
        };
        expect(checksumDescriptor.toStep(checksumDescriptor.fromStep(step))).toEqual(step);
    });

    it('carries the full with payload onto the node', () => {
        const node = checksumDescriptor.fromStep({
            id: 'c',
            type: 'Checksum',
            with: { sources: ['/a'], algorithm: 'md5' },
        });
        expect(node.with).toEqual({ sources: ['/a'], algorithm: 'md5' });
    });
});
