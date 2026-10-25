import { expect } from '@playwright/test';
import { test, imageBuffer } from './editor-helpers';

test('does not report browser errors when the pointer moves before an image is loaded', async ({ page }) => {
  await page.goto('/');
  const stage = await page.locator('.stage-host').boundingBox();
  if (!stage) throw new Error('Stage is not visible');
  await page.mouse.move(stage.x + 20, stage.y + 20);
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2, { steps: 5 });
});

test('opens the file picker only from the empty-state Load image button', async ({ page }) => {
  await page.goto('/');
  const loadButton = page.getByRole('button', { name: 'Load image' });
  await expect(loadButton).toBeVisible();

  let chooserOpened = false;
  page.on('filechooser', () => { chooserOpened = true; });
  await page.locator('.stage-host').click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(100);
  expect(chooserOpened).toBe(false);

  const chooser = page.waitForEvent('filechooser');
  await loadButton.click();
  await (await chooser).setFiles({ name: 'initial.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toContainText('320 x 240');
});

test('shows a dismissible image load error beside the stage', async ({ page }) => {
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.load-error [role="alert"]')).toHaveText('Could not decode that image');
  await expect(page.locator('#status')).toHaveText('Image load failed');
  await page.locator('.load-error button').click();
  await expect(page.locator('.load-error')).toBeHidden();
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('.load-error')).toBeHidden();
});

test('keeps the load error inside the stage at a 320 by 256 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  const notice = page.locator('.load-error');
  await expect(notice).toBeVisible();
  const stage = await page.locator('#stage').boundingBox();
  const box = await notice.boundingBox();
  if (!stage || !box) throw new Error('Stage or notice bounds unavailable');
  expect(box.x).toBeGreaterThanOrEqual(stage.x);
  expect(box.y).toBeGreaterThanOrEqual(stage.y);
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
  expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
});

test('highlights the stage during a file drag without flicker over children', async ({ page }) => {
  await page.goto('/');
  const stage = page.locator('#stage');
  await stage.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'sample.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(stage).toHaveClass(/dragover/);
  await stage.evaluate((element) => {
    const child = element.querySelector('.empty-state')!;
    element.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: child }));
  });
  await expect(stage).toHaveClass(/dragover/);
  await stage.evaluate((element) => element.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  await expect(stage).not.toHaveClass(/dragover/);
});

test('shows only the hint relevant to the active tool or selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#canvas-instructions')).toHaveText('');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'quadrants.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#canvas-instructions')).toContainText('Click an object to select');

  await page.locator('.toolrail [data-tool="rect"]').click();
  await expect(page.locator('#canvas-instructions')).toHaveText('Drag to draw · Shift constrains · Alt/Option draws from center');
  await page.locator('.toolrail [data-tool="pen"]').click();
  await expect(page.locator('#canvas-instructions')).toHaveText('Drag to draw a freehand stroke');
});
