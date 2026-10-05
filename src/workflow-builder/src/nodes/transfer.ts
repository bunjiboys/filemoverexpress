import { createDescriptor } from './create-descriptor';

// Descriptors for the transfer step types. Each maps 1:1 to jobmanagertypes.JobConfig
// (the UploadStep / DownloadStep payloads in schemas/workflow/v1.json); the transfer
// direction is the step type, not a `with` field. Both use the shared envelope factory:
// the only type-specific concern is the `with` payload shape, which the schema validates.
// dependsOn is owned by the graph serializer, not the descriptor.
export const uploadDescriptor = createDescriptor('Upload');
export const downloadDescriptor = createDescriptor('Download');
