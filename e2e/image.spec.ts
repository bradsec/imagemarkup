import { expect, type Locator } from '@playwright/test';
import { createCanvas, loadImage as loadCanvasImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { test, imageBuffer, loadImage, drag, saveScene, canvasColorPixelCount } from './editor-helpers';

test('File Open replaces the base image while the place-image tool is active', async ({ page }) => {
  await loadImage(page);
  const placeChooser = page.waitForEvent('filechooser');
  await page.locator('.toolrail [data-tool="image"]').click();
  await (await placeChooser).setFiles({ name: 'placed.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toHaveText('Image added');

  const openChooser = page.waitForEvent('filechooser');
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Open image/ }).click();
  const replaceConfirm = page.waitForEvent('dialog');
  await (await openChooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: imageBuffer });
  const dialog = await replaceConfirm;
  expect(dialog.message()).toBe('Open a new image? This replaces the current image and markup.');
  await dialog.accept();
  await expect(page.locator('#status')).toHaveText('320 x 240');

  expect((await saveScene(page)).objects).toEqual([]);
});

test('pans, zooms, fits, and restores actual size from View controls', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pan"]').click();
  await drag(page, [-30, 0], [45, 30]);
  const panned = (await saveScene(page)).viewport;

  await page.locator('.app-menu > summary', { hasText: 'View' }).click();
  await page.locator('details[open]').getByRole('button', { name: /Zoom in/ }).click();
  await expect(page.locator('#zoom-value')).not.toHaveText('100%');
  await page.locator('.app-menu > summary', { hasText: 'View' }).click();
  await page.locator('details[open]').getByRole('button', { name: /Fit image/ }).click();
  const fitted = (await saveScene(page)).viewport;
  expect(fitted.tx).not.toBe(panned.tx);

  await page.locator('.app-menu > summary', { hasText: 'View' }).click();
  await page.locator('details[open]').getByRole('button', { name: /Actual size/ }).click();
  expect((await saveScene(page)).viewport.scale).toBe(1);
});

test('toggles overflow visibility and explains transparent export behavior', async ({ page }) => {
  await loadImage(page);
  await page.locator('.app-menu > summary', { hasText: 'View' }).click();
  const overflow = page.locator('details[open]').getByRole('button', { name: /Show overflow/ });
  await expect(overflow).toHaveAttribute('aria-pressed', 'false');
  await overflow.click();
  const project = await saveScene(page);
  expect(project.showOverflow).toBe(true);
  project.objects.push({ id: 'outside', type: 'rect', rect: { x: 330, y: 50, w: 30, h: 30 }, style: { color: '#ff0000', fill: '#ff0000', stroke: false, width: 1, opacity: 1 } });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[accept^=".imgmarkup"]').setInputFiles({ name: 'overflow.imgmarkup', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('#status')).toHaveText('Project opened');

  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Export image/ }).click();
  await expect(page.locator('[data-export-overflow-note]')).toHaveText('Overflow expands the export with a transparent background.');
  const pngDownload = page.waitForEvent('download');
  await page.locator('#export-dialog button[value="download"]').click();
  const pngPath = await (await pngDownload).path();
  if (!pngPath) throw new Error('PNG download path unavailable');
  const png = await loadCanvasImage(await readFile(pngPath));
  expect(png.width).toBe(360);
  const decoded = createCanvas(png.width, png.height);
  decoded.getContext('2d').drawImage(png, 0, 0);
  expect(decoded.getContext('2d').getImageData(325, 60, 1, 1).data[3]).toBe(0);
  expect(decoded.getContext('2d').getImageData(335, 60, 1, 1).data[0]).toBeGreaterThan(200);

  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Export image/ }).click();
  await page.locator('#export-dialog [name="format"]').selectOption('jpeg');
  await expect(page.locator('[data-export-overflow-note]')).toHaveText('Overflow expands the export; JPG fills transparent areas with white.');
  await page.locator('#export-dialog button[value="cancel"]').click();
});

test('opens working image, frame, transform, and export menus', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Image', { exact: true }).click();
  await expect(page.locator('details[open]').getByRole('button', { name: 'Rotate, flip, resize' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await loadImage(page);

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();
  await expect(page.locator('#frame-dialog')).toBeVisible();
  await page.locator('#frame-dialog [name="borderWidth"]').fill('8');
  await page.locator('#frame-dialog [name="watermarkText"]').fill('CONFIDENTIAL');
  await page.locator('#frame-dialog [name="watermarkColor"]').fill('#ffcc00');
  await page.locator('#frame-dialog [name="watermarkFont"]').selectOption('Poppins');
  await page.locator('#frame-dialog [data-action="toggle-watermark-bold"]').click();
  await page.locator('#frame-dialog [data-action="toggle-watermark-italic"]').click();
  await page.locator('#frame-dialog [name="watermarkTile"]').check();
  await page.locator('#frame-dialog [name="watermarkAngle"]').fill('-35');
  await page.locator('#frame-dialog button[value="apply"]').click();
  await expect(page.locator('#frame-dialog')).toBeHidden();

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Rotate, flip, resize' }).click();
  await expect(page.locator('#transform-dialog')).toBeVisible();
  await page.locator('#transform-dialog button[value="rotate-right"]').click();
  await expect(page.locator('#transform-dialog')).toBeHidden();
  const scene = await saveScene(page);
  expect(scene.image).toMatchObject({ width: 240, height: 320 });
  expect(scene.border).toEqual({ width: 8, color: '#12161f' });
  expect(scene.watermark).toMatchObject({ kind: 'text', text: 'CONFIDENTIAL', color: '#ffcc00', angle: -35, tile: true, fontFamily: 'Poppins', fontWeight: 'bold', fontStyle: 'italic' });

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();
  await expect(page.locator('#frame-dialog [name="watermarkText"]')).toHaveValue('CONFIDENTIAL');
  await expect(page.locator('#frame-dialog [name="watermarkAngle"]')).toHaveValue('-35');
  await expect(page.locator('#frame-dialog [name="watermarkFont"]')).toHaveValue('Poppins');
  await expect(page.locator('#frame-dialog [data-action="toggle-watermark-bold"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#frame-dialog button[value="cancel"]').click();

  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Export image/ }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const quality = page.locator('#export-dialog [name="quality"]');
  await expect(quality).toBeHidden();
  await expect(quality).toBeDisabled();
  await page.locator('#export-dialog [name="format"]').selectOption('jpeg');
  await expect(quality).toBeVisible();
  await expect(quality).toBeEnabled();
  await quality.fill('72');
  await expect(page.locator('[data-value="jpg-quality"]')).toHaveText('72%');
  await page.locator('#export-dialog [name="scale"]').selectOption('2');
  const download = page.waitForEvent('download');
  await page.locator('#export-dialog button[value="download"]').click();
  expect((await download).suggestedFilename()).toBe('imagemarkup.jpg');
});

test('updates the paired resize dimension when aspect ratio is locked', async ({ page }) => {
  await loadImage(page);
  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Rotate, flip, resize' }).click();
  const width = page.locator('#transform-dialog [name="resizeWidth"]');
  const height = page.locator('#transform-dialog [name="resizeHeight"]');
  const lock = page.locator('#transform-dialog [name="lockAspect"]');

  await width.fill('640');
  await width.press('Tab');
  await expect(height).toHaveValue('480');
  await height.fill('120');
  await height.press('Tab');
  await expect(width).toHaveValue('160');
  await lock.uncheck();
  await width.fill('800');
  await width.press('Tab');
  await expect(height).toHaveValue('120');
  await page.locator('#transform-dialog button[value="cancel"]').click();
});

test('scales existing annotations when the base image is resized', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-40, -30], [40, 30]);
  const before = await saveScene(page);

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Rotate, flip, resize' }).click();
  await page.locator('#transform-dialog [name="lockAspect"]').uncheck();
  await page.locator('#transform-dialog [name="resizeWidth"]').fill('640');
  await page.locator('#transform-dialog [name="resizeHeight"]').fill('120');
  await page.locator('#transform-dialog button[value="resize"]').click();

  const after = await saveScene(page);
  expect(after.image).toMatchObject({ width: 640, height: 120 });
  expect(after.objects[0].rect).toMatchObject({
    x: before.objects[0].rect.x * 2,
    y: before.objects[0].rect.y * .5,
    w: before.objects[0].rect.w * 2,
    h: before.objects[0].rect.h * .5,
  });
});

test('persists measurement and selection preferences', async ({ page }) => {
  await page.goto('/');
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Preferences' }).click();
  await expect(page.locator('#preferences-dialog [data-preference="measurement-resolution"]')).toBeHidden();
  await page.locator('#preferences-dialog [name="measurementUnit"]').selectOption('cm');
  await expect(page.locator('#preferences-dialog [data-preference="measurement-resolution"]')).toBeVisible();
  await page.locator('#preferences-dialog [name="measurementPpi"]').fill('300');
  await page.locator('#preferences-dialog [name="selectionColor"]').fill('#ef4444');
  await page.locator('#preferences-dialog button[value="apply"]').click();
  await expect(page.locator('#status')).toHaveText('Preferences saved');

  await page.reload();
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Preferences' }).click();
  await expect(page.locator('#preferences-dialog [name="measurementUnit"]')).toHaveValue('cm');
  await expect(page.locator('#preferences-dialog [name="measurementPpi"]')).toHaveValue('300');
  await expect(page.locator('#preferences-dialog [name="selectionColor"]')).toHaveValue('#ef4444');
});

test('remembers Options positions per tool and the Layers position', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  const options = page.locator('.optionsbar');
  const layers = page.locator('.layers-panel');
  // Desktop panel memory; phone dragging and clamping are covered in 'mobile layout'.
  if (await page.evaluate(() => matchMedia('(max-width: 760px)').matches)) return;

  const movePanel = async (handle: Locator, dx: number, dy: number) => {
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 5 });
    await page.mouse.up();
  };
  await movePanel(page.locator('[data-options-drag-handle]'), 110, 75);
  const rectPosition = await options.boundingBox();

  await page.locator('.toolrail [data-tool="ellipse"]').click();
  const ellipsePosition = await options.boundingBox();
  expect(Math.abs(ellipsePosition!.x - rectPosition!.x) + Math.abs(ellipsePosition!.y - rectPosition!.y)).toBeGreaterThan(30);
  await page.locator('.toolrail [data-tool="rect"]').click();
  expect((await options.boundingBox())!.x).toBeCloseTo(rectPosition!.x, 0);
  expect((await options.boundingBox())!.y).toBeCloseTo(rectPosition!.y, 0);

  await movePanel(page.locator('[data-layers-drag-handle]'), -70, 85);
  const layersPosition = await layers.boundingBox();
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  expect((await options.boundingBox())!.x).toBeCloseTo(rectPosition!.x, 0);
  expect((await options.boundingBox())!.y).toBeCloseTo(rectPosition!.y, 0);
  expect((await layers.boundingBox())!.x).toBeCloseTo(layersPosition!.x, 0);
  expect((await layers.boundingBox())!.y).toBeCloseTo(layersPosition!.y, 0);
});

test('resets persisted panels, colors, and preferences without clearing artwork', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('imagemarkup.preferences', JSON.stringify({ measurementUnit: 'cm', measurementPpi: 300, selectionColor: '#ef4444' }));
  });
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await page.locator('[data-style="color"]').fill('#7030a0');
  await drag(page, [-40, -30], [40, 30]);
  await page.locator('[data-layer-type="rect"] [data-action="select-layer"]').evaluate((button: HTMLElement) => button.click());
  expect(await canvasColorPixelCount(page, [239, 68, 68])).toBeGreaterThan(0);
  await page.evaluate(() => {
    localStorage.setItem('imagemarkup.panel-layout', JSON.stringify({ tools: { rect: { left: 140, top: 120 } }, layers: { left: 420, top: 110 } }));
  });

  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Reset settings' }).click();
  await expect(page.locator('#status')).toHaveText('Settings reset to defaults');
  await expect(page.locator('[data-style="color"]')).toHaveValue('#ff3b30');
  await expect(page.locator('.optionsbar')).not.toHaveAttribute('data-moved', 'true');
  await expect(page.locator('.layers-panel')).not.toHaveAttribute('data-moved', 'true');
  expect(await page.evaluate(() => [localStorage.getItem('imagemarkup.preferences'), localStorage.getItem('imagemarkup.panel-layout')])).toEqual([null, null]);

  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Preferences' }).click();
  await expect(page.locator('#preferences-dialog [name="measurementUnit"]')).toHaveValue('px');
  await expect(page.locator('#preferences-dialog [name="measurementPpi"]')).toHaveValue('96');
  await expect(page.locator('#preferences-dialog [name="selectionColor"]')).toHaveValue('#17c0b8');
  await page.locator('#preferences-dialog button[value="cancel"]').click();
  await page.locator('[data-layer-type="rect"] [data-action="select-layer"]').evaluate((button: HTMLElement) => button.click());
  expect(await canvasColorPixelCount(page, [23, 192, 184])).toBeGreaterThan(0);
  expect(await canvasColorPixelCount(page, [239, 68, 68])).toBe(0);
  expect((await saveScene(page)).objects).toHaveLength(1);
});

test('preserves an image watermark when frame settings are reopened and reapplied', async ({ page }) => {
  await loadImage(page);
  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();
  await page.locator('#frame-dialog [name="watermarkImage"]').setInputFiles({ name: 'watermark.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.locator('#frame-dialog [name="watermarkScale"]').fill('30');
  await page.locator('#frame-dialog [name="watermarkAngle"]').fill('45');
  await page.locator('#frame-dialog button[value="apply"]').click();

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();
  await page.locator('#frame-dialog [name="watermarkOpacity"]').fill('50');
  await page.locator('#frame-dialog button[value="apply"]').click();
  expect((await saveScene(page)).watermark).toMatchObject({ kind: 'image', scale: .3, angle: 45, opacity: .5 });

  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();
  await page.locator('#frame-dialog button[value="remove-watermark"]').click();
  expect((await saveScene(page)).watermark).toBeNull();
});

test('fits every tool option row inside the desktop options panel', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'iPhone layouts are covered by iphone-overlays.spec.ts');
  await loadImage(page);
  for (const tool of ['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'counter', 'symbol', 'redaction']) {
    await page.locator(`.toolrail [data-tool="${tool}"]`).click();
    const overflow = await page.locator('.optionsbar').evaluate((bar) => bar.scrollWidth - bar.clientWidth);
    expect(overflow, `${tool} options overflow`).toBeLessThanOrEqual(0);
  }
});

test('pressing Enter in a resize field resizes instead of rotating', async ({ page }) => {
  await loadImage(page);
  await page.getByText('Image', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Rotate, flip, resize' }).click();
  const width = page.locator('#transform-dialog [name="resizeWidth"]');
  await width.fill('160');
  await expect(page.locator('#transform-dialog [name="resizeHeight"]')).toHaveValue('120');
  await width.press('Enter');
  await expect(page.locator('#transform-dialog')).not.toHaveAttribute('open', '');
  expect((await saveScene(page)).image).toMatchObject({ width: 160, height: 120 });
});

test('toggles rulers from the View menu and remembers the choice', async ({ page }) => {
  await loadImage(page);
  const rulers = page.locator('.rulers');
  await expect(rulers).toBeHidden();
  await page.locator('details.app-menu > summary', { hasText: 'View' }).click();
  await page.locator('[data-action="toggle-rulers"]').click();
  await expect(page.locator('[data-action="toggle-rulers"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(rulers).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('imagemarkup.preferences') ?? '{}').showRulers)).toBe(true);
  // After reload, autosave may restore the previous image first; accept the replacement prompt if it appears.
  page.on('dialog', (dialog) => dialog.accept());
  await loadImage(page);
  await expect(page.locator('.rulers')).toBeVisible();
});
