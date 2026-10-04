package service

import (
	"os"
	"os/user"
	"path"
	"sync"
	"time"

	"go.etcd.io/bbolt"

	"github.com/awslabs/filemoverexpress/config"
	"github.com/awslabs/filemoverexpress/constants"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
	"github.com/awslabs/filemoverexpress/workflow"
)

const (
	workflowRunsDBFilename = "workflow-runs.db"
	workflowRunsDBPerm     = 0o600
	workflowRunsDBTimeout  = 5 * time.Second
)

var (
	workflowMgr     *workflow.WorkflowManager
	workflowMgrOnce sync.Once
	workflowMgrErr  error
)

// workflowManager returns the lazily-initialized daemon workflow manager, backed by a
// dedicated bbolt run store, the default step-executor registry, the configured transfer
// concurrency, and a config-backed transfer-profile existence check. The one-time init
// error (opening the store) is returned so a handler can surface it rather than panicking.
func workflowManager() (*workflow.WorkflowManager, error) {
	workflowMgrOnce.Do(func() {
		store, err := openWorkflowRunStore()
		if err != nil {
			workflowMgrErr = err
			return
		}
		cfg := config.LoadConfiguration()
		maxActive := int(config.EffectiveMaxActiveTransfers(cfg))
		workflowMgr = workflow.NewWorkflowManager(
			store,
			workflow.NewDefaultRegistry(),
			maxActive,
			transferProfileExists,
		)
	})
	return workflowMgr, workflowMgrErr
}

// openWorkflowRunStore opens the dedicated bbolt database for workflow run records, under
// the same config directory the main database uses.
func openWorkflowRunStore() (workflow.RunStore, error) {
	dbDir, exists := os.LookupEnv("FME_CONFIG_DIR")
	if !exists {
		usr, err := user.Current()
		if err != nil {
			return nil, err
		}
		dbDir = path.Join(usr.HomeDir, constants.DefaultAppDir)
	}
	db, err := bbolt.Open(path.Join(dbDir, workflowRunsDBFilename), workflowRunsDBPerm, &bbolt.Options{Timeout: workflowRunsDBTimeout})
	if err != nil {
		return nil, err
	}
	return workflow.NewBboltRunStore(db)
}

// transferProfileExists reports whether a transfer profile of the given name is configured
// on this daemon, used for the workflow preflight check.
func transferProfileExists(name string) bool {
	_, err := config.LoadConfiguration().GetTransferProfile(name)
	return err == nil
}

// workflowFormat maps the proto WorkflowFormat to the engine's Format, defaulting an
// unspecified value to YAML (the accepted authoring form).
func workflowFormat(f fmev1.WorkflowFormat) workflow.Format {
	if f == fmev1.WorkflowFormat_WORKFLOW_FORMAT_JSON {
		return workflow.FormatJSON
	}
	return workflow.FormatYAML
}

// workflowParams converts the repeated WorkflowParamValue messages to the name->value map
// the engine resolves against. A later duplicate name overrides an earlier one.
func workflowParams(values []*fmev1.WorkflowParamValue) map[string]string {
	out := make(map[string]string, len(values))
	for _, v := range values {
		out[v.GetName()] = v.GetValue()
	}
	return out
}

// toProtoValidationErrors maps engine ValidationErrors to the proto message the GUI routes.
func toProtoValidationErrors(errs []workflow.ValidationError) []*fmev1.WorkflowValidationError {
	out := make([]*fmev1.WorkflowValidationError, 0, len(errs))
	for i := range errs {
		out = append(out, &fmev1.WorkflowValidationError{
			Kind:      toProtoValidationErrorKind(errs[i].Kind),
			Parameter: errs[i].Parameter,
			StepId:    errs[i].StepID,
			Message:   errs[i].Message,
		})
	}
	return out
}

// toProtoValidationErrorKind maps an engine ValidationErrorKind to its proto enum value.
func toProtoValidationErrorKind(kind workflow.ValidationErrorKind) fmev1.WorkflowValidationErrorKind {
	switch kind {
	case workflow.KindParameter:
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_PARAMETER
	case workflow.KindSchema:
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_SCHEMA
	case workflow.KindGraph:
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_GRAPH
	case workflow.KindProfile:
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_PROFILE
	case workflow.KindVersion:
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_VERSION
	default:
		// COVERAGE: justified-unreachable defensive branch. kind is always one of the five
		// ValidationErrorKind constants produced by workflow.Validate; no other value
		// reaches here. Kept so a future kind maps to UNSPECIFIED rather than silently
		// mismatching. See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_UNSPECIFIED
	}
}
