import { expect } from '@playwright/test';
import { test, imageBuffer, loadImage, canvasCenter, drag, saveScene } from './editor-helpers';

test('Space pans from focused controls without drawing or activating the focused tool', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'Requires a pointer and hardware keyboard');
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pen"]').click();
  const before = await saveScene(page);
  await page.locator('[data-style="width"]').click();
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down('Space');
  await expect(page.locator('#stage')).toHaveAttribute('data-space-pan', 'held');
  await page.mouse.down();
  await page.mouse.move(center.x + 30, center.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const scene = await saveScene(page);
  expect(scene.viewport.tx).toBeGreaterThan(before.viewport.tx + 25);
  expect(scene.objects).toHaveLength(0);
  await page.locator('.toolrail [data-tool="rect"]').focus();
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.locator('.toolrail [data-tool="rect"]')).toHaveAttribute('aria-pressed', 'false');
});

test('shows a hover ghost over the artboard and hides it on leave', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'Hover preview requires a pointer');
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pen"]').click();
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-visible', 'true');
  await page.mouse.move(0, 0);
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-visible', 'false');
  await page.locator('.toolrail [data-tool="rect"]').click();
  await page.mouse.move(center.x, center.y);
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-visible', 'true');
  expect((await saveScene(page)).objects).toHaveLength(0);
});

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

test('creates every drawing and content tool with the expected object type', async ({ page }) => {
  await loadImage(page);
  const strokes: Array<[string, [number, number], [number, number], number?]> = [
    ['rect', [-135, -95], [-85, -55]],
    ['ellipse', [-70, -95], [-20, -55]],
    ['line', [-5, -75], [45, -75]],
    ['arrow', [60, -95], [120, -55]],
    ['pen', [-135, -20], [-75, 15], 12],
    ['highlighter', [-60, -15], [15, 5], 12],
    ['redaction', [30, -25], [90, 15]],
    ['symbol', [105, -25], [140, 10]],
  ];
  for (const [tool, from, to, steps] of strokes) {
    await page.locator(`.toolrail [data-tool="${tool}"]`).click();
    await drag(page, from, to, steps);
  }

  await page.locator('.toolrail [data-tool="counter"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x - 100, center.y + 70);
  await page.mouse.click(center.x - 55, center.y + 70);

  await page.locator('.toolrail [data-tool="text"]').click();
  await page.mouse.click(center.x + 10, center.y + 70);
  await expect(page.locator('.text-editor')).toBeVisible();
  await page.locator('.text-editor').fill('Review this');
  await page.locator('.text-editor').blur();

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.toolrail [data-tool="image"]').click();
  await (await chooser).setFiles({ name: 'placed.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toHaveText('Image added');

  const scene = await saveScene(page);
  expect(scene.objects.map((object: any) => object.type)).toEqual([
    'rect', 'ellipse', 'line', 'arrow', 'pen', 'highlighter', 'redaction', 'symbol', 'counter', 'counter', 'text', 'image',
  ]);
  expect(scene.objects.find((object: any) => object.type === 'pen').points.length).toBeGreaterThan(5);
  expect(scene.objects.find((object: any) => object.type === 'highlighter').points.length).toBeGreaterThan(5);
  expect(scene.objects.filter((object: any) => object.type === 'counter').map((object: any) => object.n)).toEqual([1, 2]);
  expect(scene.objects.find((object: any) => object.type === 'text').text).toBe('Review this');
});

test('keeps pen and highlighter settings independent and draws over existing markup', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="highlighter"]').click();
  await expect(page.locator('[data-style="width"]')).toHaveValue('22');
  await expect(page.locator('[data-style="opacity"]')).toHaveValue('50');
  await drag(page, [-80, 0], [80, 0], 15);

  await page.locator('.toolrail [data-tool="pen"]').click();
  await expect(page.locator('[data-style="width"]')).toHaveValue('4');
  await drag(page, [0, -55], [0, 55], 15);

  let scene = await saveScene(page);
  expect(scene.objects).toHaveLength(2);
  expect(scene.activeTool).toBe('pen');
  expect(scene.selectedId).toBeNull();
  expect(scene.objects[0]).toMatchObject({ type: 'highlighter', style: { width: 22, opacity: 0.5 } });
  expect(scene.objects[1]).toMatchObject({ type: 'pen', style: { width: 4, opacity: 1 } });

  await page.locator('.toolrail [data-tool="select"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  scene = await saveScene(page);
  expect(scene.selectedId).toBe(scene.objects[1].id);
});

test('edits styles and deletes the selected canvas object with the keyboard', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-80, -50], [80, 50]);
  await page.locator('.toolrail [data-tool="select"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.getByRole('button', { name: 'Toggle fill' }).click();
  await page.locator('[data-style="color"]').fill('#00ff00');
  await page.locator('[data-style="width"]').fill('12');
  await page.locator('[data-style="opacity"]').fill('60');
  await page.getByRole('button', { name: 'Send to back' }).click();

  await page.keyboard.press('Delete');
  await expect(page.locator('#status')).toHaveText('Object deleted');
  expect((await saveScene(page)).objects).toHaveLength(0);

  await page.getByText('Edit', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Undo/ }).click();
  const restored = await saveScene(page);
  expect(restored.objects[0].style).toMatchObject({ color: '#00ff00', width: 12, opacity: 0.6, fill: '#17c0b8' });
  await page.getByText('Edit', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Redo/ }).click();
  expect((await saveScene(page)).objects).toHaveLength(0);
});

test('offers and applies the standard color palette', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await page.locator('[data-color-presets="color"]').getByRole('button', { name: 'Purple' }).click();
  await page.getByRole('button', { name: 'Extra heavy stroke' }).click();
  await drag(page, [-40, -30], [40, 30]);

  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'rect', style: { color: '#7030a0', width: 40 } });
});

test('uses Shift and Alt or Option modifiers while resizing', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-80, -40], [80, 40]);
  await page.locator('.toolrail [data-tool="select"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);

  let rotateCursor = '';
  for (let offset = -50; offset >= -150 && !rotateCursor.includes('data:image/svg+xml'); offset -= 4) {
    await page.mouse.move(center.x, center.y + offset);
    rotateCursor = await page.locator('.stage-host canvas:not(.tool-preview)').evaluate((canvas) => canvas.style.cursor);
  }
  if (await page.evaluate(() => matchMedia('(pointer: fine)').matches)) expect(rotateCursor).toContain('data:image/svg+xml');

  await page.keyboard.down('Shift');
  await page.keyboard.down('Alt');
  await page.mouse.move(center.x + 80, center.y + 40);
  await page.mouse.down();
  await page.mouse.move(center.x + 120, center.y + 90);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.keyboard.up('Shift');

  const scene = await saveScene(page);
  const bounds = scene.objects[0].rect;
  expect(bounds.w / bounds.h).toBeCloseTo(2, 3);
  expect(bounds.x + bounds.w / 2).toBeCloseTo(160, 3);
  expect(bounds.y + bounds.h / 2).toBeCloseTo(120, 3);
});

test('keeps drawing tools active and selects finished shapes', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-80, -50], [80, 50]);

  let scene = await saveScene(page);
  expect(scene.objects).toHaveLength(1);
  expect(scene.activeTool).toBe('rect');
  expect(scene.selectedId).toBe(scene.objects[0].id);

  await drag(page, [-140, -90], [-100, -60]);
  scene = await saveScene(page);
  expect(scene.objects).toHaveLength(2);
  expect(scene.selectedId).toBe(scene.objects[1].id);

  await page.locator('.toolrail [data-tool="select"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  scene = await saveScene(page);
  expect(scene.selectedId).toBe(scene.objects[0].id);
});

test('edits selected object dimensions using preferred units and an aspect-ratio lock', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-50, -25], [50, 25]);
  const dimensions = page.locator('[data-selection-dimensions]');
  const width = dimensions.locator('[data-selection-size="width"]');
  const height = dimensions.locator('[data-selection-size="height"]');
  const aspect = dimensions.locator('[data-action="toggle-selection-aspect"]');
  await expect(dimensions).toBeVisible();
  const initialWidth = Number(await width.inputValue());
  const initialHeight = Number(await height.inputValue());
  const doubledWidth = Number((initialWidth * 2).toFixed(2));
  const independentWidth = Number((initialWidth * 3).toFixed(2));

  await width.fill(String(doubledWidth));
  await width.press('Tab');
  expect(Number(await height.inputValue())).toBeCloseTo(initialHeight * 2, 1);
  const linkedHeight = Number(await height.inputValue());
  await width.fill(String(independentWidth));
  await aspect.click();
  await expect(aspect).toHaveAttribute('aria-pressed', 'false');
  expect(Number(await height.inputValue())).toBeCloseTo(linkedHeight, 1);
  await height.fill('40');
  await height.press('Tab');
  expect(Number(await width.inputValue())).toBeCloseTo(independentWidth, 1);

  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'Preferences' }).click();
  await page.locator('#preferences-dialog [name="measurementUnit"]').selectOption('cm');
  await page.locator('#preferences-dialog [name="measurementPpi"]').fill('100');
  await page.locator('#preferences-dialog button[value="apply"]').click();
  await expect(dimensions.locator('[data-selection-unit]').first()).toHaveText('cm');
  expect(Number(await width.inputValue())).toBeCloseTo(independentWidth / 100 * 2.54, 2);
  await expect(height).toHaveValue('1.016');
  const scene = await saveScene(page);
  expect(scene.objects[0].rect.w).toBeCloseTo(independentWidth);
  expect(scene.objects[0].rect.h).toBeCloseTo(40);
});

test('supports visual line caps, persistent rail colors, and draggable options', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="line"]').click();
  // Desktop floating panel; phone dragging is covered in 'mobile layout'.
  if (!(await page.evaluate(() => matchMedia('(max-width: 760px)').matches))) {
    const before = await page.locator('.optionsbar').boundingBox();
    const handle = page.locator('[data-options-drag-handle]');
    await handle.dragTo(page.locator('.stage-host'), { targetPosition: { x: 900, y: 80 } });
    const moved = await page.locator('.optionsbar').boundingBox();
    expect(moved!.x).toBeGreaterThan(before!.x + 100);
  }

  await page.getByRole('button', { name: 'Butt line cap' }).click();
  await page.locator('[data-rail-color="color"]').fill('#00ff00');
  await drag(page, [-120, -40], [-40, -40]);
  const scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'line', style: { color: '#00ff00', lineCap: 'butt' } });

  for (const tool of ['pen', 'arrow', 'highlighter']) {
    await page.locator(`.toolrail [data-tool="${tool}"]`).click();
    await expect(page.locator('[data-options="line-join"]')).toBeHidden();
  }
});

test('applies independent arrowheads and rotates a line from its rotation handle', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="arrow"]').click();
  await page.locator('[data-style="arrow-start"]').selectOption('circle');
  await page.locator('[data-style="arrow-end"]').selectOption('stealth');
  await page.getByRole('button', { name: 'Square line cap' }).click();
  await drag(page, [-80, 0], [80, 0]);

  let scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'arrow', startHead: 'circle', endHead: 'stealth', style: { lineCap: 'square' } });

  await page.locator('.toolrail [data-tool="select"]').click();
  scene = await saveScene(page);
  let canvas = await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  const initialCanvas = canvas;
  const arrow = scene.objects[0];
  const center = { x: (arrow.start.x + arrow.end.x) / 2, y: (arrow.start.y + arrow.end.y) / 2 };
  const padding = arrow.style.width / 2;
  const toScreen = (point: { x: number; y: number }) => ({ x: initialCanvas.x + scene.viewport.tx + point.x * scene.viewport.scale, y: initialCanvas.y + scene.viewport.ty + point.y * scene.viewport.scale });
  const lineCenter = toScreen(center);
  await page.mouse.click(lineCenter.x, lineCenter.y);
  scene = await saveScene(page);
  expect(scene.selectedId).toBe(scene.objects[0].id);
  canvas = await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  const selectedToScreen = (point: { x: number; y: number }) => ({ x: canvas!.x + scene.viewport.tx + point.x * scene.viewport.scale, y: canvas!.y + scene.viewport.ty + point.y * scene.viewport.scale });
  const endPoint = selectedToScreen(arrow.end);
  await page.mouse.move(endPoint.x, endPoint.y);
  await expect(page.locator('.stage-host canvas:not(.tool-preview)')).toHaveCSS('cursor', 'move');
  const grip = selectedToScreen({ x: center.x, y: center.y - padding - 24 });
  const rotated = selectedToScreen({ x: center.x + padding + 24, y: center.y });
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(rotated.x, rotated.y, { steps: 5 });
  await page.mouse.up();
  scene = await saveScene(page);
  expect(scene.objects[0].rotation).toBeCloseTo(Math.PI / 2, 1);
});

test('draws a constrained ellipse from its center with Alt or Option and Shift', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="ellipse"]').click();
  const center = await canvasCenter(page);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 45, center.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');

  const ellipse = (await saveScene(page)).objects[0];
  expect(ellipse.type).toBe('ellipse');
  expect(ellipse.rect.w).toBeCloseTo(ellipse.rect.h, 5);
  expect(ellipse.rect.x + ellipse.rect.w / 2).toBeCloseTo(160, 5);
  expect(ellipse.rect.y + ellipse.rect.h / 2).toBeCloseTo(120, 5);
});

test('enables the Layers delete button only while a deletable layer is selected', async ({ page }) => {
  await loadImage(page);
  const trash = page.locator('[data-action="delete-selected-layers"]');
  await expect(trash).toBeDisabled();
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-60, -40], [60, 40]);
  await expect(trash).toBeEnabled();
  await page.locator('#stage').focus();
  await page.keyboard.press('Escape');
  await expect(trash).toBeDisabled();
});

test('keeps Layers separate, draggable, reorderable, and lock-aware', async ({ page }) => {
  await loadImage(page);
  const panel = page.locator('.layers-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.optionsbar')).toHaveCount(0);
  const compactLayers = await panel.evaluate(() => matchMedia('(max-width: 760px), (pointer: coarse)').matches);
  if (compactLayers) {
    await expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect((await panel.boundingBox())!.height).toBeLessThan(60);
  } else {
    await expect(panel).toHaveCSS('resize', 'both');
    await page.getByRole('button', { name: 'Collapse Layers panel' }).click();
    expect((await panel.boundingBox())!.height).toBeLessThan(60);
    await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  }
  const panelBefore = await panel.boundingBox();
  if (!compactLayers) {
    const layerHandle = await page.locator('[data-layers-drag-handle]').boundingBox();
    await page.mouse.move(layerHandle!.x + layerHandle!.width / 2, layerHandle!.y + layerHandle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(layerHandle!.x + layerHandle!.width / 2, layerHandle!.y + layerHandle!.height / 2 + 140, { steps: 5 });
    await page.mouse.up();
    const panelAfter = await panel.boundingBox();
    expect(Math.abs(panelAfter!.x - panelBefore!.x) + Math.abs(panelAfter!.y - panelBefore!.y)).toBeGreaterThan(40);
  }

  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-70, -50], [70, 50]);
  await page.locator('.toolrail [data-tool="ellipse"]').click();
  await drag(page, [-70, -50], [70, 50]);
  if (compactLayers) await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  await expect(page.locator('[data-layer-id]')).toHaveCount(2);
  await expect(page.locator('[data-layer-id]').first()).toHaveAttribute('data-layer-type', 'ellipse');

  await page.locator('.toolrail [data-tool="select"]').click();
  await page.locator('[data-layer-type="ellipse"] [data-action="select-layer"]').click();
  const center = await canvasCenter(page);
  await page.locator('[data-layer-type="ellipse"] [data-action="toggle-layer-lock"]').click();
  await expect(page.locator('[data-layer-type="ellipse"] [data-action="toggle-layer-lock"]')).toHaveAttribute('aria-pressed', 'true');
  if (compactLayers) await page.getByRole('button', { name: 'Collapse Layers panel' }).click();
  await page.mouse.click(center.x, center.y);
  let scene = await saveScene(page);
  expect(scene.objects.find((object: any) => object.type === 'ellipse').locked).toBe(true);
  expect(scene.objects.find((object: any) => object.id === scene.selectedId).type).toBe('rect');

  if (compactLayers) await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  await page.locator('[data-layer-type="ellipse"] [data-action="select-layer"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-layer-id][data-selected="true"]')).toHaveCount(2);
  await page.locator('[data-layer-type="ellipse"] [data-action="toggle-layer-lock"]').click();
  await page.locator('[data-layer-type="rect"]').dragTo(page.locator('[data-layer-type="ellipse"]'), { targetPosition: { x: 60, y: 2 } });
  await expect(page.locator('[data-layer-id]').first()).toHaveAttribute('data-layer-type', 'rect');
  await page.locator('[data-layer-type="ellipse"] [data-action="delete-layer"]').click();
  scene = await saveScene(page);
  expect(scene.objects).toHaveLength(1);
  expect(scene.objects[0].type).toBe('rect');
});

test('hides and restores artwork from the Layers visibility control', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-70, -50], [70, 50]);
  const panel = page.locator('.layers-panel');
  if (await panel.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();

  const row = page.locator('[data-layer-type="rect"]');
  await expect(row.getByRole('button', { name: 'Hide Rect' })).toBeVisible();
  await row.getByRole('button', { name: 'Hide Rect' }).click();
  await expect(row).toHaveAttribute('data-hidden', 'true');
  let scene = await saveScene(page);
  expect(scene.objects[0].hidden).toBe(true);
  expect(scene.selectedId).toBeNull();

  await row.getByRole('button', { name: 'Show Rect' }).click();
  await expect(row).toHaveAttribute('data-hidden', 'false');
  scene = await saveScene(page);
  expect(scene.objects[0].hidden).toBe(false);
});

test('duplicates and deletes layers from the layer context menu', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-50, -35], [50, 35]);
  const panel = page.locator('.layers-panel');
  if (await panel.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();

  await page.locator('[data-layer-type="rect"] [data-action="select-layer"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Duplicate layer/ }).click();
  await expect(page.locator('[data-layer-type="rect"]')).toHaveCount(2);
  let scene = await saveScene(page);
  expect(scene.objects[1].rect).toMatchObject({ x: scene.objects[0].rect.x + 10, y: scene.objects[0].rect.y + 10 });

  await page.locator('[data-layer-type="rect"]').first().locator('[data-action="select-layer"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete layer/ }).click();
  await expect(page.locator('[data-layer-type="rect"]')).toHaveCount(1);
  scene = await saveScene(page);
  expect(scene.objects).toHaveLength(1);
});

test('duplicates selected artwork with Control+D and one undo step', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="ellipse"]').click();
  await drag(page, [-60, -40], [60, 40]);

  const original = (await saveScene(page)).objects[0];
  await page.keyboard.press('Control+d');
  await expect(page.locator('#status')).toHaveText('Object duplicated');
  let scene = await saveScene(page);
  expect(scene.objects).toHaveLength(2);
  expect(scene.objects[1].id).not.toBe(original.id);
  expect(scene.objects[1].rect).toMatchObject({ x: original.rect.x + 10, y: original.rect.y + 10, w: original.rect.w, h: original.rect.h });
  expect(scene.selectedId).toBe(scene.objects[1].id);

  await page.getByText('Edit', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Undo/ }).click();
  scene = await saveScene(page);
  expect(scene.objects).toHaveLength(1);
  expect(scene.objects[0].id).toBe(original.id);
});

test('uses Shift for contiguous layer ranges and Control for individual rows', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  for (let index = 0; index < 5; index++) await drag(page, [-140 + index * 45, -70], [-110 + index * 45, -40]);

  const panel = page.locator('.layers-panel');
  if (await panel.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  const rows = page.locator('[data-layer-id]');
  await expect(rows).toHaveCount(5);
  await rows.nth(0).locator('[data-action="select-layer"]').click();
  await rows.nth(4).locator('[data-action="select-layer"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-layer-id][data-selected="true"]')).toHaveCount(5);

  await rows.nth(4).locator('[data-action="select-layer"]').click();
  await rows.nth(0).locator('[data-action="select-layer"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-layer-id][data-selected="true"]')).toHaveCount(5);

  await rows.nth(2).locator('[data-action="select-layer"]').click({ modifiers: ['Control'] });
  await expect(page.locator('[data-layer-id][data-selected="true"]')).toHaveCount(4);

  await rows.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename layer' }).click();
  const rename = page.locator('.layer-name-input');
  await rename.fill('Review callout');
  await rename.press('Enter');
  await expect(page.locator('.layer-name', { hasText: 'Review callout' })).toHaveCount(1);
  expect((await saveScene(page)).objects).toContainEqual(expect.objectContaining({ layerName: 'Review callout' }));
});

test('marquee selects multiple objects and deletes them together', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-120, -60], [-70, -20]);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-40, -60], [10, -20]);
  expect((await saveScene(page)).objects).toHaveLength(2);

  await page.locator('.toolrail [data-tool="select"]').click();
  await drag(page, [-150, -85], [40, 15], 12);
  await expect(page.locator('#active-tool-name')).toHaveText('2 selected');

  await page.keyboard.press('Delete');
  await expect(page.locator('#status')).toHaveText('2 objects deleted');
  expect((await saveScene(page)).objects).toHaveLength(0);
});

test('marquee group can be dragged to move every selected object together', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-120, -60], [-70, -20]);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-40, -60], [10, -20]);

  await page.locator('.toolrail [data-tool="select"]').click();
  await drag(page, [-150, -85], [40, 15], 12);
  await expect(page.locator('#active-tool-name')).toHaveText('2 selected');

  const before = (await saveScene(page)).objects.map((o: any) => ({ x: o.rect.x, y: o.rect.y }));
  await drag(page, [-95, -40], [-45, 10], 8); // grab inside the first rect and drag the group
  const after = (await saveScene(page)).objects.map((o: any) => ({ x: o.rect.x, y: o.rect.y }));

  const d0 = { x: after[0].x - before[0].x, y: after[0].y - before[0].y };
  const d1 = { x: after[1].x - before[1].x, y: after[1].y - before[1].y };
  expect(d0.x).toBeGreaterThan(1);
  expect(d0.y).toBeGreaterThan(1);
  expect(d1.x).toBeCloseTo(d0.x, 1);
  expect(d1.y).toBeCloseTo(d0.y, 1);
});

test('opens object actions on right-click and deletes the selected object', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-60, -40], [60, 40]);
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y, { button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Delete/ }).click();
  await expect(page.locator('#status')).toHaveText('Object deleted');
  expect((await saveScene(page)).objects).toHaveLength(0);
});

test('opens About from Help and links to the creator and repository', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Help', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'About imagemarkup' }).click();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#about-dialog')).toContainText('Created by Mark Bradley (BRADSEC).');
  await expect(page.locator('#about-dialog a', { hasText: 'BRADSEC' })).toHaveAttribute('href', 'https://github.com/bradsec');
  await expect(page.locator('#about-dialog a', { hasText: 'View imagemarkup on GitHub' })).toHaveAttribute('href', 'https://github.com/bradsec/imagemarkup');
  await expect(page.locator('#about-dialog')).toContainText('If you find this useful, please consider starring the repository. It helps others discover the project.');
  await expect(page.locator('#about-dialog a', { hasText: 'Ko-fi' })).toHaveAttribute('href', 'https://ko-fi.com/bradsec');
  await expect(page.locator('#about-dialog a', { hasText: 'View third-party licenses' })).toHaveAttribute('href', './THIRD-PARTY-LICENSES.txt');
  await expect(page.locator('#about-dialog a')).toHaveCount(4);
});

