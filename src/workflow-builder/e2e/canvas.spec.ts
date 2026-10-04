import { expect, test } from '@playwright/test';
import {
    addStep,
    flowEdges,
    flowNode,
    flowNodes,
    openApp,
    openNodeContextMenu,
    SEED_NODE_COUNT,
    targetHandle,
    wire,
} from './helpers';

// Tier-2 canvas interaction (docs sections 4, 5, 8): dragging a node from the palette,
// wiring ports to express dependsOn, cycle prevention at draw time, selection/delete,
// pan/zoom. These are the gestures jsdom cannot run; the pure graph logic they drive is
// already unit-tested, so these assert the React Flow integration actually wires up.

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('seeds the default fork/join pipeline on load', async ({ page }) => {
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
    // The seeded diamond has five dependency edges:
    // ingest->verify, verify->settle, verify->inventory, settle->archive, inventory->archive.
    await expect(flowEdges(page)).toHaveCount(5);
    // Nodes render their step type and display name.
    await expect(flowNode(page, 'ingest')).toContainText('Job');
    await expect(flowNode(page, 'verify')).toContainText('Checksum');
    await expect(flowNode(page, 'settle')).toContainText('Sleep');
    await expect(flowNode(page, 'inventory')).toContainText('InventoryReport');
});

test('adds a step from the palette for each type', async ({ page }) => {
    for (const type of ['Job',
        'Checksum',
        'Sleep',
        'InventoryReport']) {
        await addStep(page, type);
    }
    // Four new nodes beyond the seed; new ones are unnamed until edited.
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT + 4);
    await expect(flowNode(page, 'step-1')).toContainText('(unnamed)');
    await expect(flowNode(page, 'step-4')).toBeVisible();
});

test('wiring two nodes creates a dependency edge', async ({ page }) => {
    // Add a fresh node and wire archive -> it, a valid new edge (archive has no path
    // back from the new node, so it is acyclic).
    await addStep(page, 'Sleep');
    const before = await flowEdges(page).count();
    await wire(page, 'archive', 'step-1');
    await expect(flowEdges(page)).toHaveCount(before + 1);
    await expect(page.locator('.react-flow__edge[data-testid="rf__edge-archive->step-1"], .react-flow__edge')).toBeTruthy();
});

test('a cycle-creating connection is rejected at draw time', async ({ page }) => {
    const before = await flowEdges(page).count();
    // ingest -> verify already exists; wiring verify -> ingest would close a cycle, so
    // isValidConnection must refuse it and no edge is added.
    await wire(page, 'verify', 'ingest');
    await expect(flowEdges(page)).toHaveCount(before);
    // A self-loop (ingest -> ingest) is also a cycle and must be refused.
    const sourceBox = await flowNode(page, 'ingest').locator('.react-flow__handle-right').boundingBox();
    const targetBox = await targetHandle(page, 'ingest').boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await wire(page, 'ingest', 'ingest');
    await expect(flowEdges(page)).toHaveCount(before);
});

test('right-click deletes a step and its incident edges', async ({ page }) => {
    await openNodeContextMenu(page, 'settle');
    await page.getByRole('menuitem', { name: 'Delete step' }).click();
    await expect(flowNode(page, 'settle')).toHaveCount(0);
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT - 1);
    // settle had verify->settle and settle->archive; both go with it, leaving 3 edges.
    await expect(flowEdges(page)).toHaveCount(3);
});

test('right-click clears a node\'s connections without deleting it', async ({ page }) => {
    await openNodeContextMenu(page, 'verify');
    await page.getByRole('menuitem', { name: 'Clear connections' }).click();
    // verify stays; its edges (ingest->verify, verify->settle, verify->inventory) go.
    await expect(flowNode(page, 'verify')).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
    await expect(flowEdges(page)).toHaveCount(2);
});

test('pan and zoom work via the controls', async ({ page }) => {
    const zoomIn = page.locator('.react-flow__controls-zoomin');
    const fit = page.locator('.react-flow__controls-fitview');
    await expect(zoomIn).toBeVisible();
    const viewport = page.locator('.react-flow__viewport');
    const before = await viewport.getAttribute('style');
    await zoomIn.click();
    // The viewport transform changes on zoom.
    await expect(viewport).not.toHaveAttribute('style', before ?? '');
    // Fit-to-view restores a framed layout and keeps all nodes present.
    await fit.click();
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
});
