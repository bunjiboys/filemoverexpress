import { expect, type Locator, type Page } from '@playwright/test';

// Shared helpers for the Tier-2 Playwright suite (docs/Workflow-Builder-App.md
// sections 10, 13). These drive the REAL built app in a real browser: the gestures
// jsdom cannot run (drag, port-to-port wiring, cycle rejection, double-click modal,
// view-mode switching, file open/save). The Tier-1 Vitest suite proves the pure logic;
// this tier proves the integrated app renders and wires up.

// The app seeds a realistic fork/join pipeline on load (App.tsx INITIAL_GRAPH):
// ingest -> verify -> {settle, inventory} -> archive, five named nodes.
export const SEED_NODE_IDS = ['ingest',
    'verify',
    'settle',
    'inventory',
    'archive'] as const;
export const SEED_NODE_COUNT = SEED_NODE_IDS.length;

// Open the app and wait for the React Flow canvas to render its seeded nodes. The
// first-load fit runs after nodes are measured, so waiting on a node being visible is
// the reliable "canvas ready" signal.
export async function openApp(page: Page): Promise<void> {
    await page.goto('/');
    await expect(page.locator('[data-testid="canvas-pane"]')).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
}

// Force the File System Access API off BEFORE the app script runs, so open() and
// save() take their deterministic fallbacks (hidden <input> and Blob download) that
// Playwright can drive, instead of the native dialogs it cannot. Must be called before
// page.goto. See io/file-access.ts.
export async function forceFileFallbacks(page: Page): Promise<void> {
    await page.addInitScript(() => {
        // Deleting is enough: file-access.ts branches on `typeof showSaveFilePicker ===
        // 'function'`, so an absent picker routes to the input/download fallback.
        delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
        delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    });
}

// All React Flow node elements on the canvas.
export function flowNodes(page: Page): Locator {
    return page.locator('.react-flow__node');
}

// A single React Flow node by its model id (React Flow sets data-id on each node).
export function flowNode(page: Page, id: string): Locator {
    return page.locator(`.react-flow__node[data-id="${id}"]`);
}

// All dependency wires currently drawn.
export function flowEdges(page: Page): Locator {
    return page.locator('.react-flow__edge');
}

// Add a step of the given type via the "Add step" dropdown (schema-driven item list).
export async function addStep(page: Page, type: string): Promise<void> {
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByRole('menuitem', { name: type, exact: true }).click();
}

// Open a node's property modal by double-clicking it, and wait for the modal to show.
export async function openNodeModal(page: Page, id: string): Promise<void> {
    await flowNode(page, id).dblclick();
    await expect(page.getByRole('dialog')).toBeVisible();
}

// Right-click a node to raise the custom context menu (role="menu").
export async function openNodeContextMenu(page: Page, id: string): Promise<void> {
    await flowNode(page, id).click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
}

// Switch the Visual/Editor/Split view mode via the Cloudscape SegmentedControl.
export async function selectViewMode(page: Page, label: 'Visual' | 'Editor' | 'Split'): Promise<void> {
    await page.getByRole('button', { name: label, exact: true }).click();
}

// The dependency handle a wire is dragged FROM (the source/output port, right side).
export function sourceHandle(page: Page, id: string): Locator {
    return flowNode(page, id).locator('.react-flow__handle-right');
}

// The dependency handle a wire is dragged TO (the target/input port, left side).
export function targetHandle(page: Page, id: string): Locator {
    return flowNode(page, id).locator('.react-flow__handle-left');
}

// Drag a wire from one node's source handle to another's target handle, which React
// Flow turns into an onConnect call -> controller.connect -> a `source -> target`
// dependency edge (unless isValidConnection rejects it). Uses explicit mouse steps
// because React Flow's connection drag tracks pointermove and needs intermediate
// moves to register the drop target.
export async function wire(page: Page, sourceId: string, targetId: string): Promise<void> {
    const from = sourceHandle(page, sourceId);
    const to = targetHandle(page, targetId);
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    if (fromBox === null || toBox === null) {
        throw new Error(`handle not visible: ${sourceId} -> ${targetId}`);
    }
    const start = { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height / 2 };
    const end = { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Intermediate moves so React Flow's connection line follows and the target handle
    // registers as the drop endpoint.
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
}

// The full canonical document text in the editor, read through the Ace editor's own
// API rather than scraping the DOM. Ace VIRTUALIZES its lines - only the visible rows
// render into .ace_line, and off-screen rows are padded with placeholder glyphs - so
// reading .ace_line text is unreliable for any content scrolled out of view. The Ace
// editor instance's getValue() returns the whole document regardless of scroll. The
// editor is the canvas's text projection, so this is the serialized workflow for
// round-trip assertions. Switch to Editor/Split mode first.
export async function editorText(page: Page): Promise<string> {
    const editorPane = page.locator('[data-testid="editor-pane"] .ace_editor');
    await expect(editorPane).toBeVisible();
    return page.evaluate(() => {
        const el = document.querySelector('[data-testid="editor-pane"] .ace_editor') as unknown as {
            env?: { editor?: { getValue: () => string } };
        } | null;
        return el?.env?.editor?.getValue() ?? '';
    });
}

// Wait until the Ace editor has mounted and holds a document, then run `fn` against its
// current full value. Used by assertions that must see the whole (possibly scrolled)
// document, which toContainText on the virtualized DOM cannot guarantee.
export async function expectEditorToContain(page: Page, substring: string): Promise<void> {
    await expect(async () => {
        const text = await editorText(page);
        expect(text).toContain(substring);
    }).toPass({ timeout: 10_000 });
}

// Replace the entire editor document by driving the Ace editor instance directly
// (setValue with cursor at -1 so Ace does not keep a selection). Typing into Ace is
// unreliable because of auto-indent; setValue is deterministic. The controlled
// onDelayedChange fires from this, pushing the new text into the app model.
export async function setEditorText(page: Page, text: string): Promise<void> {
    await page.evaluate((value) => {
        const el = document.querySelector('[data-testid="editor-pane"] .ace_editor') as unknown as {
            env?: { editor?: { setValue: (v: string, cursor?: number) => void } };
        } | null;
        el?.env?.editor?.setValue(value, -1);
    }, text);
}
