import { STEP_TYPES } from '../schema/loader';
import { PALETTE_DRAG_TYPE } from './node-palette';

// The slice of DataTransfer the drop reader needs. Narrowing to getData keeps the
// function trivially testable without constructing a full DragEvent.
export interface DropDataTransfer {
    getData: (format: string) => string;
}

// Read the step type from a canvas drop's dataTransfer, guarded against the known
// step types (docs sections 4, 5). Returns undefined for an empty or unrecognized
// payload so an unrelated drop (text, a file) never adds a bogus node.
export function readDroppedStepType(dataTransfer: DropDataTransfer): string | undefined {
    const type = dataTransfer.getData(PALETTE_DRAG_TYPE);
    return STEP_TYPES.includes(type) ? type : undefined;
}
