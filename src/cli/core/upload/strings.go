package upload

//revive:disable:line-length-limit
const (
	strFailedIncreasingMaxOpenFiles = "failed to increase the max open file limit: %s"
	strFailedEstablishingAwsSession = "failed to establish a session to AWS: %w"
	strBasePathNotAbsolute          = "base path must be absolute: got %s"
	strErrorCreatingJob             = "error creating job: %s"
)
