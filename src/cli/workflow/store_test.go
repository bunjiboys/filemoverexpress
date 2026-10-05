package workflow

import (
	"path/filepath"
	"testing"
	"time"

	"go.etcd.io/bbolt"
)

// tempStore opens a bboltRunStore backed by a fresh temp-dir database file.
func tempStore(t *testing.T) *bboltRunStore {
	t.Helper()
	dbFile := filepath.Join(t.TempDir(), "workflow-runs.db")
	db, err := bbolt.Open(dbFile, 0o600, &bbolt.Options{Timeout: time.Second})
	if err != nil {
		t.Fatalf("open bbolt: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store, err := NewBboltRunStore(db)
	if err != nil {
		t.Fatalf("NewBboltRunStore: %v", err)
	}
	concrete, ok := store.(*bboltRunStore)
	if !ok {
		t.Fatalf("NewBboltRunStore returned %T, want *bboltRunStore", store)
	}
	return concrete
}

func sampleRun(id string) *WorkflowRun {
	return &WorkflowRun{
		RunID:  id,
		Name:   "nightly",
		Status: RunRunning,
		Steps: []WorkflowStep{
			{StepID: "a", Type: string(StepUpload), Status: StepSucceeded},
			{StepID: "b", Type: string(StepSleep), Status: StepRunning},
		},
		Created: time.Now().UTC().Truncate(time.Second),
	}
}

func TestBboltRunStoreSaveLoad(t *testing.T) {
	store := tempStore(t)
	run := sampleRun("run-1")
	if err := store.Save(run); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := store.Load("run-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.RunID != run.RunID || got.Name != run.Name || got.Status != run.Status {
		t.Errorf("loaded run = %+v, want %+v", got, run)
	}
	if len(got.Steps) != 2 || got.Steps[1].Status != StepRunning {
		t.Errorf("loaded steps = %+v", got.Steps)
	}
}

func TestBboltRunStoreSaveUpserts(t *testing.T) {
	store := tempStore(t)
	run := sampleRun("run-1")
	if err := store.Save(run); err != nil {
		t.Fatal(err)
	}
	run.Status = RunSucceeded
	if err := store.Save(run); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load("run-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != RunSucceeded {
		t.Errorf("status after upsert = %s, want SUCCEEDED", got.Status)
	}
	// Still exactly one record.
	all, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Errorf("List len = %d, want 1 after upsert", len(all))
	}
}

func TestBboltRunStoreLoadMissing(t *testing.T) {
	store := tempStore(t)
	if _, err := store.Load("ghost"); err == nil {
		t.Fatal("expected an error loading a missing run")
	}
}

func TestBboltRunStoreList(t *testing.T) {
	store := tempStore(t)
	if err := store.Save(sampleRun("run-1")); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sampleRun("run-2")); err != nil {
		t.Fatal(err)
	}
	all, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("List len = %d, want 2", len(all))
	}
	ids := map[string]bool{all[0].RunID: true, all[1].RunID: true}
	if !ids["run-1"] || !ids["run-2"] {
		t.Errorf("List ids = %v", ids)
	}
}

func TestBboltRunStoreListEmpty(t *testing.T) {
	store := tempStore(t)
	all, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 0 {
		t.Errorf("List len = %d, want 0", len(all))
	}
}

func TestBboltRunStoreDelete(t *testing.T) {
	store := tempStore(t)
	if err := store.Save(sampleRun("run-1")); err != nil {
		t.Fatal(err)
	}
	if err := store.Delete("run-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := store.Load("run-1"); err == nil {
		t.Error("run should be gone after Delete")
	}
	// Deleting a missing run is a no-op (idempotent).
	if err := store.Delete("run-1"); err != nil {
		t.Errorf("Delete of missing run should be a no-op, got %v", err)
	}
}

func TestNewBboltRunStoreNilDB(t *testing.T) {
	if _, err := NewBboltRunStore(nil); err == nil {
		t.Fatal("expected an error for a nil db")
	}
}

func TestNewBboltRunStoreReadOnlyDB(t *testing.T) {
	// A read-only database cannot create the bucket, so NewBboltRunStore must surface the
	// bucket-create error. Create the file first (read-only open requires it to exist).
	dbFile := filepath.Join(t.TempDir(), "ro.db")
	seed, err := bbolt.Open(dbFile, 0o600, &bbolt.Options{Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if err := seed.Close(); err != nil {
		t.Fatal(err)
	}
	ro, err := bbolt.Open(dbFile, 0o600, &bbolt.Options{Timeout: time.Second, ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ro.Close() })
	if _, err := NewBboltRunStore(ro); err == nil {
		t.Fatal("expected a bucket-create error on a read-only database")
	}
}

func TestBboltRunStoreLoadCorruptRecord(t *testing.T) {
	store := tempStore(t)
	// Write a non-JSON value directly under the bucket, then Load must surface the
	// unmarshal error rather than returning a half-built run.
	err := store.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketWorkflowRuns).Put([]byte("bad"), []byte("{not json"))
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load("bad"); err == nil {
		t.Fatal("expected an unmarshal error for a corrupt record")
	}
	if _, err := store.List(); err == nil {
		t.Fatal("expected List to surface the corrupt record error")
	}
}
