# Workflow Builder App (Research / Design)

Status: Research / proposed. Nothing in this document is implemented yet. This is a
companion to `docs/Workflow-File-Format.md` and depends on that format being the
single source of truth for what a node can be and how a graph serializes.

## 1. What this is

A standalone **web application**, separate from the main File Mover Express UI,
whose only job is to let a user build an FME Workflow file visually: drag step
nodes onto a canvas, wire them together to express dependencies, double-click a
node to edit its properties in a modal, and export a valid `fme.workflow.yaml`.
The reference UX is a node-graph editor like DaVinci Resolve's Nodes page or a
compositor's node tree: a pannable, zoomable canvas; nodes with input and output
ports; connections drawn as wires between ports; selection and multi-select.

It ships as a **static site** (a built single-page app, no server), not a native
binary. The whole app is HTML/JS/CSS that runs in the browser; file open and save
go through browser file APIs (see section 6). This keeps distribution trivial
(host the static build anywhere, or open it locally) and removes the entire
cross-compile/package/embed burden of a desktop app.

It is deliberately **wrappable in Wails later**: because the app is a
self-contained static frontend with no backend, dropping it into a Wails 3 shell
later (to get native file dialogs, a desktop window, OS integration) is additive
and does not change the frontend. That path is intentionally deferred, not designed
away.

It is a **builder and validator**, not a runner. It produces the file; the FME
daemon executes it (`fme workflow run`). Keeping execution out of this app matters:
the format's core principle is that the daemon owns the run end to end, so the
builder has no business submitting or scheduling anything. This also keeps the app
a pure static site: it needs no backend, no daemon connection, no AWS SDK, and no
transfer engine - just the format schema and a canvas.

## 2. Relationship to the Workflow file format

The builder is a strict projection of `docs/Workflow-File-Format.md`. Every visual
concept maps to a format concept, with no invented abstractions:

| Visual concept | Format concept |
|----------------|----------------|
| Node | A step (one entry in `spec.steps`). |
| Node type (its shape, color, ports, property form) | The step `type`: `Job`, `Checksum`, `Sleep`, `InventoryReport`. |
| Node title | `name` (and the node carries the step `id`). |
| A wire from node A's output to node B's input | `B.dependsOn` includes `A.id`. |
| The property modal fields | The step's `with` payload for that `type`. |
| A "continue on error" toggle on the node | `continueOnError`. |
| A parameters panel (document-level, not a node) | `spec.parameters`. |
| A defaults panel (document-level) | `spec.defaults`. |
| Document metadata panel | `apiVersion`, `kind`, `metadata` (name/description/labels). |
| Export | Serialize the graph to canonical YAML/JSON. |
| Import | Parse an existing file and lay out its DAG. |

The graph the user draws **is** a DAG, which is exactly what `dependsOn` already
is. There is no impedance mismatch: a connection is a dependency edge, and the
canvas should forbid any edge that would create a cycle (the format requires an
acyclic graph), giving the user immediate feedback instead of a validation error at
export time.

### The property modal is schema-driven, not hand-coded per type

Each `type` has a `with` payload with a known field set (see the format doc:
`Job` maps to `JobConfig`; `Checksum`, `Sleep`, `InventoryReport` each have their
own fields). The modal that opens on double-click should be **generated from the
same schema** that validates the file, not written by hand per type. That is the
single most important design decision in this app, because:

- It guarantees the builder and the file format never drift. A new field in the
  `Job` payload appears in the modal automatically.
- When the format ships new step types later (the format's registry is open), the
  builder gains them by registering a node descriptor, not by writing a new form.
- Validation in the modal is the same validation the daemon applies, so a graph
  that exports clean actually runs.

The published JSON Schema (`schemas/workflow/v1.json` in the format doc) is the
contract. The builder consumes it to drive both the palette (which node types
exist) and the property forms (which fields each node has, with their types,
enums, defaults, and required-ness).

## 3. Why a standalone web app, and the layout

### Standalone, not a tab in the main FME UI

The user asked for a separate application, and that is the right call:

- It targets a different user moment: authoring a reusable pipeline artifact
  offline, versus doing an interactive transfer. Pipeline/TD users author
  workflows; artists run transfers.
- It has a different dependency surface: no daemon, no AWS, no transfer engine.
  Bundling a node editor into the main app would bloat it for users who never
  author workflows.
- It can ship, version, and iterate on its own cadence, tracking the format
  version rather than the FME release.

### A static site now, Wails-wrappable later

The app is a built single-page application served as static files. There is no Go
backend, no `//go:embed`, no desktop packaging in this phase. Distribution is just
the `dist/` output: host it on any static host, or open the build locally.

The deferred Wails path stays open precisely because the frontend is a
self-contained static bundle. If a native desktop build is wanted later (for native
file dialogs, a real window, file-drop), a thin Wails 3 shell can embed this exact
`dist/` via `//go:embed`, mirroring the existing `src/wails/` app, with no change to
the frontend. The browser file I/O (section 6) is written behind a small abstraction
so a later Wails host can swap in native dialogs without touching the rest of the UI.

### Project layout (frontend only)

A self-contained web project directory. No Go, no Wails files in this phase.

```
src/workflow-builder/
├── package.json                  # react, react-dom, @xyflow/react, @cloudscape-design/{components,global-styles},
│                                 #   elkjs (layout), ace-builds (Cloudscape CodeEditor), a YAML lib, ajv (schema);
│                                 #   dev: vitest, @testing-library/react, @fast-check/vitest, @playwright/test
├── vite.config.ts
├── vitest.config.ts              # v8 coverage, 100% thresholds, perFile: true
├── playwright.config.ts          # E2E against vite preview; separate from the unit gate
├── eslint.config.mjs             # ported from src/gui, Angular stripped, React+a11y added
├── index.html
├── tsconfig.json
├── public/
├── src/
│   ├── main.tsx                  # React entry
│   ├── app/                      # Cloudscape AppLayout shell, view-mode segmented control
│   ├── canvas/                   # React Flow setup, custom node components, edge/cycle rules
│   ├── layout/                   # ELK layered DAG layout, flow-direction (LR/TB)
│   ├── editor/                   # Cloudscape CodeEditor (Ace, lazy-loaded) for Editor/Split modes, YAML/JSON
│   ├── nodes/                    # per-type node descriptors (toStep/fromStep, ports, form schema)
│   ├── modal/                    # schema-driven property form (double-click editor), Cloudscape controls
│   ├── workflow/                 # parse <-> model <-> serialize, graph validation (the source of truth)
│   ├── io/                       # file open/save abstraction (browser now, Wails host later)
│   └── schema/                   # bundled v1.json + loader
├── e2e/                          # Playwright specs: drag/wire/zoom/modal/view-mode flows
├── dist/                         # built static site (the deployable / later Wails-embeddable artifact)
└── README.md
```

Keeping it under `src/workflow-builder/` matches the repo's `src/*`-per-package
convention and leaves room for a sibling Go/Wails shell directory later without
moving the frontend.

## 4. The canvas: build vs buy

The node canvas (pan, zoom, draggable nodes, port-to-port wiring, selection,
cycle prevention, minimap) is the hard, time-consuming part. **Settled: React +
React Flow (xyflow).** The canvas interaction model is the bulk of this app's
engineering effort, and that is the single area where the library gap between
ecosystems is widest; React Flow is the most complete, best-maintained library for
exactly this UI. React only comes along
because React Flow is React-native. The FME-specific value (node descriptors,
schema-driven forms, serialization, validation) is plain TypeScript and would move
to any framework, so choosing React costs nothing on those parts and saves the most
on the hardest part. The second-framework cost (the main GUI is Angular) is
contained because this is a separate package with its own build. Alternatives
considered and rejected for v1:

- **React Flow (xyflow)** - chosen. Handles custom node rendering, typed connection
  handles, pan/zoom, selection, minimap, and an edge-validation callback
  (`isValidConnection`) so cycle prevention is a hook rather than a subsystem.
- **Rete.js** - framework-agnostic, usable from Angular; capable but rougher
  interaction polish and docs, and the Angular binding is a secondary target.
- **Hand-rolled SVG/Canvas** - re-implementing pan/zoom/wiring/selection is weeks
  of work and bug surface (coordinate-transform math, wire hit-testing) for no
  differentiation. Rejected for v1.

The library only draws the graph; the **node descriptors** (what ports a `Job`
node has, what its property form is, how it serializes to a step) are ours and are
derived from the format schema regardless of which canvas library draws them.

## 5. Node model (per step type)

All four v1 step types become node types. Each node is a small descriptor:
`{ type, title, inputPorts, outputPorts, propertySchema, toStep(), fromStep() }`.

| Node type | Ports | Property form (from `with`) | Notes |
|-----------|-------|------------------------------|-------|
| `Job` | 1 in, 1 out | direction, transferProfile, sources[], destination, uploadBasePath, s3PrefixToTrim, force | The main node. `direction` is an enum; upload-only vs download-only fields show conditionally. |
| `Checksum` | 1 in, 1 out | sources[], algorithm (enum), recursive, writeMhl, mhlOutput, failOnMismatch | `mhlOutput` required when `writeMhl` is on. |
| `Sleep` | 1 in, 1 out | duration (Go duration string) | Pure gate node; validate the duration string in the modal. |
| `InventoryReport` | 1 in, 1 out | transferProfile, outputFormat, pretty, includeChecksums | Mirrors the inventory request fields. No `prefix` field (not in `v1.json`). |

Ports model dependency, not data flow: a wire from A-out to B-in means
`B.dependsOn: [A.id]`. A node can have multiple incoming wires (multiple
dependencies) and multiple outgoing wires (multiple dependents), which matches the
DAG. There is no typed payload flowing along the wire; the wire is purely an
ordering/dependency edge, so a single generic port pair per node is sufficient for
v1.

`transferProfile` is referenced by name (the format keeps profiles machine-local
and out of the file). The builder cannot resolve profile names against a daemon
(it has no daemon connection by design), so it treats the profile as a free-text /
remembered-list string and leaves existence-validation to the daemon's preflight.
A nice-to-have is remembering previously-typed profile names for autocomplete.

## 6. File I/O (browser, with a seam for a later Wails host)

There is no Go host in this phase, so open and save run in the browser. All file
I/O goes through one small abstraction (`src/io/`) so the rest of the app never
calls a browser API directly - and a later Wails shell can swap in native dialogs
by implementing the same interface.

- **Open**: the File System Access API (`showOpenFilePicker`) where available
  (Chromium-based browsers), falling back to a hidden file `<input accept=".yaml,.yml,.json">`
  for browsers without it. Either way the app receives the file text and hands it to
  the import path.
- **Save / export**: `showSaveFilePicker` + a writable stream where available (so
  "Save" can overwrite the opened file), falling back to a download of a Blob
  (`<a download="fme.workflow.yaml">`) in other browsers. Export always produces the
  serialized workflow text the frontend built.
- **File drop**: HTML5 drag-and-drop on the window opens a dropped `.yaml`/`.json`,
  which is a browser capability and needs no host.
- **Draft autosave is deferred** (not in v1): persisting the in-progress working
  model across reloads (via `localStorage`/`IndexedDB`) is a future convenience, noted
  in section 14's deferred items. v1 keeps no draft state - unsaved work is lost on
  reload, same as any editor without autosave. (This is separate from the settled
  node-position store in section 9, which stays.)

Parsing, serialization, validation, and layout are all frontend concerns and are
unchanged by this being a website - they were already going to live in the
frontend. The only thing the dropped Wails host was ever providing was native file
dialogs, and the browser covers open/save without it; the abstraction keeps the
native-dialog upgrade available later.

### Import / Export (the round-trip, as one named feature)

Import and export are a first-class v1 feature - the whole point of the builder is to
produce and re-open workflow files. The pieces are specified across this doc; here is
how they fit together:

- **Export** = serialize the current graph model to a canonical workflow document and
  write it out. Serialization and the format mapping are in section 2 (node -> step,
  wire -> `dependsOn`, modal fields -> `with`); the write mechanics (save dialog or
  download) are above in this section. YAML is the default output, JSON available via
  the Editor-mode toggle (section 10).
- **Import** = read a workflow file, parse it, build the node graph, and apply the
  layered layout. The read mechanics (open dialog, file `<input>`, or file-drop) are
  above; the parse-to-graph-and-lay-out behavior and its fidelity guarantees are in
  section 9.
- **Round-trip stability** is the correctness bar: `serialize(parse(file))` is
  canonical, so importing a file and immediately exporting it produces the same
  document (modulo canonical formatting), and a graph exported then re-imported yields
  the same graph. Positions are the only thing a file does not carry (section 9).
- **Validation gates both ends**: import surfaces schema/structural errors on a bad
  file rather than silently dropping content; export is blocked or warned on an invalid
  graph (section 7), so an exported file is a runnable file.

In short: section 2 defines what maps to what, this section 6 moves the bytes, section
9 guarantees fidelity, and section 7 keeps both ends honest. Import/Export is the
user-facing name for that pipeline.

The builder should validate continuously, not only at export, using the published
JSON Schema plus the structural rules the format defines:

- **Per-field** (in the modal): type, enum membership, required fields, string
  `pattern`, and numeric `min`/`max` bounds - straight from the schema.
- **Per-node**: cross-field rules (for example `mhlOutput` required when `writeMhl`
  is true, which `v1.json` encodes as an `if/then`).
- **Graph-level**: unique `id`s, acyclic graph (prevent the connection at draw
  time), `dependsOn` references resolve to existing nodes.
- **Parameters panel**: the parameter form is schema-driven too - `v1.json` allows
  parameter `type` of `string | int | float | bool | enum` (note `float`), with
  `pattern` for `string`, `min`/`max` for `int`/`float`, `values` for `enum`, plus
  `required`/`default`. The panel renders and validates against exactly those.
- **Parameter references**: every `${params.x}` used in a `with` value refers to a
  declared parameter (the format's template-only lint).

Export is blocked (or warns, matching the format's strict/lenient idea) while the
graph is invalid, and each problem points at the offending node. Because this is
the same schema the daemon validates against, a clean export is a runnable file.

## 8. Default layout and flow direction

Because a workflow is a DAG, placement is not freeform - the dependency structure
already implies the flow. The builder computes a **layered (Sugiyama-style)
layout** so a freshly opened or imported graph is readable immediately and nodes
never open stacked or jumbled:

1. **Layer assignment by longest path**: a node with no `dependsOn` is layer 0;
   every other node sits one layer past its deepest dependency. This guarantees a
   node always appears after everything it depends on.
2. **Within-layer ordering** uses a crossing-minimization heuristic
   (barycenter/median) so wires read cleanly instead of tangling.
3. **Uniform spacing** with fixed inter-layer and intra-layer gaps.

Rather than hand-roll Sugiyama, the builder uses a proven layout engine. **`elkjs`
(ELK) is the choice** - it does layered DAG layout with crossing minimization and
pairs cleanly with React Flow; `dagre` is a lighter fallback if ELK's size or API
is unwelcome. Graphs are small (tens of nodes), so either is effectively instant.

### Fork/join topologies (crossing minimization is a requirement)

Workflows support **forking paths that may rejoin** - a node with multiple
dependents forks, and a node with multiple `dependsOn` entries is a join; a
fork-then-join is a diamond. These are first-class in the format (nothing special in
the file, just the DAG edges), and they are exactly the shape where a naive layout
tangles. **Minimizing edge crossings in these cases is a stated layout requirement,
not best-effort.** The layered engine satisfies it with three capabilities we rely
on explicitly:

- **Within-layer crossing minimization** (the barycenter/median ordering above) is
  precisely the algorithm that keeps a fork's branches from crossing as they fan out
  and come back together. In ELK this is the layered algorithm's default crossing
  minimization (`crossingMinimization.strategy = LAYER_SWEEP`).
- **Edge routing through dummy nodes** for edges that span more than one layer - when
  one branch of a fork is shorter than its sibling, the long edge to the join is
  routed cleanly through intermediate layers via virtual nodes instead of cutting
  across unrelated nodes. ELK inserts these automatically.
- **Balanced node placement** so a diamond reads symmetrically around its join (ELK
  `nodePlacement.strategy = BRANDES_KOEPF`), keeping the two branches visually even
  rather than skewed to one side.

The target is zero avoidable crossings on common diamond shapes and the minimum the
heuristic can achieve on denser graphs. If a specific topology still reads poorly,
the user's manual rearrange (persisted per section 9) is the override; the engine's
job is to make that rarely necessary.

### Flow direction (settled)

The user can switch the layout between two cardinal directions, which is just a
parameter to the same layout engine (ELK `direction: RIGHT` vs `DOWN`):

- **Left-to-right**: roots on the left, dependents flowing rightward (matches the
  DaVinci Resolve node-graph reference).
- **Top-to-bottom**: roots on top, dependents flowing downward.

Switching direction re-runs the layout engine. A "re-layout" action re-runs the
engine in the current direction and discards manual positions on demand (the user's
escape hatch when a hand-arranged graph gets messy). The chosen direction is a
builder preference, persisted in `localStorage` like layout positions, and never
part of the workflow file.

## 9. Round-tripping and layout persistence

Import must be lossless enough to be useful: parse an existing workflow file, build
the node graph, and apply the layered layout from section 8. The one thing a file
does not carry is node positions, so:

- **Layout persistence (settled): node positions are stored in `localStorage`,
  keyed by file.** On open or import, the builder computes the layered layout
  (section 8), then overlays any saved positions for that file; on edit it writes the
  current positions back under that key. Positions are **never** written into the
  canonical workflow file and are never part of the published schema - the file
  stays position-free and portable.
- **The key** is derived from a stable file identity rather than contents, so a
  cosmetic edit does not orphan the layout. Where the File System Access API is used
  the open file handle gives a durable identity; the fallback keys on the file name
  (plus a disambiguator) and degrades gracefully to the computed layout on a miss.
- **Consequences to accept**: `localStorage` is per-browser and per-origin, so a
  layout does not travel with the file to another machine or browser - it is a
  local convenience, not shared state. A new/unseen file simply gets the computed
  layout. Clearing site data loses saved arrangements, which is harmless (recomputed
  on next open).
- A later Wails host can back the same `src/io/` seam with a side-car file if
  cross-machine layout sharing is ever wanted; that is out of scope here and must
  still never touch the canonical file.

## 10. View modes: Visual / Editor / Split

A segmented control switches the workspace between three modes, so a user can work
visually, work in raw text, or see both at once:

- **Visual** - the node canvas only (sections 4-8). The primary mode.
- **Editor** - the Cloudscape **CodeEditor** component (built on Ace) showing the
  canonical workflow document (YAML, with a toggle to view/edit as JSON). The user
  edits the file directly. CodeEditor is chosen over a hand-wrapped editor because it
  is a Cloudscape component: it themes with the light/dark toggle automatically, has
  `findCodeEditor` test-utils support, and keeps the app on one component library.

  **CodeEditor has no built-in JSON Schema validation.** Ace only ships syntax-level
  checkers (malformed JSON/YAML), not schema-awareness, so we implement schema
  validation ourselves: listen on the editor's change event (`onDelayedChange`, which
  is batched and safe for a controlled `value`), run the text through our own pipeline
  - `textToDocument` (parse) then `validateWorkflow` (ajv against the bundled
  `v1.json`) then the structural graph checks (sections 2, 7) - and convert the
  resulting errors into Ace `Annotation[]` (`{row, column, text, type}`) that we hand
  back to CodeEditor so they render as inline gutter markers. Ace's own syntax
  annotations (via `onValidate`) can be merged in for genuine parse errors; schema
  validity is entirely our annotations. This keeps one validation source of truth and
  makes hand-editing first-class rather than an escape hatch that bypasses validation.

  One real task this implies: mapping our validation errors to line/column. ajv
  reports JSON-pointer `instancePath`s, not editor positions, so turning an error into
  a `{row, column}` requires tracking source positions during parse (the `yaml`
  library's CST / `LineCounter` gives node ranges). v1 may fall back to a
  document-level annotation (row 0) with the message where precise mapping is not yet
  available, then refine to exact positions.
- **Split** - canvas and editor side by side.

Ace loads its syntax/theme assets at runtime, so the `ace-builds` object is
**lazy-loaded** (dynamic import) only when the user first enters Editor or Split
mode, and passed to CodeEditor via its `ace` prop. This keeps Ace off the initial
static-site load; Visual mode, the default, never pays its cost. CodeEditor's
`cloud_editor` / `cloud_editor_dark` themes track the app's color mode.

### Keeping the two views in sync

The **single source of truth is the parsed workflow model**, not either view. Both
the canvas and the editor are projections of that model:

- An **editor edit** reparses the text; on a successful parse-and-validate the model
  updates and, in Split mode, the canvas **re-renders** from the new model (new nodes
  get the layered layout from section 8; existing nodes keep their saved positions).
  While the text is mid-edit and does not parse, the canvas holds its last valid
  render and the editor shows the parse/validation errors - it does not blank the
  canvas on every keystroke.
- A **canvas edit** (add/move/wire a node, change a property in the modal) updates
  the model and re-serializes to canonical text in the editor.
- Edits are **debounced** so re-render/re-serialize does not fire on every keystroke
  (ties into the performance levers already noted: debounce validation, don't
  recompute the whole graph mid-interaction).

The round-trip must be stable: serialize(parse(text)) is canonical, so switching
modes or editing in one view does not churn the other with cosmetic diffs.

## 11. Component library: AWS Cloudscape

The app is built with the **AWS Cloudscape Design System** React components
(`@cloudscape-design/components` + `@cloudscape-design/global-styles`), an
open-source design system (the evolution of AWS-UI) usable in any React app, not
only AWS consoles. This cuts the UI code we write: Cloudscape supplies the app
shell (`AppLayout` with side/tools panels), the `SegmentedControl` for the view-mode
switcher, `Modal`/`Form`/`FormField`/`Input`/`Select`/`Toggle` for the schema-driven
property editor, `Table` for the parameters panel, and the toast/flashbar for
validation feedback - all themed, accessible, and consistent out of the box.

Cloudscape and React Flow divide cleanly: **Cloudscape is the chrome, React Flow is
the canvas.** React Flow renders its own pannable canvas surface; Cloudscape frames
it (panels, toolbar, modals, forms) around that surface. They do not compete for the
same DOM, so there is no integration conflict - the canvas is one region inside the
Cloudscape `AppLayout` content area.

The schema-driven property modal (section 2) maps JSON Schema field types onto
Cloudscape form controls: string -> `Input`, int/float -> numeric `Input` (with
`min`/`max`), enum -> `Select`, bool -> `Toggle`, array -> a repeatable `Input` list
or `TokenGroup`, so the generated form is Cloudscape-native rather than hand-styled.

## 12. Build and tooling

A plain Vite + React + TypeScript static-site build. No Go toolchain, no `wails3`,
no cross-compilation in this phase.

- **Dev loop**: `vite` dev server with HMR.
- **Build**: `vite build` produces the static `dist/` (the deployable artifact, and
  the exact bundle a later Wails shell would `//go:embed`).
- **Lint/test**: ESLint plus the two-tier test strategy (Vitest unit/component with a
  100% coverage gate, Playwright E2E) - see section 13 for the full strategy and
  section 13's ESLint port. The point here is only that these run as package scripts
  in the same CI as `build`.
- **Package wiring**: `src/workflow-builder/` is an npm workspace package like the
  others; its `package.json` scripts (`dev`/`build`/`lint`/`test`) are the interface.
  A `Taskfile.yml` can wrap them to match the repo's Task-driven convention, but no
  Wails/Go targets exist until the deferred desktop phase.
- **No module path / go.mod** in this phase. The deferred Wails shell, if built,
  would add its own Go package (for example a sibling directory) and embed `dist/`.

## 13. Engineering discipline

These are hard requirements for the codebase from day one, not aspirations to retro-fit.

### Build order: the schema comes first

**The published `v1.json` JSON Schema must exist and be bundled before any other
builder work begins.** This is a hard ordering constraint, not a preference. The
schema is the contract everything else derives from: the node palette (which types
exist), the property forms (which fields each type has), and the continuous
validation that drives both the per-node markers and the editor annotations all
consume it. Building any of those before the schema
exists means inventing a provisional shape that then has to be reconciled - exactly
the drift the schema-driven design (section 2) is meant to prevent.

Note the ownership: the schema belongs to the **format**, not this app. It is defined
in the Workflow File Format work (`docs/Workflow-File-Format.md`); the builder
**bundles** that published schema and must never author a divergent copy of its own.

**Status: this precondition is now met.** The schema exists in the repo at
`schemas/workflow/v1.json`. "Schema first" is therefore satisfied, and the concrete
first build step is to vendor that exact file into
`src/workflow-builder/src/schema/v1.json` (a copy, kept in sync with the source of
truth), then write builder code (descriptors, forms, validation, canvas) test-first
against it. The field lists in this doc have been reconciled against that schema
(see the note below); where this doc and `v1.json` ever disagree, **the schema
wins**.

### Development methodology: test-driven

The app is built **test-first (red-green-refactor)**: write a test that asserts the
desired behavior, watch it fail, then write the minimum code to make it pass, then
refactor under the green test. This is the methodology, not a suggestion, because it
is what makes the 100% coverage gate (below) *meaningful*: coverage becomes a
byproduct of tests that assert real behavior, never a number backfilled by writing
code first and papering tests over it afterward. A test written after the code tends
to assert what the code happens to do; a test written first asserts what the code
should do.

How this lands across the two test tiers:

- **Pure logic and hooks (Vitest, the common case)**: this is where TDD is cleanest.
  Write the failing `expect(...)` against a not-yet-existing function or hook - a
  parse/serialize round-trip, schema validation of a known-bad document, cycle
  detection on a graph with a back edge, ELK layout determinism, a node descriptor's
  `toStep`/`fromStep` - then implement until green. The component architecture below
  (pure logic extracted out of components) exists precisely so most behavior is
  reachable this way, as a fast red-green loop.
- **Canvas interaction (Playwright, for the gestures jsdom cannot run)**: a drag,
  a port-to-port wire, a cycle-rejection, a double-click-to-edit still gets a
  **failing E2E spec written first** that asserts the user-visible outcome, then the
  wiring that satisfies it. The loop is slower than a unit test, so reserve it for
  genuinely interaction-level behavior; everything decomposable into pure logic is
  driven by a Vitest test first instead.
- **Components**: a presentational component gets a `@testing-library/react` test
  first asserting what it renders and emits for given props, then the implementation.

The discipline the gate enforces is "no untested code"; the discipline TDD adds is
"no test that only exists to satisfy the gate". Both are required.

### Component architecture: no god `App.tsx`

A recurring failure mode in past apps was piling logic and markup into `App.tsx`
until it became an untestable monolith. This app is built as **small, single-purpose,
reusable components with the logic extracted out of them**:

- `App.tsx` is a thin composition root only - it wires the Cloudscape `AppLayout`,
  the view-mode state, and the top-level panels together. It contains no business
  logic, no parsing, no layout math, no inlined event handlers of substance.
- **Pure logic lives outside components**, in plain TypeScript modules (`workflow/`
  parse-serialize-validate, `layout/` ELK layout, `nodes/` descriptors, `io/` file
  access). These are framework-free functions that are trivial to unit test without
  rendering anything.
- **Components are presentational and composed**: a `NodePalette`, a `WorkflowCanvas`
  wrapping React Flow, a `PropertyModal` that renders a form from a node descriptor,
  an `EditorPane` (Cloudscape CodeEditor), a `ViewModeControl`, a `ParametersPanel`, each in its own file
  with typed props and no hidden global state.
- **State is lifted into small hooks/stores** (for example a `useWorkflowModel` hook
  owning the single-source-of-truth model, section 10) rather than scattered through
  `useState` in a mega-component. Hooks are testable in isolation.

The test for whether a piece belongs in a component: if it can be a pure function or
a hook, it is one, and the component just calls it. This is what makes the 100%
coverage gate below achievable without contorted render tests.

### Testing strategy (two tiers: unit + E2E)

Testing is two distinct tiers with separate runners, run commands, and CI gates. They
are deliberately not merged: the 100% gate is a *unit* metric over logic and thin
components; the E2E tier proves real browser behavior and does **not** feed the unit
coverage number.

**Tier 1 - unit / component (Vitest):**

- **Runner**: Vitest (matching the main GUI's choice), with `@testing-library/react`
  for component tests and `@fast-check/vitest` for property-based tests where a pure
  function has an invariant worth proving (parse/serialize round-trip, layout
  determinism, cycle detection). Environment: jsdom (or happy-dom).
- **Coverage provider**: `v8` (or `istanbul`), reporting lines, functions, branches,
  and statements.
- **Coverage gate (settled): 100% across lines, functions, branches, and files**,
  enforced in `vitest.config.ts` under `test.coverage.thresholds` with
  `lines/functions/branches/statements: 100` and `100` per-file (`perFile: true`) so a
  single under-covered file fails the build, not just the aggregate. This is new code,
  so starting at 100% is cheap; it only gets expensive to adopt later.
- **Honesty about 100%**: the gate is real only if nothing is quietly excluded. The
  rule is that **coverage exclusions are the exception and must be justified in code**
  - a narrow `/* v8 ignore next */` with a reason comment, not blanket `exclude` globs
  that hollow out the number. Genuinely untestable glue (the Ace lazy-load/CodeEditor
  bootstrap, the `main.tsx` DOM mount) may be excluded explicitly and listed in this doc's
  rationale rather than silently dropped. The component architecture above is what
  keeps the honest number at 100% without heroics: pure logic is directly testable,
  and thin components have little uncovered surface.
- React Flow and the Ace-based CodeEditor do not fully render in jsdom, so Tier 1
  tests the logic (descriptors, layout math, parse/validate, the model hook) directly
  and mocks React Flow / the editor wrapper at its module boundary. Real canvas and
  editor interaction is Tier 2's job.
- **Cloudscape components are driven via Cloudscape's own test-utils, not raw
  Testing Library queries.** Import `createWrapper` from
  `@cloudscape-design/components/test-utils/dom` and use its component wrappers
  (`findSelect`, `findInput`, `findCheckbox`, `findSegmentedControl`, `findAppLayout`,
  `findAllFormFields`, ...) to find and operate controls. Cloudscape components (a
  `Select` especially) render DOM that raw `getByLabelText`/`getByRole` queries cannot
  reliably find or drive in jsdom; the wrappers expose the intended interactions
  (`openDropdown()`, `selectOptionByValue()`, `setInputValue()`). Raw Testing Library
  queries remain correct for plain semantic HTML a component renders itself (a `ul`,
  a heading); the rule applies specifically to Cloudscape components.

**Tier 2 - end-to-end canvas (Playwright):**

- **Runner**: Playwright, driving the real built app in a real browser (Chromium at
  minimum; WebKit/Firefox optional). It serves the static build (`vite preview`) or
  the dev server and exercises the interactions jsdom cannot: dragging a node from the
  palette onto the canvas, dragging a wire between ports (and confirming a
  cycle-creating connection is rejected), pan/zoom, double-click to open the property
  modal and edit a field, switching Visual/Editor/Split, and verifying an Editor edit
  re-renders the canvas in Split.
- **What it validates**: that React Flow and the CodeEditor actually render and wire
  up, and that a graph built on the canvas exports to a valid workflow file (and
  re-imports to the same graph). This is behavioral correctness of the integrated app, not line
  coverage.
- **Separate from the unit gate**: Playwright runs under its own command (for example
  `npm run e2e`) and its own CI step. Its pass/fail gates CI, but it is **not** merged
  into the Vitest coverage number - mixing browser coverage into the 100% gate would
  make the gate meaningless and flaky. The two tiers answer different questions.
- **Not in the fast loop**: E2E is heavier and slower, so it runs in CI and on demand,
  never in the unit watch loop.

**CI**: `npm test` (Vitest with the 100% coverage gate) and `npm run e2e`
(Playwright) run as separate steps alongside `lint` and `build`; a failure in any one
fails the package.

### ESLint: ported from the GUI, Angular stripped

The config is **copied from `src/gui/eslint.config.mjs`** so the two frontends share
one style identity, with the Angular-specific pieces removed and React/Vite pieces
added. Concretely:

Carried over unchanged (the project's real style identity):
- The entire `@stylistic` block: `indent: 4`, `arrow-parens`, `brace-style`,
  `comma-dangle: always-multiline` (arrays/objects/imports/exports/functions),
  `semi: always`, `array-element-newline` (minItems 3), `array-bracket-newline:
  consistent`, `quotes: single` (avoidEscape).
- Core/TS rules: `curly: all`, `@typescript-eslint/no-unused-vars` with
  `argsIgnorePattern: '^__'`, `no-sparse-arrays`, `no-dupe-keys`, and the
  `eslint.recommended` + `typescript-eslint` recommended/stylistic bases.

Removed (Angular-specific, no meaning in a React app):
- The `angular-eslint` import and `...angular.configs.tsRecommended`.
- `processor: angular.processInlineTemplates`.
- The `@angular-eslint/*` rule overrides (`prefer-standalone`,
  `prefer-on-push-component-change-detection`) and the `directive-selector` /
  `component-selector` (`fme` prefix) rules - React has no selectors.
- The entire `**/*.html` template block (`templateRecommended`,
  `templateAccessibility`, the template rule toggles) - React has no Angular templates.
- `.angular/` and `src/gen/` from `ignores` (neither exists here); keep `dist/`,
  `node_modules/`, `coverage/`.

Added (React/Vite equivalents):
- `files` globs extended to `**/*.{ts,tsx}`.
- `eslint-plugin-react`, `eslint-plugin-react-hooks` (the `rules-of-hooks` /
  `exhaustive-deps` rules), and `eslint-plugin-jsx-a11y` to preserve the
  accessibility intent the Angular template-accessibility config expressed, now for
  JSX.
- `parserOptions.project` pointed at this package's `tsconfig.json`.

The result is byte-for-byte the same formatting and TS-hygiene rules as the GUI, so a
developer moving between the two sees one consistent style, with React correctness and
a11y linting in place of the Angular-template rules.

## 14. Decisions

All v1 design decisions below are settled.

- **Build order (hard constraint)**: the published `v1.json` schema must exist and be
  bundled before any other builder work. The schema is owned by the format
  (`docs/Workflow-File-Format.md`), bundled here, never re-authored divergently.
  Everything else (palette, forms, validation, editor annotations) derives from it. See section 13.
- **Delivery**: a standalone static web app (built SPA, no backend), not a native
  binary. Wrappable in a Wails 3 desktop shell later with no frontend change;
  that path is deferred, not designed away.
- **Frontend framework**: React + React Flow (xyflow). Chosen for the node-canvas
  library specifically; the second-framework cost (main GUI is Angular) is
  contained to this standalone package.
- **Package location/name**: `src/workflow-builder/`, a self-contained frontend-only
  package (npm workspace), with room for a sibling Wails/Go shell directory later.
- **Schema source**: the builder bundles a copy of `v1.json` at build time (the
  version it was built against), rather than fetching the published URL at runtime.
  Offline-safe and deterministic; a format bump means a builder release that bundles
  the newer schema. Source of truth: `schemas/workflow/v1.json` (exists now); bundle
  target: `src/workflow-builder/src/schema/v1.json`.
- **v1 step-type extensibility**: the node palette and property forms are driven by
  the bundled schema's step-type `$defs`, so a new format step type appears as a
  palette node with no new form code. This is the schema-driven descriptor model
  from section 2, committed to as the architecture rather than left optional.
- **Layout persistence**: node positions are stored in `localStorage`, keyed by a
  stable file identity, and overlaid on a computed layout at open/import. Positions
  never enter the canonical workflow file or the published schema (see section 9 for
  the keying and its per-browser consequences).
- **Default layout**: a layered (Sugiyama) DAG layout via `elkjs` (ELK), with
  longest-path layering and crossing minimization, so a graph is readable on open and
  nodes never stack. **Fork/join (diamond) topologies minimize edge crossings as a
  requirement** - via ELK layer-sweep crossing minimization, dummy-node routing for
  layer-spanning edges, and balanced (Brandes-Koepf) placement. `dagre` is the
  lighter fallback. See section 8.
- **Flow direction**: user-switchable between left-to-right and top-to-bottom, as a
  parameter to the layout engine; the choice is a `localStorage` preference, never in
  the file.
- **View modes**: a Visual / Editor / Split segmented control. Editor mode uses the
  Cloudscape **CodeEditor** (Ace, lazy-loaded) over YAML/JSON; validation comes from
  our own schema layer and is surfaced as Ace annotations, not Ace's native checkers.
  In Split mode an editor edit re-renders the canvas from the reparsed model. The
  parsed model is the single source of truth both views project from. See section 10.
- **Component library**: AWS Cloudscape (`@cloudscape-design/components`) for all app
  chrome - layout, panels, segmented control, modal, forms, table - to minimize UI
  code. Cloudscape frames the app; React Flow renders the canvas inside it. See
  section 11.
- **Component architecture**: small single-purpose reusable components with pure
  logic extracted into framework-free modules and hooks; `App.tsx` is a thin
  composition root with no business logic. See section 13.
- **Development methodology**: test-driven (red-green-refactor). Tests asserting
  desired behavior are written first; code is written to satisfy them. This is what
  keeps the 100% gate meaningful (coverage as a byproduct of behavior tests, not a
  backfilled number). See section 13.
- **Testing (two tiers)**: Tier 1 unit/component via Vitest + `@testing-library/react`
  + `@fast-check/vitest`, with a **100% coverage gate across lines, functions,
  branches, and files** (per-file). Tier 2 end-to-end canvas via Playwright against the
  real built app (drag/wire/zoom/modal/view-mode flows). The two are separate CI steps;
  Playwright is **not** merged into the 100% unit coverage number. Exclusions are the
  justified in-code exception, never blanket globs. See section 13.
- **ESLint**: ported from `src/gui/eslint.config.mjs` for one shared style identity -
  all `@stylistic` and TS/core rules carried over verbatim, every Angular-specific
  piece removed, React correctness + JSX a11y added. See section 13.

All v1 design decisions are now settled; the doc is ready to drive scaffolding when
implementation starts.

### Deferred to later implementation

Explicitly out of v1, noted so they are not forgotten:

- **Draft autosave**: persisting the in-progress working model across reloads
  (`localStorage`/`IndexedDB`) so unsaved work survives a refresh. Skipped for v1 to
  keep it simple; nothing depends on it. (The node-position store in section 9 is a
  separate feature and is in v1.)

## 15. Suggested v1 scope (if you want a concrete target)

- **First, before anything else**: author/publish the format's `v1.json` and bundle it
  here; all builder work derives from it.
- Canvas with pan/zoom, drag from a palette of the four node types, wire ports to
  express `dependsOn`, cycle prevention at draw time, select/delete.
- Layered DAG auto-layout (ELK) on open/import so nodes are readable, not stacked;
  a flow-direction toggle (left-to-right / top-to-bottom) and a re-layout action.
- Double-click a node to open a schema-driven property modal; per-field validation.
- Visual / Editor / Split view modes, with the editor validating against the schema
  and Split keeping canvas and editor in sync from the parsed model.
- Document panel for `metadata`, `parameters`, and `defaults`.
- Continuous graph validation with per-node problem markers.
- Export to canonical YAML (and JSON), import an existing file with auto-layout.
- Browser file open/save (File System Access API with a file-input/download
  fallback) behind a small I/O abstraction, plus file-drop to open.
- Built with AWS Cloudscape components for the app chrome; React Flow for the canvas.
- Built test-first (red-green-refactor): behavior tests precede implementation.
- Vitest unit/component suite at a 100% coverage gate, plus a Playwright E2E suite for
  real canvas interaction, as separate CI steps.
- No daemon connection, no execution, no AWS backend - a pure static authoring site.


## 16. Implementation build order

Build bottom-up: pure logic first (fast Vitest loop, highest test leverage, carries
the real correctness burden), then layout, then UI cheapest-first, with the React
Flow canvas last because it is the only part gated on the slow Playwright loop and it
integrates everything beneath it. The schema (section 13) precedes all of it.

Logic core (pure TypeScript):

0. **Schema bundled** - prerequisite, done. `src/schema/v1.json` + the loader
   (step types derived from the schema, ajv validation).
1. **Node descriptors**: `Job` (done), then `Checksum`, `Sleep`, `InventoryReport`.
   Each maps a step type's `with` to a canvas node and back (`fromStep`/`toStep`),
   with its own nuance tested (Checksum `writeMhl` requires `mhlOutput`, Sleep
   duration-string shape, InventoryReport's reduced field set with no `prefix`).
2. **Descriptor registry** keyed by the schema's step-type enum (`STEP_TYPES`), so a
   new format step type becomes a palette node by registering a descriptor. This is
   the seam the palette and the graph serializer both consume.
3. **Graph model + serializer** (`workflow/`) - the keystone. `dependsOn` lives here
   (descriptors deliberately do not own it): `toWorkflow` walks nodes through their
   descriptors and reconstructs `dependsOn` from edges; `fromWorkflow` is the import
   direction; the round-trip invariant is a `@fast-check` property test; plus the
   graph validation the schema cannot express (unique ids, acyclicity, dependsOn
   integrity).
4. **Parameters + defaults resolution** and `${params.x}` substitution: the
   template-only lint and the resolve-then-validate pass. Independent of the canvas.

Layout:

5. **ELK layered layout + flow direction** (`layout/`): wrap `elkjs`, LR/TB
   parameter, the fork/join crossing-minimization settings (section 8). Testable on
   computed positions without rendering. Operates on the graph model, so it follows
   it.

UI, cheapest-first:

6. **Schema-driven property form** (`modal/`), rendered with Cloudscape controls -
   generated from a step type's `with` `$defs`. Mostly unit-testable, so before the
   canvas.
7. **Cloudscape app shell + view-mode control** (`app/`): AppLayout, the
   Visual/Editor/Split segmented control, panels. Thin composition.
8. **Editor pane** (`editor/`): Cloudscape CodeEditor (Ace, lazy-loaded) over
   YAML/JSON, with the model<->text sync and schema-driven annotations. After the
   shell; lower priority than the canvas since Visual is the primary mode.
9. **React Flow canvas** (`canvas/`): drag, port-to-port wiring, cycle prevention at
   draw time, selection. Last of the build - it consumes descriptors, the graph
   model, the layout engine and the modal, and it is the piece gated on Playwright
   rather than fast unit tests.
10. **Import/Export wiring** (`io/`) + browser file dialogs: connect the file
    open/save abstraction to the serializer. Mostly glue once 3 and 9 exist.
11. **Playwright E2E suite**: the Tier-2 flows (drag/wire/zoom/modal/view-mode,
    export-then-reimport equality) once the canvas is interactive.

Rationale: logic before pixels means the canvas is a view over already-proven state;
the graph model (3) is third because everything visual is a projection of it; the
canvas is last because it is the integration point and the only part on the slow
test loop.
