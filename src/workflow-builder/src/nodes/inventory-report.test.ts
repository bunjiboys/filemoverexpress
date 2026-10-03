import { describe, it, expect } from 'vitest';
import { inventoryReportDescriptor } from './inventory-report';
import type { WorkflowStep } from './descriptor';

// InventoryReportStep (schemas/workflow/v1.json): required transferProfile; optional
// outputFormat, pretty, includeChecksums. No `prefix` field (the generator
// inventories the whole bucket; prefix is a deferred additive change).
describe('inventoryReportDescriptor', () => {
    it('handles the InventoryReport step type with one in/out port pair', () => {
        expect(inventoryReportDescriptor.type).toBe('InventoryReport');
        expect(inventoryReportDescriptor.ports).toEqual({ inputs: 1, outputs: 1 });
    });

    it('round-trips an InventoryReport step losslessly', () => {
        const step: WorkflowStep = {
            id: 'snapshot',
            name: 'Snapshot review',
            type: 'InventoryReport',
            with: {
                transferProfile: 'review-bucket',
                outputFormat: 'csv',
                pretty: false,
                includeChecksums: true,
            },
            continueOnError: true,
        };
        expect(inventoryReportDescriptor.toStep(inventoryReportDescriptor.fromStep(step))).toEqual(step);
    });

    it('carries the inventory payload onto the node', () => {
        const node = inventoryReportDescriptor.fromStep({
            id: 'i',
            type: 'InventoryReport',
            with: { transferProfile: 'p' },
        });
        expect(node.with).toEqual({ transferProfile: 'p' });
    });
});
