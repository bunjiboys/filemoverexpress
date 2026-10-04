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
  of the graph (section 7), but editing a workflow is explicitly out of scope.
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

Every field also shows:

- The parameter **name** as the field label, and its declared **type** as a hint.
- A **required** marker when `required` is true.
- The **source of the current value** — whether it is the file's `default` or a user
  override — so the user can tell at a glance what they are changing. Reverting a field
  restores the file's `default`.

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

Companions, consistent with the format doc's `fme workflow validate|status|list`:

```
rpc ValidateWorkflow(ValidateWorkflowRequest) returns (ValidateWorkflowResponse)
    // schema + reference + resolve-with-these-params check, no execution
```

`ListJobs` / `ListEvents` / `ListTasksForJob*` (which already exist) carry the run's
progress once it starts, tagged with the workflow run id and step id as the format doc
describes — so no new progress RPC is needed.

### Parameter value encoding

`params` is a **string→string** map, matching the CLI's `--param k=v` shape. The daemon
coerces each string to the declared parameter type during resolution (an `int`
parameter parses `"12"` to 12, a `bool` parses `"true"`), which is the single coercion
point the engine already owns. The GUI does not pre-coerce; it sends the user's entered
text (or the `default`'s string form) so there is exactly one place that interprets
types. A `bool` toggle submits `"true"`/`"false"`; an unset optional `string` submits an
empty string or is omitted.

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
  structurally from the parsed parameters alone, is an open item — section 10.)

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

## 7. Read-only graph preview (optional, nice-to-have)

Because the file **is** a DAG and the format and builder already define the
node→step/wire→`dependsOn` mapping, the runner MAY show a **read-only** rendering of the
graph beside the parameter prompt, so the user can see what they are about to run. This
is explicitly non-editable (editing is the builder's job) and is a nice-to-have, not a
v1 requirement — a plain step list is sufficient for the first version.

## 8. What this is NOT

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

## 9. Decisions (proposed)

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
  `params` as a string→string map coerced daemon-side; progress rides the existing
  `ListJobs`/`ListEvents` surface.
- **Client validation**: pre-flight only, mirroring the schema constraints for
  immediate feedback; the daemon is authoritative.
- **Scope**: open + prompt + confirm + submit + observe. No editing, no scheduling, no
  local resolution. A read-only graph preview is a nice-to-have, not v1.

## 10. Open items for implementation

- **Schema in the GUI**: whether the GUI bundles `schemas/workflow/v1.json` (like the
  builder) to drive field generation and client validation, or derives fields
  structurally from the parsed `spec.parameters` without the full schema. Bundling keeps
  one contract; deriving avoids shipping the schema into the Angular bundle.
- **File open mechanics**: whether the runner reuses the GUI's existing file-browser /
  Wails native file dialog, or a dedicated workflow-open affordance.
- **`RunWorkflow` vs reusing job submit**: whether the workflow run is a distinct RPC or
  layered on the existing job-submission path; the format doc keeps the workflow engine
  above the current transfer engine, which argues for a distinct RPC.
- **Run history**: whether a workflow run appears in the GUI's job history the same way
  individual jobs do, consistent with how `ListJobs` behaves today (an open item the
  format doc also flags for `fme workflow list`).
- **Params-file equivalent**: the CLI accepts `--params-file`; whether the GUI offers
  loading a saved parameter set (a sidecar `.params.yaml`) to pre-fill the prompt, or
  only manual entry in v1.
- **Validate-before-run affordance**: whether the GUI exposes a "Validate" action
  (calling `ValidateWorkflow` with the entered params) separate from "Run", mirroring
  `fme workflow validate`.
