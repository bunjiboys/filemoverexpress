import { createDescriptor } from './create-descriptor';

// Descriptor for the `Checksum` step type (core/checksums; ChecksumStep payload in
// schemas/workflow/v1.json). The writeMhl->mhlOutput requirement is a schema
// if/then enforced at validation, not by the descriptor.
export const checksumDescriptor = createDescriptor('Checksum');
