import { createDescriptor } from './create-descriptor';

// Descriptor for the `InventoryReport` step type (InventoryReportStep payload in
// schemas/workflow/v1.json): maps to inventory.GenerateInventory. Reduced field set
// (transferProfile, outputFormat, pretty, includeChecksums); no `prefix`.
export const inventoryReportDescriptor = createDescriptor('InventoryReport');
