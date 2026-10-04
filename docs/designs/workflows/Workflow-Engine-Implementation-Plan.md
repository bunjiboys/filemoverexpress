# `core/workflow` — Implementation Plan

Status: Plan / awaiting approval. No code written yet. This plans the daemon-side
engine specified in `docs/designs/workflows/Workflow-File-Format.md` (the "New surface area" section):
a new Go package `src/cli/core/workflow/` that parses, validates, schedules, and
executes a workflow document in-process. It is the blocker for the service handlers
(`RunWorkflow`/`ValidateWorkflow`), the CLI command, and the GUI runner.

## Hard constraint: 100% test coverage, or stop and flag

Per the project's discipline (and this task's explicit instruction), **every file in
this package aims for 100% coverage** — lines, functions, branches — built test-first.
Where I believe 100% is **not achievable** for a component, I will **stop and tell you
before writing it**, with the reason, rather than quietly excluding it or padding a
test. Section 7 lists the components I already predict will hit this wall, so there are
no surprises mid-build. The CLI `cli:test` target runs with `-cover`; I will report the
per-file numbers at each phase boundary.

## 1. Scope of this plan

This plan covers the **engine package only** (`src/cli/core/workflow/`): document
types, parser, parameter resolution, validator, DAG scheduler, and the step-executor
registry with the four v1 executors. It does **not** cover:

- The service handlers (`RunWorkflow`/`ValidateWorkflow` in `src/cli/service/`) — a
  separate, later step that calls this package.
- The CLI command (`fme workflow …`) — later.
- The GUI runner — separate surface (`docs/designs/workflows/Workflow-Runner-GUI.md`).

Those are downstream and get their own plans. Keeping this plan to the engine keeps the
first slice reviewable.

## 2. Grounding: the real integration points

Read from the codebase so the plan is accurate, not guessed:

- **Jobs**: `jobmanagertypes.NewJob(jobmanagertypes.JobConfig{Name, Direction,
  TransferProfile, Sources, Destination, Force, UploadBasePath, S3PrefixToTrim})`
  builds a `*Job`; `upload.Uploader(job)` / `download.Downloader(job)` execute it
  (see `service/upload-prefixes.go`, `core/upload/upload.go`, `core/download/download.go`).
  Both `Uploader`/`Downloader` call `jobManager.AddJob` then `UploadJob`/`DownloadJob`,
  reporting via `events.Events`. They are **side-effecting and depend on a live
  job manager + AWS session**.
- **Transfer profiles**: resolved by name via
  `config.LoadConfiguration().GetTransferProfile(name)` → `configtypes.TransferProfile`
  (see `service/generate-inventory-report.go`).
- **Checksums**: `checksums.NewChecksummer(constants.ChecksumAlgorithm)` →
  `FileMoverChecksummer`; MHL via `core/checksums/checksum-manager/mhl-processor`.
- **Inventory**: `inventory.GenerateInventory(inventorytypes.GenerateInventoryInput{
  TransferProfile, OutputFormat, Pretty, IncludeChecksums})` — blocking, side-effecting.
- **Direction enum**: `transfertypes.Upload` / `transfertypes.Download`.
- **Path safety**: the existing guards (the `..`-rejection in `cmd/s3.go`, discovery
  path validators) — to be located precisely and REUSED, not reimplemented.
- **Testing**: Go `testing` + `testify` + `bytedance/mockey` (per tech.md); the repo
  already mocks the transfer layer (`core/transfer-api/mock`). `golangci-lint` config
  caps func length 40 / cyclomatic 25 / 4 args / 3 returns — the design must respect it.

## 3. Package layout (proposed)

```
src/cli/core/workflow/
├── types.go            # WorkflowDocument, Step, ParameterSpec, run/step status enums
├── parse.go            # YAML/JSON -> WorkflowDocument (gopkg.in/yaml, encoding/json)
├── parameters.go       # typed parameter resolution + ${params.*} substitution
├── validate.go         # schema-shape + DAG rules (acyclic, no dangling id, unique id)
├── pathsafety.go       # post-substitution path/key guards (reusing existing guard)
├── dag.go              # topological order + ready/gating computation (pure)
├── run.go              # WorkflowRun + run/step status model, status derivation (pure)
├── store.go            # RunStore interface + bboltRunStore (transition-only, .Batch())
├── reconcile.go        # restart reconciliation (interrupted run -> terminal) (pure rules)
├── engine.go           # scheduler: run the DAG, gate on dependsOn, abort dependents,
│                       #   plus cancel/pause/resume lifecycle + run-event emission
├── registry.go         # StepExecutor interface + registry keyed by step type
├── executor_job.go     # Job -> JobConfig -> upload/download
├── executor_checksum.go
├── executor_sleep.go
├── executor_inventory.go
└── *_test.go           # one per file, test-first
```

Rationale for the split: the **pure** logic (`parse`, `parameters`, `validate`,
`pathsafety`, `dag`, `run` status derivation, `reconcile` rules) is isolated from the
**side-effecting** logic (`engine`, `store`'s bbolt I/O, `executor_*`) so the former
reaches 100% trivially with table tests, and the latter is where the coverage risk
concentrates (section 7). This mirrors the builder's "pure logic extracted out, thin
side-effecting shell" structure.

## 4. Build order (test-first, phased)

Each phase is independently reviewable, green, and (except where section 7 flags
otherwise) at 100% coverage before the next begins.

**Phase A — types + parse (pure).** Document/step/parameter types; YAML→JSON→struct
parse with a canonical-JSON path. Tests: round-trip, malformed YAML, malformed JSON,
unknown-field handling (strict vs lenient per the format doc). Fully testable → 100%.

**Phase B — parameter resolution (pure).** Port the already-specced precedence (user
value > default > empty; required/typed-no-default is an error), `${params.*}`
whole-value vs embedded substitution, type coercion (string/int/float/bool/enum),
constraint checks (pattern/min/max/enum values). This mirrors the builder's
`resolveParameters` logic, now in Go. Table tests cover every type × every outcome →
100%.

**Phase C — validation + DAG rules (pure).** Shape validation, then the three
format-doc rules: acyclic graph (name the cycle), no dangling `dependsOn` id, unique
step ids. Plus path-safety post-substitution. Tests: a valid diamond, a self-loop, a
2-cycle, a dangling id, a duplicate id, a traversal attempt. Pure → 100%.

**Phase D — DAG scheduling (pure core + thin async shell).** `dag.go` computes
topological order and, given a set of completed step ids, the newly-eligible steps and
the transitive dependents to skip on a failure — all **pure functions over the graph**,
100%-testable without running anything. `engine.go` is the thin async driver that calls
a `StepExecutor` per ready step, respecting `maxActiveTransfers`, gating on `dependsOn`,
and aborting transitive dependents on a non-`continueOnError` failure. The driver is
tested with a **fake StepExecutor** (no real transfers) asserting order, concurrency
gating, skip-on-failure, and `continueOnError`. Coverage risk noted in section 7.

**Phase E — registry + executors (side-effecting).** `StepExecutor` interface +
registry keyed by step type. Four executors:
- `Sleep`: blocks for a parsed `time.Duration`, interruptible by `context` cancel.
  **Pure-ish, fully testable** (inject a short duration / a cancelled context) → 100%.
- `Checksum`: drives `checksums.NewChecksummer` over local sources, optional MHL.
  Testable against a temp dir with real small files → should reach 100%.
- `Job`: builds a `JobConfig` and calls `upload.Uploader`/`download.Downloader`.
  **Coverage risk** — section 7.
- `InventoryReport`: calls `inventory.GenerateInventory`. **Coverage risk** — section 7.

**Phase F — run model + status derivation (pure).** `run.go`: the `WorkflowRun` struct,
the run/step status enums, and the pure function that derives run status from its step
statuses (format doc "Run and step status model"). No I/O, no concurrency — a table test
over every step-status combination → 100%. Can land independently of the executors
(Phase E); it only depends on the document/DAG types from A–C.

**Phase G — persistence + restart reconciliation.** Two files:
- `store.go`: the `RunStore` interface and `bboltRunStore` — one `workflow_runs` bucket,
  one serialized record per run id, transition-only writes via `.Batch()` (format doc
  "Persistence"). The bbolt I/O is a thin shell; tests run against a temp bbolt file
  (as the existing `databasetypes` tests do) covering Save/Load/List/Delete and the
  coalescing path. Coverage risk noted in section 7 (bbolt error branches).
- `reconcile.go`: the **pure** reconciliation rules (format doc "Restart reconciliation"):
  given a loaded run's persisted status, return its reconciled status + step fixups.
  PENDING/RUNNING/PAUSED → FAILED(interrupted); terminal → unchanged. A table test over
  every input status → 100%. The engine calls this on startup over `RunStore.List()`.

**Phase H — run lifecycle on the engine (side-effecting).** Extend `engine.go` with
`CancelRun` / `PauseRun(pauseInFlightJobs bool)` / `ResumeRun`, the scheduler gate for
PAUSED, the cascade to jobs (`CancelJob`/`PauseJob`/`ResumeJob` via the same injected
seam the `Job` executor uses), and emission of the run/step lifecycle events
(`WorkflowRunStarted/StatusChange/StepStatusChange/Complete`). Tested with the fake
executor + a fake job-lifecycle seam asserting: cancel skips pending steps and cancels
in-flight jobs; pause gates the scheduler; `pauseInFlightJobs` toggles whether jobs are
paused; resume un-gates and resumes paused jobs; the right events fire on each
transition. Coverage risk (concurrency + the job-seam calls) noted in section 7.

Ordering note: F is pure and can slot in any time after C. G depends on F (it persists the
run record). H depends on D (the scheduler), E (executors to run) and F/G (the state it
mutates and persists). The run store is written **only** on the transitions H emits, which
is what keeps the write rate low per the format doc.

## 5. How the risky executors are made testable

The `Job` and `InventoryReport` executors call side-effecting package functions
(`upload.Uploader`, `download.Downloader`, `inventory.GenerateInventory`) that assume a
live job manager and AWS session. To keep them at 100% without real S3, the plan is to
**inject those calls as function-typed fields on the executor** (a seam), defaulting to
the real functions in production and swapped for fakes in tests:

```go
type jobExecutor struct {
    newJob   func(jobmanagertypes.JobConfig) (*jobmanagertypes.Job, error)
    runUpload   func(*jobmanagertypes.Job)
    runDownload func(*jobmanagertypes.Job)
}
```

The test asserts the executor maps the step's `with` to the right `JobConfig` and
dispatches to the right function — the **mapping** is the logic worth covering; the
actual transfer is upload/download's own tested territory. `bytedance/mockey` (already
a project dep) is the fallback if a seam cannot be cleanly injected.

This is a design seam, not a coverage dodge: the mapping logic is fully exercised, and
only the one-line call into already-tested transfer code is faked.

## 6. What this plan deliberately does NOT do (v1)

- Run state **is persisted** to bbolt (reversing the earlier "deferred" stance): a
  `RunStore` interface with a `bboltRunStore` implementation, transition-only
  write-coalesced writes, and startup reconciliation — all per the format doc's
  "Persistence" and "Restart reconciliation" sections (Phases F–H). The engine depends
  only on the `RunStore` interface, so the planned future swap to SQLite is a new
  implementation + one wiring line, not an engine change. Progress is still **not**
  persisted — it stays an ephemeral `JobProgressEvent`.
- Run-level lifecycle **events are added** (`WorkflowRunStarted` / `WorkflowRunStatusChange`
  / `WorkflowStepStatusChange` / `WorkflowRunComplete`), emitted on state transitions and
  carried over the existing `ListEvents` stream (format doc "Run-level events"). What is
  **not** added is a run-level *progress* event: byte progress still rides the existing
  `JobProgressEvent` tagged with `workflow_run_id`/`workflow_step_id` (the fields already
  on `job.proto`). The run layer deals in transitions, not progress ticks.
- No schema-file validation against `schemas/workflow/v1.json` in Go v1 unless a Go
  JSON-Schema validator is already vendored — see the open question in section 8. The
  structural + DAG validation in Phase C stands on its own regardless.

## 7. Components where 100% may NOT be achievable — flagged UP FRONT

Per your instruction, here is where I predict the wall is, so we decide the approach
before I write them rather than discovering it mid-build:

1. **`executor_job.go` (the real `upload.Uploader`/`download.Downloader` call).** The
   mapping to `JobConfig` and the dispatch choice are 100%-coverable via the injected
   seam (section 5). The **actual call into `Uploader`/`Downloader`** is one line that I
   do not intend to execute for real in a unit test (it needs a job manager singleton +
   AWS session). My plan keeps that line covered by faking the injected function, so I
   expect to **reach 100%** — but if the job-manager singleton (`job_manager.GetInstance()`)
   proves un-fakeable without a heavier harness, this is the first place I will stop and
   flag.
2. **`executor_inventory.go`.** Same shape: the mapping to `GenerateInventoryInput` is
   coverable; the `inventory.GenerateInventory` call is faked via a seam. Same caveat —
   if `GenerateInventory` cannot be injected/mocked cleanly, I stop and flag.
3. **`engine.go` async driver (scheduling + lifecycle).** The pure scheduling decisions
   live in `dag.go` at 100%, and the run status derivation in `run.go` at 100%. The
   driver's goroutine orchestration (channel/`sync.WaitGroup` paths) and the
   cancel/pause/resume lifecycle (Phase H) can have hard-to-hit interleavings; I expect
   100% with a fake executor + fake job-lifecycle seam and deterministic stepping, but
   **concurrency-timing branches are the classic place a line stays uncovered**. If one
   does, I will flag it rather than add a flaky timing test.
4. **`store.go` (`bboltRunStore`).** Save/Load/List/Delete against a temp bbolt file are
   testable at 100% (as the existing `databasetypes` tests show). The residual risk is
   the **bbolt error branches** — a `.Batch()`/marshal failure is awkward to force without
   fault injection. The `RunStore` interface is what lets the engine's own tests use an
   in-memory fake store (so engine coverage never depends on bbolt), and I expect the
   bbolt impl itself to reach 100% via a temp DB plus a marshal-failure seam; if a bbolt
   error path proves unreachable without a fault-injection harness, I stop and flag it.

Everything in Phases A–C and F, the `reconcile.go` rules, plus `Sleep` and `Checksum`, I
expect to reach 100% with ordinary table/temp-dir tests and no caveat.

## 8. Open questions for you (before coding)

1. **Go JSON-Schema validation?** The builder validates against
   `schemas/workflow/v1.json` with ajv. Do we want the daemon to validate against the
   same schema file (needs a Go JSON-Schema lib — is one acceptable to add, or is one
   already vendored?), or rely on Go struct unmarshalling + the Phase C structural/DAG
   checks as the daemon-side authority? The format doc's validator is described in prose,
   not pinned to a schema lib, so either is defensible.
2. **Package name.** `workflow` (import `.../core/workflow`) — confirm that reads well
   against the existing `core/*` siblings.
3. **Phase granularity for commits.** One commit per phase (A–E), or one commit for the
   pure core (A–D) and one for the executors (E)?

## 9. Deliverable of the first coding turn (if approved)

Phase A only: `types.go` + `parse.go` + their tests, green at 100%, `go build` and
`golangci-lint` clean. Small, reviewable, and it establishes the document types the rest
of the package builds on. I would stop there for your review before Phase B.
