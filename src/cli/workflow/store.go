package workflow

import (
	"encoding/json"
	"errors"
	"fmt"

	"go.etcd.io/bbolt"
)

// bucketWorkflowRuns is the single bbolt bucket holding run records, one self-contained
// serialized value per run id (format doc "Persistence"). A whole run is one key,
// rewritten on each of its transitions.
var bucketWorkflowRuns = []byte("workflow_runs")

type (
	// RunStore persists workflow run records. The engine depends only on this interface,
	// so swapping bbolt for SQLite later is a new implementation plus one wiring line, no
	// engine change (format doc "Persistence: ... behind a store interface"). Save upserts
	// the whole record for one run id.
	RunStore interface {
		Save(run *WorkflowRun) error
		Load(runID string) (*WorkflowRun, error)
		List() ([]*WorkflowRun, error)
		Delete(runID string) error
	}

	// bboltRunStore is the v1 RunStore, writing the workflow_runs bucket with coalesced
	// transition writes via bbolt.Batch (format doc "Write-coalescing"). It is given an
	// already-open *bbolt.DB so the daemon owns the file's lifecycle and tests use a temp
	// database.
	bboltRunStore struct {
		db *bbolt.DB
	}
)

// NewBboltRunStore wraps an open bbolt database as a RunStore, creating the workflow_runs
// bucket if needed. A nil database is a programming error.
func NewBboltRunStore(db *bbolt.DB) (RunStore, error) {
	if db == nil {
		return nil, errors.New("workflow: bbolt run store requires a non-nil database")
	}
	err := db.Update(func(tx *bbolt.Tx) error {
		_, bucketErr := tx.CreateBucketIfNotExists(bucketWorkflowRuns)
		return bucketErr
	})
	if err != nil {
		return nil, fmt.Errorf("workflow: creating run bucket: %w", err)
	}
	return &bboltRunStore{db: db}, nil
}

// Save upserts the whole run record under its run id. It uses Batch so concurrent step
// transitions in a fan-out coalesce into one transaction rather than contending on the
// global write lock (format doc "Write-coalescing").
func (s *bboltRunStore) Save(run *WorkflowRun) error {
	data, err := json.Marshal(run)
	if err != nil {
		// COVERAGE: justified-unreachable defensive branch. WorkflowRun is composed of
		// strings, enums, time.Time and a slice of the same; json.Marshal never fails to
		// encode it. Kept as a defensive error rather than ignored; not covered because no
		// WorkflowRun value is un-marshalable. See the implementation plan section 7.
		return fmt.Errorf("workflow: marshaling run %s: %w", run.RunID, err)
	}
	return s.db.Batch(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketWorkflowRuns).Put([]byte(run.RunID), data)
	})
}

// Load returns the run with the given id, or an error if it is absent or its stored record
// cannot be decoded.
func (s *bboltRunStore) Load(runID string) (*WorkflowRun, error) {
	var run *WorkflowRun
	err := s.db.View(func(tx *bbolt.Tx) error {
		raw := tx.Bucket(bucketWorkflowRuns).Get([]byte(runID))
		if raw == nil {
			return fmt.Errorf("workflow: no run with id %s", runID)
		}
		decoded, decodeErr := decodeRun(raw)
		if decodeErr != nil {
			return decodeErr
		}
		run = decoded
		return nil
	})
	if err != nil {
		return nil, err
	}
	return run, nil
}

// List returns every stored run record. A record that cannot be decoded aborts the list
// with the decode error rather than silently dropping it.
func (s *bboltRunStore) List() ([]*WorkflowRun, error) {
	var runs []*WorkflowRun
	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketWorkflowRuns).ForEach(func(_, raw []byte) error {
			run, decodeErr := decodeRun(raw)
			if decodeErr != nil {
				return decodeErr
			}
			runs = append(runs, run)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return runs, nil
}

// Delete removes a run record by id. Deleting an absent id is a no-op (bbolt Delete does
// not error on a missing key), matching the idempotent store contract.
func (s *bboltRunStore) Delete(runID string) error {
	return s.db.Batch(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketWorkflowRuns).Delete([]byte(runID))
	})
}

// decodeRun unmarshals one stored record into a WorkflowRun.
func decodeRun(raw []byte) (*WorkflowRun, error) {
	var run WorkflowRun
	if err := json.Unmarshal(raw, &run); err != nil {
		return nil, fmt.Errorf("workflow: decoding run record: %w", err)
	}
	return &run, nil
}
