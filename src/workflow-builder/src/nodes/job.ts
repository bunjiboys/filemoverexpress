import { createDescriptor } from './create-descriptor';

// Descriptor for the `Job` step type (maps 1:1 to jobmanagertypes.JobConfig; the
// JobStep payload in schemas/workflow/v1.json). Uses the shared envelope factory:
// the only Job-specific concern is its `with` payload shape, which the schema
// validates. dependsOn is owned by the graph serializer, not the descriptor.
export const jobDescriptor = createDescriptor('Job');
