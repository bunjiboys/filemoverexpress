import type { NodeDescriptor } from './descriptor';
import { jobDescriptor } from './job';
import { checksumDescriptor } from './checksum';
import { sleepDescriptor } from './sleep';
import { inventoryReportDescriptor } from './inventory-report';

// The descriptor registry: the single lookup from a step `type` to its descriptor.
// It is the seam the node palette (which types exist) and the graph serializer (how
// to convert a node of a given type) both consume.
//
// The registry's set of types is kept in lockstep with the schema's step-type enum
// by registry.test.ts, which asserts the keys here equal STEP_TYPES. That test is
// what makes "add a schema step type -> add one descriptor here" a checked contract
// rather than a convention (docs/designs/workflows/Workflow-Builder-App.md sections 2 and 13).
export const DESCRIPTORS: Readonly<Record<string, NodeDescriptor>> = {
    [jobDescriptor.type]: jobDescriptor,
    [checksumDescriptor.type]: checksumDescriptor,
    [sleepDescriptor.type]: sleepDescriptor,
    [inventoryReportDescriptor.type]: inventoryReportDescriptor,
};

// The step types that have a registered descriptor.
export function descriptorTypes(): string[] {
    return Object.keys(DESCRIPTORS);
}

// Whether a step type has a registered descriptor.
export function hasDescriptor(type: string): boolean {
    return Object.prototype.hasOwnProperty.call(DESCRIPTORS, type);
}

// Look up the descriptor for a step type, throwing a clear error for an unknown type
// (which, given the lockstep invariant, means a document carrying a type this build
// does not support).
export function getDescriptor(type: string): NodeDescriptor {
    const descriptor = DESCRIPTORS[type];
    if (descriptor === undefined) {
        throw new Error(`unknown step type: ${type}`);
    }
    return descriptor;
}
