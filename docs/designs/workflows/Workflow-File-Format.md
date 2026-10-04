# Workflow File Format (Design)

Status: Design / proposed. Nothing in this document is implemented yet.

File Mover Express (FME) today moves files one Job at a time. A Job is built from
a single transfer profile, a set of sources, one destination, and one direction.
This works for the interactive GUI workflow but cannot describe a multi-step
pipeline that moves files across several source locations in one declarative
unit, which is what an asset pipeline integration needs.

This document specifies a **Workflow** file format: a versioned, publishable,
step-based description of one or more transfers that FME can validate and
execute as a single run.

## Goals

1. Describe one or more steps, with all required parameters, in a single file. v1
   ships four step types: `Job`, `Checksum`, `Sleep`, and `InventoryReport`.
2. Keep steps **generic**: a step carries a `type` and a payload, so new step
   types can be added later without changing the envelope or breaking existing
   files.
3. Be **publishable**: ship a versioned JSON Schema so third parties can generate
   workflow files with editor validation and autocomplete.
4. Be **versioned**: the format can evolve additively without breaking generators,
   and incompatible files are rejected with a clear message rather than
   half-executed.

## Core principle: everything runs in the daemon

A workflow is submitted as a single, self-contained document, and the daemon
executes the entire thing internally. Every step runs in-process inside the daemon
by calling existing Go packages directly (`upload.Uploader` /
`download.Downloader`, `core/checksums`, `inventory.GenerateInventory`). Parsing,
parameter resolution, validation, DAG scheduling, and step execution all happen
daemon-side.

This is a design constraint, not an incidental detail: a step type is only added if
its work can be done by the daemon in-process. There is no per-step dispatch back to
a client, no external process invocation, and no network hop between steps. The
whole run is one unit of work the daemon owns from submission to completion.

## Non-goals (v1)

- No expression language. Parameter substitution is name lookup only; there is no
  arithmetic, no conditionals, no functions. Pipelines that need computed values
  compute them before passing parameters.
- No per-step retry policy beyond the daemon's existing `retryCount`.
- No scheduling. A workflow is submitted on demand; recurring execution is left to
  the caller (cron, pipeline orchestrator, hot folders).

## Design decisions (settled)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Authored format | YAML accepted as input; JSON is canonical. YAML is parsed to JSON, then validated against the JSON Schema. One schema serves both. |
| 2 | Dependencies | Full DAG via `dependsOn`. Independent steps run concurrently. |
| 3 | Failure semantics | A failed step aborts only its **transitive dependents**. Independent branches continue. The run is marked failed if any step failed and was not marked `continueOnError`. |
| 4 | Parameterization | Scoped typed parameters with `${params.name}` substitution in step `with` values only. No expressions. Fully-resolved (parameter-free) files are a strict subset. |

## File shape

```yaml
# fme.workflow.yaml
apiVersion: fme.dev/workflow/v1      # format identity + version
kind: Workflow
metadata:
  name: nightly-dailies-sync
  description: Pull camera dailies, push proxies to review bucket
  labels:
    show: project-x
    unit: main
spec:
  parameters:                        # optional; see "Parameters"
    - name: day
      type: string
      required: true
    - name: show
      type: string
      default: project-x
    - name: force
      type: bool
      default: false
  defaults:                          # optional; merged into each step's `with`
    transferProfile: prod-us-west-2
    force: ${params.force}
  steps:
    - id: ingest-cards               # stable, unique within the file
      name: Ingest camera cards
      type: Job                      # the discriminator
      with:
        direction: upload
        transferProfile: prod-us-west-2
        sources:
          - /Volumes/CARD_A
          - /Volumes/CARD_B
        destination: "shows/${params.show}/day-${params.day}/camera"
        uploadBasePath: /Volumes
      dependsOn: []
      continueOnError: false

    - id: push-proxies
      name: Push proxies to review
      type: Job
      with:
        direction: upload
        transferProfile: review-bucket
        sources:
          - "/mnt/proxies/day-${params.day}"
        destination: "review/day-${params.day}"
      dependsOn:
        - ingest-cards               # runs only after ingest-cards completes
```

`metadata.name` identifies the workflow; `description` is free text. `labels` is a
**string-to-string map** (both keys and values are strings; a numeric or boolean
tag is written as its string form, for example `priority: "5"`). Labels are
advisory metadata only in v1: they do not affect scheduling, step behavior, or
run status. The string-to-string constraint keeps the published schema
unambiguous for generators and leaves room to add label selectors later as an
additive feature without changing the value type.

## The step envelope

Every step is the same envelope regardless of `type`. Only `with` changes shape.

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | Stable identifier, unique within the file. Referenced by `dependsOn`. This is the design-time step id, not the runtime job id. |
| `name` | no | Human-readable label. For `Job` steps this maps to `Job.Name`. |
| `type` | yes | Discriminator selecting the payload schema and the executor. v1 defines `Job`, `Checksum`, `Sleep`, and `InventoryReport`; the registry is open. |
| `with` | yes | Type-specific payload. Its schema is selected by `type`. |
| `dependsOn` | no | List of step `id`s that must complete before this step is eligible. Empty or absent means eligible immediately. |
| `continueOnError` | no | If true, a failure in this step does not fail the overall run and does not abort steps that do not depend on it. Default false. |

Substitution is forbidden in `type`, `id`, and `dependsOn` so that the DAG shape
and the published schema remain statically analyzable. This is enforced
structurally by the validator, not left to convention.

## The `Job` step payload

The `Job` payload maps 1:1 to the internal `jobmanagertypes.JobConfig`, so there
is no lossy translation between a workflow step and a submitted job.

| `with` field | Maps to `JobConfig` | Notes |
|--------------|---------------------|-------|
| `direction` | `Direction` | Enum: `upload` or `download`. |
| `transferProfile` | resolved to `TransferProfile` by name at runtime | Referenced by name only. See "Portability". |
| `sources` | `Sources` | Non-empty list of strings. |
| `destination` | `Destination` | Required. |
| `uploadBasePath` | `UploadBasePath` | Upload only. |
| `s3PrefixToTrim` | `S3PrefixToTrim` | Download only. |
| `force` | `Force` | Default false. |

### Portability

`transferProfile` is referenced **by name**, never inlined. A transfer profile
holds credentials, region, bucket, and checksum settings, which are machine-local
configuration that must not live in a shareable workflow file. Naming the profile
and resolving it on the executing daemon is what makes a workflow file portable
across machines and safe to publish.

A preflight pass validates that every referenced transfer profile exists on the
daemon before any transfer starts, so a missing profile fails fast rather than
mid-run.

## The `Checksum` step payload

Generates checksums for local paths, optionally writing a Media Hash List (MHL).
FME already has the checksum machinery (`core/checksums` with the `md5`, `xxhash`,
`xxhash64`, `xxh3` algorithms, and `core/checksums/checksum-manager/mhl-processor`
for MHL output); the step executor calls it in-process. There is no standalone
checksum entry point today, so this step adds a new executor that drives the
existing checksum package directly.

```yaml
- id: verify-ingest
  type: Checksum
  with:
    sources:                     # local paths to checksum (required, non-empty)
      - "/mnt/ingest/day-${params.day}"
    algorithm: xxh3              # md5 | xxhash | xxhash64 | xxh3 (default xxh3)
    recursive: true             # descend into directories (default true)
    writeMhl: true              # emit an MHL alongside the sources (default false)
    mhlOutput: "/mnt/ingest/day-${params.day}/day.mhl"   # required when writeMhl
    failOnMismatch: true        # if an MHL exists, verify against it; fail on mismatch (default false)
  dependsOn: [ingest-cards]
```

| `with` field | Meaning |
|--------------|---------|
| `sources` | Non-empty list of local paths. |
| `algorithm` | One of `md5`, `xxhash`, `xxhash64`, `xxh3`. Default `xxh3`. Matches the algorithms in `NewChecksummer`. |
| `recursive` | Descend into directories. Default true. |
| `writeMhl` | Emit a Media Hash List. Default false. |
| `mhlOutput` | Output path for the MHL. Required when `writeMhl` is true; path-safety guards apply post-substitution. |
| `failOnMismatch` | When an MHL already exists for the sources, verify computed hashes against it and fail the step on any mismatch. Default false. |

The step fails if any source is unreadable, or (with `failOnMismatch`) if a
recorded hash does not match. On success it emits a completion event carrying the
per-source hashes and the MHL path when written.

## The `Sleep` step payload

A static wait. Purely synthetic: the executor just blocks for the requested
duration (respecting workflow cancellation). Useful as a gate between steps when an
external system needs settling time, or to pace a pipeline.

```yaml
- id: settle
  type: Sleep
  with:
    duration: 30s               # Go duration string: 30s, 5m, 1h30m (required)
  dependsOn: [push-proxies]
```

| `with` field | Meaning |
|--------------|---------|
| `duration` | A Go `time.ParseDuration` string (for example `30s`, `5m`, `1h30m`). Required. Validated at parse time; a non-parseable or non-positive value is rejected. |

Cancelling the run interrupts a sleeping step immediately rather than waiting out
the remaining duration.

## The `InventoryReport` step payload

Generates an S3 inventory report. The payload mirrors the fields the existing
inventory generator already takes (`inventorytypes.GenerateInventoryInput`), and
the executor calls `inventory.GenerateInventory` directly in-process. No new
transfer machinery is needed.

```yaml
- id: snapshot-review
  type: InventoryReport
  with:
    transferProfile: review-bucket   # resolved by name (required)
    outputFormat: csv                # as accepted by GenerateInventoryInput.OutputFormat
    pretty: false
    includeChecksums: true
  dependsOn: [push-proxies]
```

| `with` field | `GenerateInventoryInput` field | Notes |
|--------------|--------------------------------|-------|
| `transferProfile` | `TransferProfile` | Referenced by name; preflight-validated like `Job`. |
| `outputFormat` | `OutputFormat` | Report format string accepted by the existing generator. |
| `pretty` | `Pretty` | Pretty-print output. Default false. |
| `includeChecksums` | `IncludeChecksums` | Include object checksums. Default false. |

`GenerateInventory` is a blocking call; the executor runs it (in its own goroutine
within the daemon, like any other step) and the step completes when the generator
returns. The step fails if the generator returns an error.

The current generator inventories the whole bucket for the resolved profile; it
does not take a prefix. Scoping a report to a sub-prefix would be an additive
change to `GenerateInventoryInput` and a matching `prefix` field here, so it is
left out of v1 to keep the payload a true 1:1 mirror of what the daemon can do
in-process today.

## Generic typing: adding step types later

v1 ships four executors (`Job`, `Checksum`, `Sleep`, `InventoryReport`). Adding a
further step type (for example `Wait` on an external condition, or `Shell`)
requires only:

1. Registering a new payload schema in the JSON Schema under `$defs`.
2. Registering a new executor implementing the `StepExecutor` interface.

No change to the step envelope, the DAG engine, or existing generators. The engine
dispatches on `type` to the registered executor.

## Versioning

Two layers, because the document contract and individual payloads evolve at
different speeds.

- **Document version** (`apiVersion: fme.dev/workflow/v1`): the whole-document
  contract, meaning the envelope shape, how `type` and `with` relate, and the DAG
  semantics. Bumped only on a breaking structural change. This mirrors the
  `fme.v1` protobuf package convention already used in the repo and gives a stable
  published schema URL per version:
  `https://fme.dev/schemas/workflow/v1.json`.
- **Per-step-type payload version**: a step type may version its own payload with
  an optional `apiVersion` inside `with`, defaulting to the type's current major.
  A breaking change to the `Job` payload bumps only the `Job` payload version
  without disturbing other step types.

Rules enforced by the schema and validator:

- **Additive-only within a major**: new optional fields, new step types, and new
  enum values are minor and non-breaking.
- **Unknown-field policy is explicit**: the validator runs in `strict` mode
  (reject unknown fields, best for CI and generator authors) or `lenient` mode
  (warn and ignore, best for forward compatibility when a newer file reaches an
  older daemon).
- A file whose `apiVersion` major exceeds the daemon's supported range is
  **rejected with a clear message**, never silently half-run. The daemon advertises
  its supported `apiVersion` range so a generator can target it.

## Parameters

A workflow may declare typed, constrained inputs and reference them with
`${params.name}` inside step `with` values.

```yaml
spec:
  parameters:
    - name: day
      type: string          # string | int | float | bool | enum
      required: true
    - name: show
      type: string
      default: project-x
    - name: env
      type: enum
      values: [prod, staging]
      default: prod
```

Rules:

- **Typed and constrained**: `type` is one of `string`, `int`, `float`, `bool`,
  `enum` (see the table below). `required` and `default` are supported on every
  type. Typing is what preserves the "publishable schema" guarantee: the schema
  validates the template, and the validator validates the resolved file.
- **Substitution scope**: `${params.name}` is allowed only inside `with` scalar
  and string values (including inside `spec.defaults`, which is merged into `with`).
  It is forbidden in `type`, `id`, and `dependsOn`.
- **Name lookup only**: `${params.day}` is valid; `${params.day + 1}` and any
  conditional or function call are not.
- **Resolution order**: parameters are resolved first, then `defaults` are merged,
  then each concrete step payload is validated against its type schema.
- **Path safety**: after substitution, path and S3-key values pass the same
  path-safety guards the existing upload path enforces (for example `..` rejection,
  as in `src/cli/cmd/s3.go`), so a parameter value cannot inject a traversal.

### Parameter types

| `type` | Accepts | Type-specific constraint keys | Interpolation / coercion |
|--------|---------|-------------------------------|--------------------------|
| `string` | any string | `pattern` (RE2 regex the value must fully match) | Substituted as-is. |
| `int` | a 64-bit signed integer | `min`, `max` (inclusive bounds) | Rendered as its decimal string (`12` -> `12`). Stays numeric only if it fills a `with` field that is itself numeric. |
| `float` | a decimal number | `min`, `max` (inclusive bounds) | Rendered with its decimal form, no exponent and no trailing-zero padding (`1.5` -> `1.5`). Stays numeric only in a numeric `with` field. |
| `bool` | `true` or `false` | none | Renders `true` / `false` when interpolated into a string; stays a bool in a bool `with` field (for example `force: ${params.force}`). |
| `enum` | one of a declared set of strings | `values` (required, non-empty list of the allowed strings) | Substituted as-is; the resolved value must be a member of `values`. |

Every type also accepts `required` (bool, default false) and `default` (a value of
the parameter's own type). A parameter that is neither `required` nor given a
`default` resolves to empty if the caller omits it; a `required` parameter with no
supplied value is a validation error. Constraints are checked against the resolved
value before any step runs, so an out-of-range `int`, a `pattern` miss, or an
`enum` value outside `values` fails `fme workflow validate` without executing
anything.

Resolving to empty is only meaningful for `string` and `enum`, which can
substitute an empty string. A `bool`, `int`, or `float` parameter used in a typed
`with` position (such as `force: ${params.force}`) has no empty form, so such a
parameter must be either `required` or given a `default`; a validate-time error is
raised if it is neither.

Not in v1, by design, so a generator author knows these are intentional omissions
rather than gaps to work around:

- **No list or object parameter types.** `${params.x}` interpolates one scalar
  into a scalar position; a structured value has no clean textual expansion. A
  list-valued `with` field such as `sources` is authored literally in the step.
- **No `secret` type.** Credentials live in the named `transferProfile`, never in
  a workflow file or its parameters; a `secret` param would defeat the portability
  guarantee.

A workflow that declares no `parameters` and uses no `${params.*}` references is a
fully-resolved file. This is the Option A case (generators emit resolved files)
expressed as a strict subset of the same format.

## Execution model

`dependsOn` forms a DAG. The engine:

1. Resolves parameters and merges `defaults` into each `with`.
2. Validates the resolved document (profiles exist, DAG is acyclic, ids unique).
3. Topologically sorts and runs independent steps concurrently, respecting the
   existing `maxActiveTransfers` limit.
4. Gates each step on completion of its `dependsOn` steps.

### DAG validation rules

Before any step runs, the validator rejects a structurally invalid graph so a
malformed workflow fails fast at submit time rather than part way through a run.
Two rules govern `dependsOn`, and both operate on the pre-substitution document
because `dependsOn` is never templated:

- **No dangling dependency ids.** Every id listed in a step's `dependsOn` must
  match the `id` of another step in the same document. A reference to an id that
  does not exist is a validation error naming the offending step and the unknown
  id. This catches typos and references to steps that were removed.
- **Acyclic graph.** The dependency edges must form a directed acyclic graph. A
  cycle (a step that transitively depends on itself, including a step that lists
  its own id) is a validation error that names the cycle's members, since a cycle
  has no valid topological order and would deadlock the scheduler.

A third rule, already noted under Schema, pairs with these: step `id`s must be
**unique within the document**, because `dependsOn` resolves by id and a duplicate
id would make an edge ambiguous. All three are enforced by the validator rather
than the JSON Schema, which cannot express cross-item reference integrity,
acyclicity, or uniqueness. `fme workflow validate` reports every such error
without executing anything.

### Fan-out and fan-in

Because `dependsOn` is a list and the engine runs independent steps concurrently,
a single step can fan out into several branches, and several branches can fan back
in on one step. The classic shape is a diamond: one step forks into parallel
branches that later converge.

```yaml
steps:
  - id: A
    type: Job
    with: { ... }
    # dependsOn absent -> eligible immediately

  - id: B
    type: Job
    with: { ... }
    dependsOn: [A]

  - id: C                 # fork branch 1
    type: Job
    with: { ... }
    dependsOn: [B]

  - id: D                 # fork branch 2
    type: Job
    with: { ... }
    dependsOn: [B]

  - id: E                 # join: waits for BOTH branches
    type: Checksum
    with: { ... }
    dependsOn: [C, D]
```

This encodes `A -> B`, `B -> C`, `B -> D`, `C -> E`, `D -> E`:

- **Fan-out at B.** When `B` completes, `C` and `D` both become eligible (both
  list only `B`), and the engine runs them concurrently, bounded by the existing
  `maxActiveTransfers` limit. A step having more than one dependent is all a fork
  requires; no special construct is needed.
- **Fan-in at E.** `E` lists `[C, D]`, so it is eligible only after **every** id
  in its `dependsOn` has completed. A multi-entry `dependsOn` is the join. `E`
  does not start until both branches finish.

Failure semantics follow decision 3 and are worth tracing on this diamond:

- If `C` fails without `continueOnError`, `E` is a transitive dependent of `C`, so
  `E` is skipped; `D` is not a dependent of `C`, so `D` still runs to completion.
  The run is marked failed.
- If `C` is marked `continueOnError: true`, its failure neither skips `E` nor
  fails the run; `E` runs once both `C` and `D` have finished.

Deeper graphs compose the same way: any step may have multiple dependents (wider
fan-out) and any step may depend on multiple predecessors (wider fan-in), as long
as the whole graph stays acyclic per the validation rules above.

Steps dispatch on `type` to their executor:

- `Job` becomes `JobConfig -> NewJob -> upload.Uploader` / `download.Downloader`,
  reusing the existing job machinery unchanged.
- `Checksum` runs `core/checksums` over the local sources, optionally writing an
  MHL via `mhl-processor`.
- `Sleep` blocks for `duration`, interruptible by run cancellation.
- `InventoryReport` calls `inventory.GenerateInventory` in-process and completes
  when the generator returns.

The workflow layer sits entirely above the current transfer engine, which is the
lowest-risk integration point.

Failure handling (decision 3): when a step fails and is not `continueOnError`, the
engine marks that step's **transitive dependents** as skipped and continues
executing any steps that do not depend on the failed step. The run's final status
is failed if any step failed without `continueOnError`.

## Run lifecycle, state management, and persistence

A submitted workflow becomes a **`WorkflowRun`**: the live, stateful object the daemon
owns from acceptance to a terminal state. Everything in this section is about that
run-level state — distinct from the per-job state the job manager already tracks. A run
*owns* the jobs its `Job` steps create (linked by `workflow_run_id`); run state is a
layer **above** job state, not a replacement for it.

### Run and step status model

A run and each of its steps carry a status. Step status is the finer-grained truth; run
status is derived from the steps.

**Step status:**

| Status | Meaning |
|--------|---------|
| `PENDING` | Declared, not yet eligible (a `dependsOn` is unmet). |
| `RUNNING` | Eligible and executing (its executor is active). |
| `SUCCEEDED` | Completed without error. |
| `FAILED` | The executor returned an error. |
| `SKIPPED` | A transitive dependency failed (decision 3), or the run was cancelled before this step started. |

**Run status:**

| Status | Meaning | Derived from |
|--------|---------|--------------|
| `PENDING` | Accepted, validated, not yet started scheduling. | initial |
| `RUNNING` | At least one step is RUNNING or still PENDING-and-reachable. | steps |
| `PAUSED` | The user paused the run; the scheduler is gated (see below). | explicit |
| `SUCCEEDED` | Every step reached SUCCEEDED (or SKIPPED under `continueOnError`). | steps |
| `FAILED` | At least one step FAILED without `continueOnError`; the run finished with dependents skipped. | steps |
| `CANCELLED` | The user cancelled the run before it reached a terminal state. | explicit |

`SUCCEEDED`, `FAILED`, and `CANCELLED` are **terminal**. A run status is recomputed from
its step statuses on every step transition; `PAUSED` and `CANCELLED` are the two the user
sets directly, everything else is derived.

### Lifecycle operations

Three user operations act on a whole run and **cascade** to its jobs. All resolve the run
by its run id and are no-ops (idempotent) once the run is terminal.

- **Cancel** (`CancelWorkflowRun`): mark the run `CANCELLED`. The scheduler stops
  launching new steps; every not-yet-started step becomes `SKIPPED`; every in-flight
  `Job` step's job is cancelled via the existing `CancelJob` path. In-flight non-job
  steps (`Sleep`, `Checksum`, `InventoryReport`) are interrupted via their executor's
  `context` cancellation.
- **Pause** (`PauseWorkflowRun`): mark the run `PAUSED` and **gate the scheduler** so no
  new steps start. Whether in-flight work is also paused is a **user choice** (settled
  decision): the request carries a `pause_in_flight_jobs` flag.
  - `pause_in_flight_jobs = false` (default): only the scheduler is gated. Steps already
    running finish normally; nothing new starts. Lowest-risk, matches "stop starting more".
  - `pause_in_flight_jobs = true`: additionally pause each in-flight `Job` step's job via
    the existing `PauseJob` path, so running transfers suspend too. Matches the intuitive
    "pause everything" button. Non-job in-flight steps (`Sleep`/`Checksum`/`InventoryReport`)
    have no pause primitive; they run to completion either way, and this is documented so
    the user is not surprised that a sleeping step keeps sleeping.
- **Resume** (`ResumeWorkflowRun`): from `PAUSED`, un-gate the scheduler (eligible steps
  start again) and resume any jobs that were paused by a `pause_in_flight_jobs` pause (via
  `ResumeJob`). The run returns to `RUNNING`.

**List** (`ListWorkflowRuns`): returns the run-level records — run id, name, overall
status, per-step status rollup, and timestamps — for runs the daemon currently holds.
Job-level detail stays on the existing `ListJobs`; the GUI joins the two by
`workflow_run_id`.

### Run-level events

A run emits its own lifecycle events over the existing event stream (`ListEvents`), so a
client observes run progress directly rather than inferring it from N job events. These
are **state transitions**, not progress ticks:

- `WorkflowRunStartedEvent` — run accepted and scheduling began.
- `WorkflowRunStatusChangeEvent` — run status changed (e.g. RUNNING→PAUSED, →CANCELLED,
  →terminal).
- `WorkflowStepStatusChangeEvent` — a step changed status (PENDING→RUNNING→SUCCEEDED/…),
  carrying the run id and step id.
- `WorkflowRunCompleteEvent` — run reached a terminal state (SUCCEEDED/FAILED/CANCELLED).

Byte-level progress is **not** a run event: it continues to ride the existing
`JobProgressEvent`, tagged with `workflow_run_id`/`workflow_step_id`. The run layer deals
in state transitions only — which is exactly what makes its write rate low (next section).

### Persistence: transition-only, write-coalesced, behind a store interface

Run state is **persisted to the embedded bbolt store** so runs survive a daemon restart,
with three deliberate constraints that keep bbolt's single-writer contention a non-issue
and keep a future SQLite migration cheap.

**1. Transition-only writes — never progress.** The store is written **only on a run or
step status transition** (the events above). It is **never** written for byte progress,
which stays an ephemeral event. A workflow of N steps produces on the order of a few
transitions per step over the whole run (tens of writes total), not multiple writes per
second. This is the single most important rule: it is why bbolt is viable here, where it
would not be for a progress firehose.

**2. Write-coalescing.** Transition writes use bbolt's `.Batch()` (as the existing
`pruneTransferRecords` does), so concurrent step transitions in a fan-out coalesce into
one transaction rather than contending on the global write lock. One bucket
(`workflow_runs`), keyed by run id, value is the serialized run record (run + step
statuses + timestamps). A whole run is one key, rewritten on each of its transitions — a
small value, infrequently.

**3. A store interface, bbolt behind it, SQLite-ready.** The engine never calls bbolt
directly. It depends on a narrow interface:

```go
type RunStore interface {
    Save(run *WorkflowRun) error         // upsert the whole run record (one key)
    Load(runID string) (*WorkflowRun, error)
    List() ([]*WorkflowRun, error)
    Delete(runID string) error
}
```

The v1 implementation is `bboltRunStore` writing the `workflow_runs` bucket with
`.Batch()`. Because the engine only sees `RunStore`, **replacing bbolt with SQLite later
is a new implementation of this interface plus a one-line wiring change** — no engine
code moves. To keep that migration genuinely cheap, the record is stored as a
**self-contained serialized value keyed by run id** (not spread across bbolt-specific
sub-buckets or sequence keys), so the same shape maps directly to a SQLite row
(`run_id` primary key, a status column or two, a serialized-detail column). The
`Save`-whole-record-per-transition model also maps cleanly to a SQLite `UPSERT`.

> **Note on consistency with jobs.** Jobs themselves are currently in-memory only (the
> job manager holds them in a map; they are lost on restart). Persisting run state while
> job state is ephemeral means that after a restart a reloaded run references jobs that no
> longer exist — which the reconciliation rules below handle explicitly. When jobs gain
> their own persistence later, run reconciliation can become richer (re-attach to a
> resumed job rather than mark it interrupted).

### Restart reconciliation

On daemon start, the engine loads all runs from the `RunStore` and reconciles each,
because a run persisted as `RUNNING` or `PAUSED` was **interrupted** by the shutdown — its
in-flight jobs did not survive (jobs are in-memory today), so the run cannot simply
"continue". Reconciliation is deterministic and runs before the daemon serves requests:

| Persisted run status | Reconciled to | Rationale |
|----------------------|---------------|-----------|
| `PENDING` | `FAILED` (reason: interrupted before start) | It never began; its jobs do not exist. Marked terminal so it is not silently stuck. |
| `RUNNING` | `FAILED` (reason: interrupted by restart) | Its in-flight jobs are gone (job state was in-memory). The run cannot resume a transfer that no longer exists. |
| `PAUSED` | `FAILED` (reason: interrupted by restart) | Same — the paused jobs did not survive the restart. |
| `SUCCEEDED` / `FAILED` / `CANCELLED` | unchanged | Terminal; just reloaded for `ListWorkflowRuns` history. |

For a run reconciled to `FAILED`, each of its non-terminal steps is marked `SKIPPED` (or
`FAILED` for the step that was `RUNNING`), and a `WorkflowRunCompleteEvent` is **not**
re-emitted (the event stream is per-session; a reload is not a live completion). The run's
record is rewritten once with the reconciled status so the store is consistent.

This "interrupted ⇒ terminal, never auto-resume" rule is intentionally conservative: a
workflow can perform large or destructive transfers, so silently resuming half a run
across a restart (with no surviving job state to resume *from*) would be unsafe. The user
sees the run ended as interrupted and can resubmit. When jobs themselves become durable in
a future change, this table is the natural place to add a `RUNNING ⇒ resume` path, gated
on the jobs actually having survived.

## New surface area (sketch, not built)

Per the core principle, all parsing, validation, scheduling, and step execution
live in the daemon. The new code is a daemon-side package plus a CLI entry point to
submit a document; progress is observed over the existing event stream, so steps
emit the current `JobProgressEvent` / `JobCompleteEvent` tagged with the workflow
run id and step id.

Concretely, this run/step tagging is carried on the runtime `Job` and its creation
event rather than invented per workflow: `fme.v1.Job` and `fme.v1.JobCreateEvent`
(see `src/protobuf/fme/v1/job.proto`) each carry optional `workflow_run_id` and
`workflow_step_id` fields. The daemon's workflow engine populates them when it
creates a job as a step of a run; they are **empty** for a standalone job submitted
outside a workflow, and they are **not** part of the `Job` step's `with` / the
internal `JobConfig` (the step is in the workflow by construction, so provenance is
engine-populated, never author-supplied). `workflow_step_id` is the design-time step
`id`, distinct from the runtime `job_id`.

### CLI

```
fme workflow run <file> [--param k=v ...] [--params-file p.yaml]
fme workflow validate <file> [--param k=v ...] [--strict]
fme workflow status <run-id>
fme workflow list
```

`run` hands the whole document to the daemon, which executes it. `validate` is
local (schema + reference checks); on a parameterized file it requires `--param` /
`--params-file` to validate concretely, plus a template-only lint that checks every
`${params.x}` reference resolves to a declared parameter.

### Core package

A new `src/cli/core/workflow/` package, entirely daemon-side:

- `parser` + `validator`: YAML/JSON parse, parameter resolution, schema validation,
  DAG acyclicity and id-uniqueness checks, path-safety post-substitution.
- `engine`: topological scheduling, dependency gating, transitive-dependent abort.
- `registry`: `StepExecutor` interface and the v1 executors - `Job` (builds a
  `JobConfig` and calls the existing uploader/downloader), `Checksum`, `Sleep`,
  and `InventoryReport` - each calling its backing Go package directly, in-process.

### Schema

`src/protobuf`-adjacent `schemas/workflow/v1.json` (JSON Schema draft 2020-12),
generated from and kept in lockstep with the Go types, published to a stable URL.
Structure: envelope + `spec.steps` array; `$defs` per step type (`JobStep`,
`ChecksumStep`, `SleepStep`, `InventoryReportStep`); discriminator via `allOf` +
`if (type == "<T>") then (with matches <T>Step)` for each type; enums and
constraints for `direction`, checksum `algorithm`, non-empty `sources`, `duration`
format, parameter `type` (`string` | `int` | `float` | `bool` | `enum`) with the
per-type constraint keys from the Parameters table, required fields, and
`metadata.labels` as a string-to-string map
(`"additionalProperties": {"type": "string"}`). Cross-item `id` uniqueness is
enforced by the validator, since JSON Schema alone cannot express it.

Authors reference the schema for editor validation:

```yaml
# yaml-language-server: $schema=https://fme.dev/schemas/workflow/v1.json
```

## Open items for implementation

- Exact `WorkflowRun` persistence (in-memory for v1, matching current job state, vs
  durable store).
- Whether `fme workflow list` surfaces historical runs or only in-flight ones,
  consistent with how `ListJobs` behaves today.
- GUI affordance (import/run a workflow file) is out of scope for the first CLI +
  daemon implementation. Its design is specified separately in
  `docs/designs/workflows/Workflow-Runner-GUI.md` (open an authored workflow, prompt for parameters,
  submit to the daemon).
