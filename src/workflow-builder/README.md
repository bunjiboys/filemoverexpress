# FME Workflow Builder

A standalone static web app for building FME Workflow files visually: drag step
nodes onto a canvas, wire them to express dependencies, double-click to edit
properties, and export a valid `fme.workflow.yaml`. It is a builder and validator,
not a runner - the FME daemon executes workflows.

Design: `docs/designs/workflows/Workflow-Builder-App.md`. File format: `docs/designs/workflows/Workflow-File-Format.md`.

## Stack

- React + Vite (static SPA, no backend; Wails-wrappable later)
- React Flow (`@xyflow/react`) for the node canvas
- AWS Cloudscape for the app chrome
- ELK (`elkjs`) for layered DAG auto-layout
- Monaco (lazy-loaded) for the raw Editor / Split modes
- `ajv` validating against the bundled `src/schema/v1.json`

`src/schema/v1.json` is a byte-exact copy of the repository's authoritative
`schemas/workflow/v1.json`. The builder bundles it and never authors a divergent
copy; where this app and that schema disagree, the schema wins.

## Development

Built test-first (red-green-refactor) with a 100% coverage gate.

```bash
npm run dev        # Vite dev server (HMR)
npm test           # Vitest unit/component + 100% coverage gate
npm run test:watch # Vitest watch loop
npm run e2e        # Playwright E2E against the built app
npm run lint       # ESLint (ported from src/gui, Angular stripped)
npm run build      # tsc --noEmit + vite build -> dist/
```
