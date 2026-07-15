import { expect, test, type Locator, type Page } from '@playwright/test';
import { createCanvas, loadImage as loadCanvasImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';

const fixture = createCanvas(320, 240);
const fixtureContext = fixture.getContext('2d');
fixtureContext.fillStyle = '#e84c3d';
fixtureContext.fillRect(0, 0, 160, 120);
fixtureContext.fillStyle = '#36a269';
fixtureContext.fillRect(160, 0, 160, 120);
fixtureContext.fillStyle = '#3679c9';
fixtureContext.fillRect(0, 120, 160, 120);
fixtureContext.fillStyle = '#f2cf45';
fixtureContext.fillRect(160, 120, 160, 120);
const imageBuffer = fixture.toBuffer('image/png');

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

async function loadImage(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'quadrants.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toContainText('320 x 240');
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 1): Promise<void> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x + from[0], center.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(center.x + to[0], center.y + to[1], { steps });
  await page.mouse.up();
}

async function saveScene(page: Page): Promise<any> {
  const download = page.waitForEvent('download');
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Save project/ }).click();
  const path = await (await download).path();
  if (!path) throw new Error('Project download path unavailable');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function canvasColorPixelCount(page: Page, color: [number, number, number]): Promise<number> {
  return page.locator('canvas').evaluate((canvas, expected) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === expected[0] && pixels[index + 1] === expected[1] && pixels[index + 2] === expected[2] && pixels[index + 3] > 0) count += 1;
    }
    return count;
  }, color);
}

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

test('File Open replaces the base image while the place-image tool is active', async ({ page }) => {
  await loadImage(page);
  const placeChooser = page.waitForEvent('filechooser');
  await page.locator('.toolrail [data-tool="image"]').click();
  await (await placeChooser).setFiles({ name: 'placed.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toHaveText('Image added');

  const openChooser = page.waitForEvent('filechooser');
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Open image/ }).click();
  await (await openChooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toHaveText('320 x 240');

  expect((await saveScene(page)).objects).toEqual([]);
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

test('offers and applies the Microsoft standard color palette', async ({ page }) => {
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
    rotateCursor = await page.locator('canvas').evaluate((canvas) => canvas.style.cursor);
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
  if (await page.locator('.topbar-actions').isHidden()) {
    await expect(dimensions).toBeHidden();
    return;
  }
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
  if (await page.locator('.optionsbar').evaluate((element) => getComputedStyle(element).position === 'absolute')) {
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
  let canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  const arrow = scene.objects[0];
  const center = { x: (arrow.start.x + arrow.end.x) / 2, y: (arrow.start.y + arrow.end.y) / 2 };
  const padding = arrow.style.width / 2;
  const toScreen = (point: { x: number; y: number }) => ({ x: canvas.x + scene.viewport.tx + point.x * scene.viewport.scale, y: canvas.y + scene.viewport.ty + point.y * scene.viewport.scale });
  const lineCenter = toScreen(center);
  await page.mouse.click(lineCenter.x, lineCenter.y);
  scene = await saveScene(page);
  expect(scene.selectedId).toBe(scene.objects[0].id);
  canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  const selectedToScreen = (point: { x: number; y: number }) => ({ x: canvas!.x + scene.viewport.tx + point.x * scene.viewport.scale, y: canvas!.y + scene.viewport.ty + point.y * scene.viewport.scale });
  const endPoint = selectedToScreen(arrow.end);
  await page.mouse.move(endPoint.x, endPoint.y);
  await expect(page.locator('canvas')).toHaveCSS('cursor', 'move');
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

test('supports multiline text and independent counter sequence, shape, and font sizes', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  await page.mouse.click(center.x - 80, center.y - 50);
  await expect(page.locator('.text-editor')).toHaveValue('');
  await expect(page.locator('.text-editor')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.text-editor')).toHaveCSS('border-top-width', '0px');
  await page.locator('.text-editor').fill('First line\nSecond line\nThird line');
  await page.locator('.text-editor').blur();

  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.getByRole('button', { name: 'Letter counters' }).click();
  await page.locator('[data-style="counter-size"]').fill('30');
  await page.locator('[data-style="counter-font-size"]').fill('12');
  await page.mouse.click(center.x + 80, center.y + 50);
  const scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'text', text: 'First line\nSecond line\nThird line' });
  expect(scene.objects[1]).toMatchObject({ type: 'counter', format: 'alpha', radius: 30, fontSize: 12 });
});

test('offers standard presets and an image picker for counter text color', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.locator('[data-color-presets="counter-text-color"]').getByRole('button', { name: 'Purple' }).click();
  await expect(page.locator('[data-style="counter-text-color"]')).toHaveValue('#7030a0');

  const center = await canvasCenter(page);
  await page.getByRole('button', { name: 'Pick counter text color from image' }).click();
  await page.mouse.click(center.x - 80, center.y - 60);
  await expect(page.locator('[data-style="counter-text-color"]')).toHaveValue('#e84c3d');
  await page.mouse.click(center.x, center.y);

  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'counter', textColor: '#e84c3d' });
});

test('remembers rich text defaults and offers local bundled fonts and common sizes', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  await expect(page.locator('[data-style="font"]')).toHaveValue('Kalam');
  await page.locator('[data-style="font-size"]').fill('55.8258');
  await page.locator('[data-style="font-size"]').blur();
  await expect(page.locator('[data-style="font-size"]')).toHaveValue('56');
  await page.locator('[data-style="font"]').selectOption('Poppins');
  await page.locator('[data-style="font-size-preset"]').selectOption('48');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByRole('button', { name: 'Italic' }).click();
  await page.getByRole('button', { name: 'Underline' }).click();
  await page.getByRole('button', { name: 'Justify text' }).click();
  await page.mouse.click(center.x - 80, center.y - 40);
  await page.locator('.text-editor').fill('First justified line\nSecond line');
  await page.keyboard.press('Escape');

  await page.locator('.toolrail [data-tool="text"]').click();
  await expect(page.locator('[data-style="font"]')).toHaveValue('Poppins');
  await expect(page.locator('[data-style="font-size"]')).toHaveValue('48');
  await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Justify text' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(center.x + 40, center.y + 40);
  await page.locator('.text-editor').fill('Same defaults');
  await page.keyboard.press('Escape');

  const scene = await saveScene(page);
  expect(scene).toMatchObject({ fontFamily: 'Poppins', fontSize: 48, fontWeight: 'bold', fontStyle: 'italic', textUnderline: true, textAlign: 'justify' });
  for (const object of scene.objects) expect(object).toMatchObject({ type: 'text', fontFamily: 'Poppins', fontSize: 48, fontWeight: 'bold', fontStyle: 'italic', underline: true, align: 'justify' });
});

test('persists uploaded fonts for later sessions', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  await page.locator('[data-font-upload]').setInputFiles({ name: 'My Team Font.woff2', mimeType: 'font/woff2', buffer: await readFile('public/fonts/google/lato-400.woff2') });
  await expect(page.locator('#status')).toHaveText('Font added');
  await expect(page.locator('[data-style="font"]')).toHaveValue('My Team Font');

  await page.reload();
  await expect(page.locator('[data-style="font"] option[value="My Team Font"]')).toHaveCount(1);
  await expect(page.locator('[data-style="counter-font"] option[value="My Team Font"]')).toHaveCount(1);
});

test('starts and resets the step counter at a chosen value', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.locator('[data-style="counter-next"]').fill('7');
  await page.mouse.click(center.x - 50, center.y);
  await page.mouse.click(center.x, center.y);
  await page.getByRole('button', { name: 'Reset counter to one' }).click();
  await page.mouse.click(center.x + 50, center.y);

  const scene = await saveScene(page);
  expect(scene.objects.map((object: any) => object.n)).toEqual([7, 8, 1]);
  expect(scene.counterNext).toBe(2);
});

test('edits one existing counter value without changing the sequence or its neighbours', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.locator('[data-style="counter-next"]').fill('7');
  await page.mouse.click(center.x - 50, center.y);
  await page.mouse.click(center.x, center.y);
  await page.mouse.click(center.x + 50, center.y);

  await saveScene(page);
  await page.locator('.toolrail [data-tool="select"]').click();
  const layers = page.locator('.layers-panel');
  if (await layers.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  await page.locator('[data-layer-id]').last().locator('[data-action="select-layer"]').click();
  await expect(page.locator('[data-style="counter-value"]')).toHaveValue('7');
  await page.locator('[data-style="counter-value"]').fill('42');
  await page.locator('[data-style="counter-value"]').blur();

  const scene = await saveScene(page);
  expect(scene.objects.map((object: any) => object.n)).toEqual([42, 8, 9]);
  expect(scene.counterNext).toBe(10);
});

test('Escape commits inline text and returns to the Move tool', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.locator('.text-editor').fill('Finished with Escape');

  await page.keyboard.press('Escape');

  await expect(page.locator('.text-editor')).toBeHidden();
  await expect(page.locator('.toolrail [data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
  const scene = await saveScene(page);
  expect(scene).toMatchObject({ activeTool: 'select', selectedId: null });
  expect(scene.objects).toContainEqual(expect.objectContaining({ type: 'text', text: 'Finished with Escape' }));
});

test('edits existing text at a caret without selecting the whole object', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  await page.mouse.click(center.x - 80, center.y);
  await page.locator('.text-editor').fill('Editable text');
  await page.keyboard.press('Escape');

  await page.locator('.toolrail [data-tool="text"]').click();
  await page.mouse.click(center.x - 45, center.y - 10);
  const editor = page.locator('.text-editor');
  await expect(page.getByRole('textbox', { name: 'Edit text' })).toBeVisible();
  await expect(editor).toHaveValue('Editable text');
  expect(await editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart === (element as HTMLTextAreaElement).selectionEnd)).toBe(true);

  const editorBox = await editor.boundingBox();
  await page.mouse.move(editorBox!.x + 5, editorBox!.y + editorBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(editorBox!.x + Math.min(80, editorBox!.width - 3), editorBox!.y + editorBox!.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    return input.selectionEnd > input.selectionStart;
  })).toBe(true);

  await editor.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(0, 8);
  });
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    return [input.selectionStart, input.selectionEnd];
  })).toEqual([0, 8]);
  await expect(editor).toHaveCSS('font-weight', '700');

  await editor.focus();
  await editor.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(0, 8));
  await page.keyboard.type('Updated');
  await page.locator('.toolrail [data-tool="select"]').click();
  await expect(editor).toBeHidden();
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'text', text: 'Updated text', fontWeight: 'bold' });
});

test('applies every contextual option family to new objects', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);

  await page.locator('.toolrail [data-tool="text"]').click();
  await page.locator('[data-style="font"]').selectOption('monospace');
  await page.locator('[data-style="font-size"]').fill('24');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByRole('button', { name: 'Align center' }).click();
  await page.mouse.click(center.x - 80, center.y - 70);
  await page.locator('.text-editor').fill('Styled');
  await page.locator('.text-editor').blur();

  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.getByRole('button', { name: 'Diamond counter' }).click();
  await page.getByRole('button', { name: 'Roman numeral counters' }).click();
  await expect(page.locator('[data-style="counter-fill"]')).toHaveCount(0);
  await page.locator('[data-style="color"]').fill('#123456');
  await page.locator('[data-style="counter-text-color"]').fill('#abcdef');
  await page.locator('[data-style="counter-font"]').selectOption('monospace');
  await page.mouse.click(center.x, center.y);

  await page.locator('.toolrail [data-tool="redaction"]').click();
  await page.locator('[data-style="redaction-mode"]').selectOption('blur');
  await page.locator('[data-style="redaction-strength"]').fill('18');
  await drag(page, [40, -80], [110, -30]);

  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.getByRole('button', { name: 'Target reticle symbol' }).click();
  await expect(page.locator('[data-options="line-join"]')).toBeHidden();
  expect(await page.locator('[data-options="fill"]').evaluateAll((elements) => elements.every((element) => (element as HTMLElement).hidden))).toBe(true);
  await expect(page.locator('[data-options="stroke-toggle"]')).toBeHidden();
  await drag(page, [40, 30], [90, 80]);

  const scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'text', fontFamily: 'monospace', fontSize: 24, fontWeight: 'bold', align: 'center' });
  expect(scene.objects[1]).toMatchObject({ type: 'counter', shape: 'diamond', format: 'roman', filled: true, fontFamily: 'monospace', textColor: '#abcdef', style: { color: '#123456' } });
  expect(scene.objects[2]).toMatchObject({ type: 'redaction', mode: 'blur', strength: 18 });
  expect(scene.objects[3]).toMatchObject({ type: 'symbol', name: 'target' });
});

test('starts unvisited drawing tools at full opacity independently of translucent tools', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="highlighter"]').click();
  await page.locator('[data-style="opacity"]').fill('35');

  await page.locator('.toolrail [data-tool="rect"]').click();
  await expect(page.locator('[data-style="opacity"]')).toHaveValue('100');
  await page.locator('[data-style="opacity"]').fill('35');
  await drag(page, [-80, -40], [-20, 20]);
  await drag(page, [20, -40], [80, 20]);

  await page.locator('.toolrail [data-tool="symbol"]').click();
  await expect(page.locator('[data-style="opacity"]')).toHaveValue('100');
  expect((await saveScene(page)).objects.map((object: any) => object.style.opacity)).toEqual([0.35, 1]);
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

test('pans, zooms, fits, and restores actual size from View controls', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pan"]').click();
  await drag(page, [-30, 0], [45, 30]);
  const panned = (await saveScene(page)).viewport;

  await page.getByText('View', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Zoom in/ }).click();
  await expect(page.locator('#zoom-value')).not.toHaveText('100%');
  await page.getByText('View', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Fit image/ }).click();
  const fitted = (await saveScene(page)).viewport;
  expect(fitted.tx).not.toBe(panned.tx);

  await page.getByText('View', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Actual size/ }).click();
  expect((await saveScene(page)).viewport.scale).toBe(1);
});

test('toggles overflow visibility and explains transparent export behavior', async ({ page }) => {
  await loadImage(page);
  await page.getByText('View', { exact: true }).click();
  const overflow = page.locator('details[open]').getByRole('button', { name: /Show overflow/ });
  await expect(overflow).toHaveAttribute('aria-pressed', 'false');
  await overflow.click();
  const project = await saveScene(page);
  expect(project.showOverflow).toBe(true);
  project.objects.push({ id: 'outside', type: 'rect', rect: { x: 330, y: 50, w: 30, h: 30 }, style: { color: '#ff0000', fill: '#ff0000', stroke: false, width: 1, opacity: 1 } });
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

test('opens About from Help and links to the creator, repository, and support page', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Help', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: 'About imagemarkup' }).click();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#about-dialog')).toContainText('Created by Mark Bradley (BRADSEC).');
  await expect(page.locator('#about-dialog a', { hasText: 'BRADSEC' })).toHaveAttribute('href', 'https://github.com/bradsec');
  await expect(page.locator('#about-dialog a', { hasText: 'View imagemarkup on GitHub' })).toHaveAttribute('href', 'https://github.com/bradsec/imagemarkup');
  await expect(page.locator('#about-dialog a', { hasText: 'Buy me a coffee' })).toHaveAttribute('href', 'https://buymeacoffee.com/markbradley');
});

test('applies crop from the contextual options bar', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-100, -70], [-50, -20]);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await expect(page.getByRole('button', { name: 'Apply crop' })).toBeHidden();
  await drag(page, [-120, -80], [120, 80]);
  await expect(page.getByRole('button', { name: 'Apply crop' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply crop' }).click();

  const scene = await saveScene(page);
  expect(scene.image.width).toBeLessThan(320);
  expect(scene.image.height).toBeLessThan(240);
  expect(scene.image.width / scene.image.height).toBeCloseTo(1.5, 1);
  expect(scene.crop).toBeNull();
  expect(scene.activeTool).toBe('select');
  expect(scene.objects[0].rect.x).toBeGreaterThanOrEqual(0);
});

test('clips intersecting layers and removes layers outside an applied crop', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await drag(page, [-145, -95], [-95, -45]);
  await drag(page, [-25, -25], [65, 65]);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await drag(page, [-80, -60], [80, 60]);
  await page.getByRole('button', { name: 'Apply crop' }).click();

  const scene = await saveScene(page);
  expect(scene.objects).toHaveLength(1);
  expect(scene.objects[0].type).toBe('rect');
  expect(scene.objects[0].rect.x).toBeGreaterThanOrEqual(0);
  expect(scene.objects[0].rect.y).toBeGreaterThanOrEqual(0);
  expect(scene.selectedId).toBeNull();
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
  if (await options.evaluate((element) => getComputedStyle(element).position) !== 'absolute') return;

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

test('pinch zoom does not leave a partial drawing object', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pen"]').click();
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.stage-host')!;
    host.setPointerCapture = () => undefined;
    const rect = host.getBoundingClientRect();
    const send = (type: string, pointerId: number, x: number) => host.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', clientX: rect.left + x, clientY: rect.top + 100 }));
    send('pointerdown', 1, 100);
    send('pointerdown', 2, 200);
    send('pointermove', 2, 300);
    send('pointerup', 1, 100);
    send('pointerup', 2, 300);
  });
  await expect(page.locator('#zoom-value')).not.toHaveText('100%');
  expect((await saveScene(page)).objects).toHaveLength(0);
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens top menus above the workspace and switches menus with touch', async ({ page }) => {
    await page.goto('/');
    const fileSummary = page.locator('details.app-menu').filter({ hasText: /^File/ }).locator('summary');
    const editSummary = page.locator('details.app-menu').filter({ hasText: /^Edit/ }).locator('summary');
    const fileBox = await fileSummary.boundingBox();
    const editBox = await editSummary.boundingBox();
    if (!fileBox || !editBox) throw new Error('Menu summaries are not visible');

    await page.touchscreen.tap(fileBox.x + fileBox.width / 2, fileBox.y + fileBox.height / 2);
    await expect(fileSummary.locator('..')).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: /New project/ })).toBeInViewport();

    await page.touchscreen.tap(editBox.x + editBox.width / 2, editBox.y + editBox.height / 2);
    await expect(editSummary.locator('..')).toHaveAttribute('open', '');
    await expect(fileSummary.locator('..')).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: /Undo/ })).toBeInViewport();
  });

  test('sizes each dropdown to its own content', async ({ page }) => {
    await page.goto('/');
    await page.getByText('File', { exact: true }).click();
    const fileWidth = (await page.locator('details[open] .menu-popover').boundingBox())?.width ?? 0;
    await page.keyboard.press('Escape');
    await page.getByText('Help', { exact: true }).click();
    const helpWidth = (await page.locator('details[open] .menu-popover').boundingBox())?.width ?? 0;
    expect(helpWidth).toBeLessThan(fileWidth);
    await expect(page.getByRole('button', { name: 'About imagemarkup' })).toBeInViewport();
  });

  test('keeps the File menu reachable in a short landscape viewport', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.goto('/');
    await page.getByText('File', { exact: true }).click();
    const popover = page.locator('details[open] .menu-popover');
    const box = await popover.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(320);
    await page.getByRole('button', { name: /Export image/ }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: /Export image/ })).toBeInViewport();
  });

  test('resizes from a visible handle with touch while the drawing tool stays active', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="rect"]').click();
    await drag(page, [-60, -40], [60, 40]);
    const center = await canvasCenter(page);

    await page.locator('.stage-host').evaluate((host, points) => {
      (host as HTMLElement).setPointerCapture = () => undefined;
      const send = (type: string, x: number, y: number) => host.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }));
      send('pointerdown', points.startX, points.startY);
      send('pointermove', points.endX, points.endY);
      send('pointerup', points.endX, points.endY);
    }, {
      startX: center.x + 60,
      startY: center.y + 40,
      endX: center.x + 100,
      endY: center.y + 80,
    });

    const scene = await saveScene(page);
    expect(scene.activeTool).toBe('rect');
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0].rect.w).toBeGreaterThan(120);
    expect(scene.objects[0].rect.h).toBeGreaterThan(80);
  });

  test('returns tool options to their leading controls after switching tools', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="rect"]').click();
    const options = page.locator('.optionsbar');
    await options.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await options.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await page.locator('.toolrail [data-tool="text"]').click();
    await expect.poll(() => options.evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(options.locator('[data-style="color"]')).toBeInViewport();
  });

  test('keeps the frame dialog controls inside a 320 pixel viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await loadImage(page);
    await page.getByText('Image', { exact: true }).click();
    await page.locator('details[open]').getByRole('button', { name: 'Frame and watermark' }).click();

    const dialog = page.locator('#frame-dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const control of await dialog.locator('button').all()) {
      const box = await control.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    }
  });

  test('keeps primary actions and every tool reachable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /user-scalable=no/);
    expect(await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await expect(page.locator('.topbar-actions')).toBeHidden();
    await expect(page.locator('.topbar-actions [data-action="zoom-in"]')).toBeHidden();
    await expect(page.locator('.topbar-actions [data-action="save-project"]')).toBeHidden();
    await expect(page.locator('.topbar-actions [data-action="export"]')).toBeHidden();
    await page.getByText('File', { exact: true }).click();
    await expect(page.locator('details[open]').getByRole('button', { name: /Export image/ })).toBeVisible();
    await page.keyboard.press('Escape');
    const rail = page.locator('.toolrail');
    await expect(rail).toHaveCSS('flex-direction', 'column');
    await page.locator('.toolrail [data-tool="symbol"]').scrollIntoViewIfNeeded();
    await expect(page.locator('.toolrail [data-tool="symbol"]')).toBeVisible();
    const selectBox = await page.locator('.toolrail [data-tool="select"]').boundingBox();
    expect(selectBox!.width).toBeGreaterThanOrEqual(44);
    expect(selectBox!.height).toBeGreaterThanOrEqual(44);
    const railBox = await rail.boundingBox();
    expect((railBox?.x ?? -1) + (railBox?.width ?? 0)).toBeLessThanOrEqual(72);
    const headerBox = await page.locator('.app-header').boundingBox();
    expect(headerBox!.height).toBeLessThanOrEqual(53);
  });

  test('keeps counter options intact and horizontally scrollable', async ({ page }) => {
    await page.goto('/');
    await page.locator('.toolrail [data-tool="counter"]').click();

    const options = page.locator('.optionsbar');
    await expect.poll(() => options.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    for (const row of [
      options.locator('[data-choice-for="counter-shape"]'),
      options.locator('[data-choice-for="counter-format"]'),
    ]) {
      const buttons = await row.locator('button').all();
      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        const box = await button.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(40);
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
    }
  });
});
