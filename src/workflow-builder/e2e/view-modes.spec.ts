import { expect, test } from '@playwright/test';
import {
    editorText,
    expectEditorToContain,
    flowNode,
    flowNodes,
    openApp,
    SEED_NODE_COUNT,
    selectViewMode,
    setEditorText,
} from './helpers';

// Tier-2 view-mode flow (docs section 10): the Visual / Editor / Split segmented
// control, and the single-source-of-truth sync - an Editor edit re-renders the canvas
// in Split, both views being projections of the one parsed model. The sync logic is
// unit tested; this proves the integrated three-mode workspace and the live editor ->
// canvas re-render in a real browser with the real Ace editor.
//
// Editor content is read/written through the Ace editor instance (helpers), not the
// DOM: Ace virtualizes its lines, so off-screen content never renders into .ace_line.

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('Visual shows only the canvas', async ({ page }) => {
    await expect(page.locator('[data-testid="canvas-pane"]')).toBeVisible();
    await expect(page.locator('[data-testid="editor-pane"]')).toHaveCount(0);
});

test('Editor shows only the editor', async ({ page }) => {
    await selectViewMode(page, 'Editor');
    await expect(page.locator('[data-testid="editor-pane"]')).toBeVisible();
    await expect(page.locator('[data-testid="canvas-pane"]')).toHaveCount(0);
    // The editor opens on the canonical document, which carries the seeded metadata
    // (read via the Ace API; the metadata block may be scrolled out of the DOM).
    await expectEditorToContain(page, 'Nightly media ingest and archive');
});

test('Split shows both panes', async ({ page }) => {
    await selectViewMode(page, 'Split');
    await expect(page.locator('[data-testid="canvas-pane"]')).toBeVisible();
    await expect(page.locator('[data-testid="editor-pane"]')).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
});

test('an Editor edit re-renders the canvas in Split', async ({ page }) => {
    await selectViewMode(page, 'Split');
    await expect(flowNode(page, 'settle')).toBeVisible();

    // Take the full canonical document from the Ace model, rename the "settle" step's
    // display name in the text, and write it back through the Ace instance. The
    // controlled editor's onDelayedChange pushes the new text into the app model.
    const current = await editorText(page);
    expect(current).toContain('Settle before archive');
    const mutated = current.replace('Settle before archive', 'Hold before archive');
    expect(mutated).not.toEqual(current);
    await setEditorText(page, mutated);

    // The canvas, projecting the reparsed model, now shows the new name on the node.
    await expect(flowNode(page, 'settle')).toContainText('Hold before archive', { timeout: 10_000 });
});
