# Workflow Runner (GUI) — Design

Status: Design / proposed. Nothing in this document is implemented yet. It is a
companion to `docs/designs/workflows/Workflow-File-Format.md` (the file format and its daemon-side
execution engine) and to `docs/designs/workflows/Workflow-Builder-App.md` (the standalone, offline
*builder* that produces workflow files). This doc specifies the third surface: the
in-app **runner** that opens a finished workflow file, prompts for its parameters, and
hands it to the daemon to execute.

## 1. What this is

A surface inside the **main File Mover Express GUI** (the Angular app that talks to the
daemon over ConnectRPC) that lets a user **run a workflow that was authored
elsewhere**. The user:

1. Opens an external `fme.workflow.yaml` / `.json` file from within the app.
2. Is **prompted to fill in the workflow's declared parameters** — one field per
   `spec.parameters` entry, typed and validated from the file. A parameter's `default`
   (if the file sets one) is pre-filled and **editable**; the user can override it. A
   `required` parameter with no value blocks the run.
3. Submits the file plus the collected parameter values to the daemon, which resolves
   `${params.*}`, validates, and executes the run.
4. Watches progress through the GUI's existing job/event surface.

This is the "GUI affordance (import/run a workflow file)" that
`docs/designs/workflows/Workflow-Builder-App.md` lists as out of scope for the builder's first phase. It
is specified here as its own surface because it belongs to a different application
with a different dependency surface (daemon-connected) than the offline builder.

### Not a builder, not an executor

The runner neither authors workflows nor executes them itself:

- **Authoring** is the builder's job (or any third-party generator). The runner opens a
  finished file; it does not add, wire, or edit steps. It may show a read-only preview
  of the graph (section 8), but editing a workflow is explicitly out of scope.
- **Execution** is the daemon's job. The format's core principle is that *the daemon
  owns the run end to end*: parsing, parameter resolution, validation, DAG scheduling,
  and step execution all happen daemon-side. The runner is a thin client that collects
  inputs and submits them. See section 4.

## 2. Relationship to the file format and its parameters

The format (`docs/designs/workflows/Workflow-File-Format.md`) already defines everything the prompt needs.
The runner is a strict consumer of it:

| Format concept | Runner use |
|----------------|------------|
| `spec.parameters[]` | The set of fields the prompt renders. Each entry's `type`, `required`, `default`, and constraints drive one form field. |
| parameter `type` (`string`/`int`/`float`/`bool`/`enum`) | The control kind and client-side validation (see section 5). |
| parameter `default` | The field's pre-filled, **overridable** initial value. |
| parameter `required` | A field the user must supply; blocks submit when empty. |
| parameter constraints (`pattern`, `min`/`max`, `values`) | Client-side pre-flight validation mirroring the schema. |
| `${params.*}` references in `with` | Resolved by the **daemon**, never by the runner. |
| `spec.defaults` | **Not prompted.** See the critical distinction below. |

### `parameters` vs `defaults` — do not conflate them

The format has two separate things whose names invite confusion, and the runner must
keep them apart:

- **`spec.parameters`** are the workflow's declared **inputs**. These — and only these —
  are what the runner prompts for. A parameter's `default` is the pre-filled starting
  value for its prompt field.
- **`spec.defaults`** is a block of **step-field defaults** merged into every step's
  `with` by the engine. It is an internal authoring convenience, not a user input. The
  runner does **not** prompt for `spec.defaults` and does not surface it as editable.

A `${params.force}` reference inside `spec.defaults` is still a *parameter* reference, so
the parameter `force` is prompted (via `spec.parameters`); the `defaults` block that
*uses* it is not itself a prompt source.

## 3. The parameter prompt

Opening a workflow with one or more `spec.parameters` presents a **parameter form** before
the run can start. One field per declared parameter, in declaration order.

A workflow that declares **no** `parameters` (a fully-resolved file, which the format
calls the Option A subset) skips the prompt entirely and goes straight to the run
confirmation (section 6).

### Field composition per parameter

| Parameter `type` | GUI control | Initial value | Client validation |
|------------------|-------------|---------------|-------------------|
| `string` | text input | `default` if set, else empty | `pattern` (full-match RE2) when present |
| `int` | numeric input (integer step) | `default` if set | integer; `min`/`max` inclusive bounds when present |
| `float` | numeric input | `default` if set | number; `min`/`max` inclusive bounds when present |
| `bool` | toggle / checkbox | `default` if set, else unset | none |
| `enum` | select (dropdown) | `default` if set, else unselected | value must be one of `values` |
| `string_array` | multi-chip input with a **Browse** button (opens the File Browser for multi-select); each selected path is a removable chip | `default` array if set, else empty | `pattern` (full-match RE2) applied to **every** element when present; `required` means at least one element |

Every field also shows:

- The parameter **name** as the field label, and its declared **type** as a hint.
- A **required** marker when `required` is true.
- The **source of the current value** — whether it is the file's `default` or a user
  override — so the user can tell at a glance what they are changing. Reverting a field
  restores the file's `default`.

### The `string_array` field and Browse

A `string_array` parameter (format doc "Parameter types") is the one list parameter
type, defined so the runner can contribute **one or more source paths** to a step's
`sources` array at run time — matching how the existing drag-drop transfer UI already
treats sources as a list. Its field is a **multi-chip input with a Browse button**:

- **Browse** opens the existing File Browser component (`fme-file-browser`) in a modal,
  in a select-only *pick mode* (the drag/drop and context-menu transfer actions are
  suppressed — it is choosing paths, not moving files). The component's native
  multi-select (click, shift-click range, cmd/ctrl toggle) returns the chosen
  `FileBrowserObject` paths.
- Each selected path becomes a **removable chip**; the field value is the ordered list.
  The user may also type a path directly. A `required` `string_array` with no chips is
  invalid and blocks the run, exactly like an empty required scalar.
- Client validation applies the parameter's `pattern` (when set) to **every** element.
- On submit the chips are sent as the daemon's `WorkflowParamValue.values` repeated
  field (see section 4), not a joined string.

### Override semantics (the core behavior)

The precedence the daemon already implements (`resolveParameters` in the format work)
is exactly what the UI presents:

1. **User-entered value** wins.
2. else the file's declared **`default`**.
3. else **empty** — which is only valid for `string`/`enum` (they have an empty form);
   a `bool`/`int`/`float` with neither a user value nor a `default` is an error, so such
   a field is effectively **required** and the UI marks it so even if `required` was not
   set. This mirrors the format's rule that a `bool`/`int`/`float` used in a typed
   `with` position must be `required` or defaulted.

The user sees the `default` pre-filled and may type over it; clearing a field falls back
to the `default`, not to empty, so an override is always an explicit act.

## 4. How the run is submitted (daemon owns resolution)

The runner collects `{ workflow document text, parameter values }` and submits both to
the daemon. It does **not** substitute `${params.*}` locally — the resolved document only
ever exists daemon-side, which keeps one resolution+validation implementation (the
engine's) authoritative and avoids a second, drifting resolver in the GUI.

### RPC surface (sketch, not built)

The GUI reaches the daemon over ConnectRPC (`src/protobuf/fme/v1`, consumed via
`src/gui/src/app/services/fme-client`). The runner needs a new RPC mirroring the
format doc's `fme workflow run <file> --param k=v`:

```
rpc RunWorkflow(RunWorkflowRequest) returns (RunWorkflowResponse)

message RunWorkflowRequest {
  string document = 1;              // the raw workflow file text (YAML or JSON)
  string format = 2;               // "yaml" | "json" — how to parse `document`
  map<string, string> params = 3;   // parameter name -> value, as strings (see below)
}

message RunWorkflowResponse {
  string run_id = 1;                // handle for status/events, like a job id
}
```

Companions, consistent with the format doc's `fme workflow validate|status|list` and
the run lifecycle (format doc "Run lifecycle, state management, and persistence"):

```
rpc ValidateWorkflow(ValidateWorkflowRequest) returns (ValidateWorkflowResponse)
    // schema + reference + resolve-with-these-params check, no execution

rpc ListWorkflowRuns(ListWorkflowRunsRequest) returns (ListWorkflowRunsResponse)
rpc CancelWorkflowRun(CancelWorkflowRunRequest) returns (CancelWorkflowRunResponse)
rpc PauseWorkflowRun(PauseWorkflowRunRequest) returns (PauseWorkflowRunResponse)
    // PauseWorkflowRunRequest carries pause_in_flight_jobs (see section 7)
rpc ResumeWorkflowRun(ResumeWorkflowRunRequest) returns (ResumeWorkflowRunResponse)
```

These are drafted in `src/protobuf/fme/v1/workflow.proto` (with `WorkflowRun` /
`WorkflowStep` records and the run/step lifecycle events). `ListJobs` / `ListEvents` /
`ListTasksForJob*` (which already exist) carry the run's byte progress once it starts,
tagged with the workflow run id and step id as the format doc describes — so no new
progress RPC is needed.

### Parameter value encoding

`params` carries each value as a `WorkflowParamValue` (not a bare `string→string`
map). For a scalar parameter the daemon reads `value`, matching the CLI's `--param k=v`
shape, and coerces that string to the declared type during resolution (an `int`
parameter parses `"12"` to 12, a `bool` parses `"true"`), which is the single coercion
point the engine already owns. For a `string_array` parameter the GUI sends the ordered
list in the `repeated string values` field instead of `value`; the daemon coerces each
element and (when a `pattern` is set) checks every one. The GUI does not pre-coerce; it
sends the user's entered text (or the `default`'s string form) so there is exactly one
place that interprets types. A `bool` toggle submits `"true"`/`"false"`; an unset
optional `string` submits an empty string or is omitted; an empty `string_array` submits
no `values`.

### Fail-fast

The daemon validates before any transfer starts (format doc "Execution model" and
"DAG validation rules"): missing `required` param, out-of-range `int`, `pattern` miss,
`enum` value outside `values`, a referenced `transferProfile` that does not exist, a
cyclic or dangling-id graph. Any of these returns an error from `RunWorkflow` /
`ValidateWorkflow` **before** execution, and the GUI shows it against the offending
field (for a parameter error) or as a document-level error (for a graph/profile error).

## 5. Client-side pre-flight validation

The GUI validates the entered parameters **before** submitting, purely for immediate
feedback — it is UX, not the authority. The authority is the daemon (section 4). The
client checks mirror the schema's parameter constraints:

- type (integer vs decimal vs free string), `required`, `pattern`, `min`/`max`, `enum`
  membership — the same table as section 3.
- These are the **same constraints** declared in `schemas/workflow/v1.json`, so the GUI
  SHOULD derive them from the parsed `spec.parameters` rather than hand-coding per
  workflow. (Whether the GUI bundles the schema like the builder does, or validates
  structurally from the parsed parameters alone, is an open item — section 11.)

The run button is disabled while any field fails client validation, with the failing
fields marked. Passing client validation does **not** guarantee the daemon accepts the
run (e.g. a missing `transferProfile` is only knowable daemon-side); a daemon rejection
is surfaced after submit.

## 6. Flow

1. **Open** — the user picks a workflow file through the GUI's existing file surface.
   The GUI parses it (YAML/JSON) and validates its structure; a malformed or
   schema-invalid file is rejected with an error and does **not** open a prompt.
2. **Prompt** — if the file declares `parameters`, the parameter form opens with each
   field pre-filled from its `default`. The user fills/overrides values. (No parameters
   → skip to step 3.)
3. **Confirm** — a run confirmation summarizes what will run: the workflow name, the
   resolved-looking parameter values (as the user set them), and the step count. For a
   workflow that performs destructive or large transfers this is the user's last gate.
4. **Submit** — the GUI calls `RunWorkflow` with the document text, format, and the
   `params` map, and receives a `run_id`.
5. **Observe** — the GUI switches to its job/events view scoped to the `run_id`, showing
   each step's progress through the existing `ListJobs`/`ListEvents` surface. The jobs a
   run produces carry their provenance back to it: `fme.v1.Job` and
   `fme.v1.JobCreateEvent` (see `src/protobuf/fme/v1/job.proto`) each expose optional
   `workflow_run_id` and `workflow_step_id` fields, daemon-populated when a job is
   created as a step of a run and empty for a standalone job. The GUI filters jobs to
   this run by `workflow_run_id` and labels each with its `workflow_step_id`, so a run's
   steps show as a cohesive unit and a failed transfer traces back to its step.

A daemon-side rejection at step 4 returns the user to the prompt (parameter errors) or
shows a document-level error (graph/profile errors), without starting a run.

## 7. Managing runs (list, cancel, pause, resume)

Once runs exist, the GUI gives the user a **runs view** to see and control them. This is
distinct from the parameter prompt (which is about *starting* a run) — it is about
*managing in-flight and finished runs*. It is backed by the run-lifecycle RPCs and the
run-level events (format doc "Run lifecycle, state management, and persistence").

### Listing runs

`ListWorkflowRuns` returns a `WorkflowRun` per run — run id, workflow name, overall
status, a per-step status rollup, and timestamps. The GUI renders this as a table (one
row per run) showing name, status, and progress (e.g. "3/5 steps succeeded"). Because run
state is persisted, this list **includes finished runs across daemon restarts** (an
interrupted run shows as FAILED per the reconciliation rules), not just live ones.

Run rows join to the existing jobs view by `workflow_run_id`: expanding a run shows its
steps, and a `Job` step links to its runtime job (and that job's tasks) through the
existing `ListJobs` / `ListTasksForJob*` surface. The runs view does not duplicate
job-level detail; it composes with it.

### Live updates

The runs view stays current from the run-level events on the existing `ListEvents`
stream — `WorkflowRunStartedEvent`, `WorkflowRunStatusChangeEvent`,
`WorkflowStepStatusChangeEvent`, `WorkflowRunCompleteEvent` — updating a run's status and
step rollup as transitions arrive. Byte-level progress for a running step still comes from
`JobProgressEvent` tagged with the run/step id, exactly as the single-job view already
consumes it.

### Controls per run

Each non-terminal run row offers controls, each calling one lifecycle RPC and reflecting
the result from the subsequent status-change event:

- **Cancel** (`CancelWorkflowRun`) — stops scheduling, skips not-yet-started steps, and
  cancels in-flight jobs. Shown for a RUNNING or PAUSED run. Because cancel is
  irreversible and may abort large transfers, the GUI confirms before calling it.
- **Pause** (`PauseWorkflowRun`) — shown for a RUNNING run. The GUI surfaces the
  **`pause_in_flight_jobs` choice** to the user, since the format decision made it a user
  option rather than a fixed behavior: a simple **Pause** gates the scheduler only
  (in-flight transfers finish), while a **Pause (including running transfers)** affordance
  also suspends in-flight jobs. The GUI should make the difference legible — e.g. a
  primary "Pause" (scheduler only) plus a secondary "Pause transfers too", or a single
  pause with a checkbox — and note that `Sleep`/`Checksum`/`InventoryReport` steps have no
  pause primitive and run to completion regardless.
- **Resume** (`ResumeWorkflowRun`) — shown for a PAUSED run. Un-gates the scheduler and
  resumes any jobs that a `pause_in_flight_jobs` pause suspended.

Controls are hidden or disabled once a run is terminal (SUCCEEDED/FAILED/CANCELLED); the
lifecycle RPCs are idempotent and return an error for an unknown or already-terminal run,
which the GUI surfaces inline on the row.

## 8. Read-only graph preview (optional, nice-to-have)

Because the file **is** a DAG and the format and builder already define the
node→step/wire→`dependsOn` mapping, the runner MAY show a **read-only** rendering of the
graph beside the parameter prompt, so the user can see what they are about to run. This
is explicitly non-editable (editing is the builder's job) and is a nice-to-have, not a
v1 requirement — a plain step list is sufficient for the first version.

## 9. What this is NOT

- **Not an editor.** The runner never changes the workflow file. Fix a workflow in the
  builder, not here.
- **Not a scheduler.** The format doc's non-goal stands: a workflow is submitted on
  demand. Recurring execution is left to the caller (cron, hot folders, a pipeline
  orchestrator). The runner is the on-demand submit path.
- **Not a second resolver.** `${params.*}` substitution happens only in the daemon. The
  GUI collects values; it does not produce a resolved document.
- **Not a secrets prompt.** The format has no `secret` parameter type by design;
  credentials live in the named `transferProfile`, which the daemon resolves locally.
  The runner never prompts for or transmits credentials.

## 10. Decisions (proposed)

- **Surface**: a runner lives in the **main FME GUI** (daemon-connected), distinct from
  the offline builder app. It opens an externally-authored workflow and runs it.
- **Prompt source**: the parameter form is driven **only** by `spec.parameters`;
  `spec.defaults` is never prompted.
- **Override semantics**: the file's `default` pre-fills each field and is editable;
  user value > file `default` > empty, matching the engine's existing resolution order.
  A `bool`/`int`/`float` with no `default` is treated as required.
- **Resolution ownership**: the daemon resolves `${params.*}` and validates; the GUI
  submits `{document, format, params}` and never resolves locally.
- **Transport**: a new `RunWorkflow` (and `ValidateWorkflow`) RPC in `fme/v1`, with
  `params` as a string->string map coerced daemon-side; progress rides the existing
  `ListJobs`/`ListEvents` surface. The run RPC is distinct from single-job submission.
- **Client validation**: pre-flight only, mirroring the schema constraints for
  immediate feedback; the daemon is authoritative. The GUI **bundles
  `schemas/workflow/v1.json`** to drive both field generation and these client checks.
- **Validate affordance**: an explicit "Validate" action (`ValidateWorkflow`) in addition
  to Run; Run itself validates fail-fast daemon-side, so it never bypasses validation.
- **File open**: reuse the GUI's existing file-open surface where practical; a dedicated
  workflow-open component only if adapting the existing one is too invasive.
- **Scope**: open + prompt + confirm + submit + observe, plus a runs management view
  (list/cancel/pause/resume). No editing, no scheduling, no local resolution. Manual
  parameter entry only in v1 (no params-file load). A read-only graph preview is a
  nice-to-have, not v1.

## 11. Open items for implementation (resolved)

These were the open items from the design phase; each is now decided and the choice is
recorded here. The implementation phases in section 12 build on these decisions.

- **Schema in the GUI**: RESOLVED -- the GUI **bundles `schemas/workflow/v1.json`** and
  validates against it. The schema drives both parameter field generation and client-side
  pre-flight validation, so the GUI and the daemon share one contract (the daemon remains
  authoritative; the client checks are UX only, per section 5).
- **File open mechanics**: RESOLVED -- **reuse the existing GUI file surface where
  practical**. The runner opens an external workflow file through the GUI's existing
  file-open path rather than a bespoke affordance; a dedicated workflow-open component is
  introduced only if adapting the existing one proves too invasive.
- **`RunWorkflow` vs reusing job submit**: RESOLVED -- a **distinct `RunWorkflow` RPC**,
  not layered on the job-submission path. This matches the format doc's layering (the
  workflow engine sits above the transfer engine) and keeps run submission separate from
  single-job submission.
- **Validate-before-run affordance**: RESOLVED -- the GUI exposes an **explicit
  "Validate" action** (calling `ValidateWorkflow` with the entered params), AND a Run
  always validates: `RunWorkflow` is itself fail-fast daemon-side, so Run can never bypass
  validation. The explicit button lets the user check without submitting; Run validates
  implicitly before any step executes.
- **Params-file equivalent**: RESOLVED -- **manual entry only in v1**. The GUI does not
  load a saved parameter set / sidecar `.params.yaml` to pre-fill the prompt. (The CLI's
  `--params-file` remains available; a GUI equivalent is deferred past v1.)
- **Run history**: RESOLVED -- a workflow run's **jobs appear in the GUI's job history
  exactly like standalone jobs do**. A `Job` step is created through the normal job-manager
  path, so it is returned by `ListJobs` and ingested by the jobs table with no
  workflow-provenance filter; the only difference is the `workflow_run_id` /
  `workflow_step_id` provenance the daemon stamps on it, which the runs view (section 7)
  uses to group a run's steps. So the jobs table lists *all* jobs (standalone and
  workflow-step alike), and the runs view is the additional run-level grouping on top --
  not a replacement that hides step jobs from the single-job surface.

## 12. Implementation plan (phases)

Status at the start of GUI work: the **daemon side is already wired** -- the service
handlers (`src/cli/service/run-workflow.go`, `validate-workflow.go`,
`list-workflow-runs.go`, and the cancel/pause/resume handlers), the `WorkflowManager`
(`src/cli/workflow/manager.go`), and the shared `Validate` pipeline
(`src/cli/workflow/validate_doc.go`) exist with tests. The protobuf surface
(`src/protobuf/fme/v1/workflow.proto`) is complete and its TypeScript bindings are
generated at `src/gui/src/gen/es/fme/v1/workflow_pb.ts`. The **GUI side is greenfield**:
no runner code exists yet.

Each phase is test-first (Vitest, `.spec.ts`), self-contained, and follows the existing
GUI conventions: RPCs flow through `FmeClientService`
(`src/gui/src/app/services/fme-client/fme-client.service.ts`) as `Observable`-returning
methods; events are decoded in that service's `convertEvent` switch and modeled as event
classes under `src/gui/src/app/interfaces/events` (mirroring the job events); state is
NgRx by domain under `src/gui/src/app/state`.

### Phase 1 -- fme-client RPC + event wiring (foundation)

Both user-facing surfaces depend on this, so it lands first.

- Add to `FmeClientService`: `runWorkflow(document, format, params)`,
  `validateWorkflow(document, format, params)`, `listWorkflowRuns()`,
  `cancelWorkflowRun(runId)`, `pauseWorkflowRun(runId, pauseInFlightJobs)`,
  `resumeWorkflowRun(runId)`. Each mirrors the existing request/guard/callback pattern and
  returns an `Observable`.
- Decode the four run-lifecycle events in `convertEvent`
  (`WorkflowRunStartedEvent`, `WorkflowRunStatusChangeEvent`,
  `WorkflowStepStatusChangeEvent`, `WorkflowRunCompleteEvent`) and add their event classes
  under the events surface, matching the job-event classes.
- Map the `WorkflowFormat` enum (yaml/json) and the `WorkflowParamValue` repeated form
  for request construction, and surface `WorkflowValidationError` + its `kind` so callers
  can route an error to a field (PARAMETER) versus a document-level banner.

### Phase 2 -- parameter prompt flow (open -> prompt -> confirm -> submit -> observe)

The core user-facing path (sections 3-6).

- Bundle `schemas/workflow/v1.json` and drive field generation + client-side pre-flight
  validation from the parsed `spec.parameters` against it (section 5; open item 1).
- Open an external workflow file through the GUI's existing file-open surface where
  practical; parse YAML/JSON, structurally validate, reject a malformed file before
  prompting (open item 2).
- Render one typed field per declared parameter with the file `default` pre-filled and
  overridable (user value > file default > empty; a `bool`/`int`/`float` with no default
  is treated as required). A workflow with no parameters skips straight to confirm.
- A run confirmation summarizes name, parameter values as set, and step count.
- Submit via `RunWorkflow` with `{document, format, params}`; route daemon
  `WorkflowValidationError`s to the field (PARAMETER) or a document banner
  (SCHEMA/GRAPH/PROFILE/VERSION). Expose an explicit **Validate** button
  (`ValidateWorkflow`) alongside Run (open item 4).
- On acceptance, switch to the existing job/events view scoped to the returned `run_id`.

### Phase 3 -- runs management view (list / cancel / pause / resume)

Section 7, composing on top of phases 1-2.

- A runs table from `ListWorkflowRuns` (name, status, step rollup, timestamps), kept live
  from the four lifecycle events, including finished runs across daemon restarts.
- Per-run controls -- Cancel (confirm first), Pause (surfacing the `pause_in_flight_jobs`
  choice), Resume -- each calling one lifecycle RPC and reflecting the subsequent
  status-change event; controls hidden/disabled once terminal.
- Rows join to the existing jobs view by `workflow_run_id`; expanding a run shows its
  steps, and a `Job` step links to its runtime job and tasks. The view composes with the
  job surface rather than duplicating it.

### Deferred (not in the first implementation)

- Read-only graph preview (section 8) -- a plain step list suffices for v1.
- Params-file / saved parameter-set load (section 11, manual entry only in v1).
