import { createDescriptor } from './create-descriptor';

// Descriptor for the `Sleep` step type (SleepStep payload in
// schemas/workflow/v1.json): a static, cancellable wait with a Go duration string.
export const sleepDescriptor = createDescriptor('Sleep');
