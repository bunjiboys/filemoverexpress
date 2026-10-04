import { expect, test } from '@playwright/test';
import { expectEditorToContain, flowNode, openApp, openNodeModal, selectViewMode } from './helpers';

// Tier-2 property-modal flow (docs section 2): double-click a node to open the
// schema-driven property editor, edit a field, save, and see the change reflected on
// the canvas and in the serialized document. The modal's field generation is unit
// tested; this proves the double-click wiring and the modal<->model save path.

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('double-click opens the schema-driven property modal for a node', async ({ page }) => {
    await openNodeModal(page, 'verify');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Edit Checksum step');
    // The name field is seeded from the node, and the Checksum payload fields render.
    await expect(page.getByTestId('node-name').locator('input')).toHaveValue('Verify + write MHL');
    await expect(dialog).toContainText(/algorithm/i);
});

test('editing a node name and saving updates the canvas node', async ({ page }) => {
    await openNodeModal(page, 'settle');
    const nameInput = page.getByTestId('node-name').locator('input');
    await nameInput.fill('Pause for ingest to settle');
    await page.getByTestId('modal-save').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(flowNode(page, 'settle')).toContainText('Pause for ingest to settle');
});

test('cancel discards edits', async ({ page }) => {
    await openNodeModal(page, 'settle');
    await page.getByTestId('node-name').locator('input').fill('Discarded name');
    await page.getByTestId('modal-cancel').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(flowNode(page, 'settle')).toContainText('Settle before archive');
});

test('a modal save flows through to the serialized editor text', async ({ page }) => {
    await openNodeModal(page, 'inventory');
    await page.getByTestId('node-name').locator('input').fill('Snapshot the capture bucket');
    await page.getByTestId('modal-save').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    // Switch to Editor and confirm the canonical document carries the new name.
    await selectViewMode(page, 'Editor');
    await expectEditorToContain(page, 'Snapshot the capture bucket');
});

test('delete from the modal removes the node', async ({ page }) => {
    await openNodeModal(page, 'inventory');
    await page.getByTestId('modal-delete').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(flowNode(page, 'inventory')).toHaveCount(0);
});
