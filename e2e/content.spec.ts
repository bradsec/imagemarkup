import { expect } from '@playwright/test';
import { createCanvas, loadImage as loadCanvasImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { annotationBounds } from '../src/core/annotations';
import { test, fixtureContext, loadImage, canvasCenter, drag, imagePoint, dragImage, saveScene, previewBounds } from './editor-helpers';

test('pen options preview stays in the panel and changes with width', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pen"]').click();
  const tile = page.locator('.tool-options-preview');
  const canvas = tile.locator('canvas');
  await expect(tile).toBeVisible();
  const panelBounds = await page.locator('.optionsbar').boundingBox();
  const tileBounds = await tile.boundingBox();
  expect(panelBounds && tileBounds).toBeTruthy();
  expect(tileBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
  expect(tileBounds!.y).toBeGreaterThanOrEqual(panelBounds!.y);
  expect(tileBounds!.x + tileBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width);
  expect(tileBounds!.y + tileBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height);
  const pixels = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const before = await pixels();
  await page.locator('[data-style="width"]').fill('36');
  await expect.poll(pixels).not.toBe(before);
  await page.locator('.toolrail [data-tool="select"]').click();
  await expect(tile).toBeHidden();
});

test('redaction ghost renders the effect and responds to strength without exporting it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'Hover preview requires a pointer');
  await loadImage(page);
  await page.locator('.toolrail [data-tool="redaction"]').click();
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-visible', 'true');
  const sample = () => page.locator('.tool-preview').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const x = Math.floor(canvas.width / 2), y = Math.floor(canvas.height / 2);
    return [...ctx.getImageData(x - 15, y - 15, 30, 30).data];
  });
  const weak = await sample();
  expect(weak.some((value, index) => index % 4 !== 3 && value !== 0)).toBe(true);
  await page.locator('[data-style="redaction-strength"]').fill('40');
  await expect.poll(async () => JSON.stringify(await sample())).not.toBe(JSON.stringify(weak));
  expect((await saveScene(page)).objects).toHaveLength(0);
  await page.locator('.topbar-actions [data-action="export"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#export-dialog button[value="download"]').click();
  const path = await (await download).path();
  if (!path) throw new Error('PNG download path unavailable');
  const exported = createCanvas(320, 240);
  exported.getContext('2d').drawImage(await loadCanvasImage(path), 0, 0);
  expect([...exported.getContext('2d').getImageData(0, 0, 320, 240).data])
    .toEqual([...fixtureContext.getImageData(0, 0, 320, 240).data]);
  const scenePixels = () => page.locator('.stage-host > canvas:not(.tool-preview)').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const x = Math.floor(canvas.width / 2), y = Math.floor(canvas.height / 2);
    return [...canvas.getContext('2d')!.getImageData(x - 15, y - 15, 30, 30).data];
  });
  const beforeDrag = await scenePixels();
  await page.mouse.move(center.x - 40, center.y - 40);
  await page.mouse.down();
  await page.mouse.move(center.x + 40, center.y + 40, { steps: 4 });
  await expect.poll(async () => JSON.stringify(await scenePixels())).not.toBe(JSON.stringify(beforeDrag));
  await page.mouse.up();
});

test('counter ghost follows format and size and matches the placed counter bounds', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'Hover preview requires a pointer');
  await loadImage(page);
  await page.locator('.toolrail [data-tool="counter"]').click();
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-visible', 'true');
  const first = await previewBounds(page);
  await page.locator('[data-choice-for="counter-format"] [data-value="roman"]').click();
  await page.locator('[data-style="counter-size"]').fill('32');
  await page.mouse.move(center.x, center.y);
  await expect.poll(async () => (await previewBounds(page))?.w).toBeGreaterThan(first!.w);
  const ghost = await previewBounds(page);
  await page.locator('.stage-host > canvas:not(.tool-preview)').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    (canvas as HTMLCanvasElement & { beforePlacement?: Uint8ClampedArray }).beforePlacement = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  });
  await page.mouse.click(center.x, center.y);
  const scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'counter', format: 'roman', radius: 32 });
  await page.keyboard.press('Escape');
  const placed = await page.locator('.stage-host > canvas:not(.tool-preview)').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const before = (canvas as HTMLCanvasElement & { beforePlacement?: Uint8ClampedArray }).beforePlacement!;
    const after = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      if (before[index] === after[index] && before[index + 1] === after[index + 1] && before[index + 2] === after[index + 2]) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  });
  expect(Math.abs(ghost!.x - placed.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(ghost!.y - placed.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(ghost!.w - placed.w)).toBeLessThanOrEqual(2);
  expect(Math.abs(ghost!.h - placed.h)).toBeLessThanOrEqual(2);
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

test('text presets update the selected object in one undo step and show Custom for typed values', async ({ page }) => {
  await loadImage(page);
  const center = await canvasCenter(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  await page.mouse.click(center.x, center.y);
  await page.locator('.text-editor').fill('Preset text');
  await page.keyboard.press('Escape');
  const selectText = async () => {
    if (await page.locator('.layers-panel').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();
    await page.locator('.layers-panel [data-action="select-layer"]').first().click();
    if (await page.locator('.optionsbar').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
  };
  await selectText();
  const input = page.locator('[data-style="letter-spacing"]');
  const presets = page.getByRole('combobox', { name: 'Letter spacing presets' });
  await presets.selectOption('50');
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'text', letterSpacing: 50 });
  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'text', letterSpacing: 0 });
  await selectText();
  await input.fill('37');
  await input.blur();
  await expect(presets).toHaveValue('');
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'text', letterSpacing: 37 });
});

test('symbol slider and typed value stay in sync', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.locator('[data-choice-for="symbol"] [data-value="star"]').click();
  const points = page.locator('[data-style="symbol-points"]');
  const slider = page.getByRole('slider', { name: 'Points slider' });
  await points.fill('8');
  await points.blur();
  await expect(slider).toHaveValue('8');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(points).toHaveValue('9');
});

test('text spacing changes multiline bounds, survives reload, and can be undone', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  const point = await imagePoint(page, 40, 60);
  await page.mouse.click(point.x, point.y);
  await page.locator('.text-editor').fill('A spaced line\nAnother spaced line');
  await page.locator('.text-editor').blur();
  const original = (await saveScene(page)).objects[0];
  const originalBounds = annotationBounds(original);

  await page.locator('[data-style="letter-spacing"]').fill('200');
  await page.locator('[data-style="letter-spacing"]').blur();
  await page.locator('[data-style="line-height"]').fill('2');
  await page.locator('[data-style="line-height"]').blur();
  let scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ letterSpacing: 200, lineHeight: 2 });
  const spacedBounds = annotationBounds(scene.objects[0]);
  expect(spacedBounds.w).toBeGreaterThan(originalBounds.w);
  expect(spacedBounds.h).toBeGreaterThan(originalBounds.h);

  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ letterSpacing: 200, lineHeight: 1.2 });
  await page.keyboard.press('Control+Shift+z');
  const saved = await saveScene(page);
  expect(saved.objects[0]).toMatchObject({ letterSpacing: 200, lineHeight: 2 });
  await page.locator('input[accept^=".imgmarkup"]').setInputFiles({ name: 'spaced.imgmarkup', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect.poll(async () => (await saveScene(page)).objects[0]?.lineHeight).toBe(2);
  expect((await saveScene(page)).objects[0].letterSpacing).toBe(200);
});

test('star points apply to new symbols', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.locator('[data-choice-for="symbol"] [data-value="star"]').click();
  await page.locator('[data-style="symbol-points"]').fill('8');
  await page.locator('[data-style="symbol-points"]').blur();
  await dragImage(page, [80, 60], [150, 130]);
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'symbol', name: 'star', points: 8 });
});

test('polygon sides update a selected symbol and undo restores them', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.locator('[data-choice-for="symbol"] [data-value="hexagon"]').click();
  await dragImage(page, [80, 60], [150, 130]);
  expect((await saveScene(page)).objects[0]).toMatchObject({ type: 'symbol', name: 'hexagon' });
  await page.locator('[data-style="symbol-sides"]').fill('8');
  await page.locator('[data-style="symbol-sides"]').blur();
  expect((await saveScene(page)).objects[0].sides).toBe(8);
  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects[0].sides ?? 6).toBe(6);
});

test('symbol fill and outline width update the selected symbol and undo restores each change', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.locator('[data-choice-for="symbol"] [data-value="ring"]').click();
  await dragImage(page, [80, 60], [150, 130]);
  const original = (await saveScene(page)).objects[0];
  expect(original.style).toMatchObject({ fill: original.style.color, stroke: false });
  await page.locator('[data-color-presets="fill"] [data-color="#00b050"]').click();
  expect((await saveScene(page)).objects[0].style.fill).toBe('#00b050');
  await page.getByRole('button', { name: 'Toggle stroke' }).click();
  await page.locator('[data-size-presets="width"] [data-value="12"]').click();
  expect((await saveScene(page)).objects[0].style).toMatchObject({ fill: '#00b050', stroke: true, width: 12 });
  await page.locator('#stage').focus();
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects[0].style).toMatchObject({ fill: '#00b050', stroke: true, width: original.style.width });
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects[0].style).toMatchObject({ fill: '#00b050', stroke: false });
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects[0].style.fill).toBe(original.style.fill);
});

test('symbol fill swatches apply to a multi-selection', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await dragImage(page, [50, 40], [90, 80]);
  await dragImage(page, [120, 90], [160, 130]);
  if (await page.locator('.layers-panel').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  const rows = page.locator('[data-layer-type="symbol"] [data-action="select-layer"]');
  await rows.first().click();
  await rows.last().click({ modifiers: ['Control'] });
  // On phones only one palette stays open; open the options after choosing layers.
  if (await page.locator('.optionsbar').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
  await page.locator('[data-color-presets="fill"] [data-color="#00b050"]').click();
  expect((await saveScene(page)).objects.map((object: any) => object.style.fill)).toEqual(['#00b050', '#00b050']);
});

test('symbol search and arrow keys reach choices', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  const search = page.getByRole('searchbox', { name: 'Search symbols' });
  await search.fill('target');
  await search.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Target reticle symbol' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-style="symbol"]')).toHaveValue('target');
  await expect(page.getByRole('group', { name: 'Marks' })).toBeVisible();
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
  // On phones only one palette stays open; open the options after choosing a layer.
  if (await page.locator('.optionsbar').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
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

test('applies formatting to new text while it is being typed', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="text"]').click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x - 80, center.y);
  const editor = page.locator('.text-editor');
  await editor.fill('New text');
  if (await page.locator('.optionsbar').getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS('font-weight', '700');
  await page.keyboard.press('Escape');
  expect((await saveScene(page)).objects).toEqual([expect.objectContaining({ type: 'text', text: 'New text', fontWeight: 'bold' })]);
});

test('edits existing text at a caret without selecting the whole object', async ({ page }) => {
  await loadImage(page);
  // Measure the canvas after choosing the tool so the editor has its final dimensions.
  await page.locator('.toolrail [data-tool="text"]').click();
  await expect(page.locator('.optionsbar')).toBeVisible();
  let center = await canvasCenter(page);
  await page.mouse.click(center.x - 80, center.y);
  await page.locator('.text-editor').fill('Editable text');
  await page.keyboard.press('Escape');

  await page.locator('.toolrail [data-tool="text"]').click();
  await expect(page.locator('.optionsbar')).toBeVisible();
  center = await canvasCenter(page);
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
  await page.locator('[data-style="fill"]').fill('#123456');
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
  expect(await page.locator('[data-options="fill"]').evaluateAll((elements) => elements.some((element) => !(element as HTMLElement).hidden))).toBe(true);
  await expect(page.locator('[data-options="stroke-toggle"]')).toBeVisible();
  await drag(page, [40, 30], [90, 80]);

  const scene = await saveScene(page);
  expect(scene.objects[0]).toMatchObject({ type: 'text', fontFamily: 'monospace', fontSize: 24, fontWeight: 'bold', align: 'center' });
  expect(scene.objects[1]).toMatchObject({ type: 'counter', paint: 'separate', shape: 'diamond', format: 'roman', fontFamily: 'monospace', textColor: '#abcdef', style: { fill: '#123456', stroke: false } });
  expect(scene.objects[2]).toMatchObject({ type: 'redaction', mode: 'blur', strength: 18 });
  expect(scene.objects[3]).toMatchObject({ type: 'symbol', name: 'target' });
});

test('keeps each tool style when leaving it with Escape or a shortcut key', async ({ page }) => {
  await loadImage(page);
  const strokeOn = page.getByRole('button', { name: 'Toggle stroke' });
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await expect(strokeOn).toHaveAttribute('aria-pressed', 'false');
  await strokeOn.click();
  await page.locator('[data-color-presets="fill"] [data-color="#00b050"]').click();
  await page.locator('#stage').focus();
  await page.keyboard.press('Escape');
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await expect(strokeOn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-style="fill"]')).toHaveValue('#00b050');

  await page.locator('.toolrail [data-tool="rect"]').click();
  await page.locator('[data-style="width"]').fill('12');
  await page.locator('.toolrail [data-tool="pen"]').click();
  await expect(page.locator('[data-style="width"]')).toHaveValue('4');
  await page.locator('#stage').focus();
  await page.keyboard.press('r');
  await expect(page.locator('[data-style="width"]')).toHaveValue('12');
  await page.keyboard.press('p');
  await expect(page.locator('[data-style="width"]')).toHaveValue('4');
});

test('remembers a tool fill color while fill is turned off', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  // A first visit to Rectangle must not inherit the symbol's fill.
  await page.locator('.toolrail [data-tool="rect"]').click();
  await expect(page.getByRole('button', { name: 'Toggle fill' })).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.locator('[data-color-presets="fill"] [data-color="#ffff00"]').click();
  await page.getByRole('button', { name: 'Toggle fill' }).click();
  await drag(page, [-30, -30], [30, 30]);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await page.locator('.toolrail [data-tool="symbol"]').click();
  await page.getByRole('button', { name: 'Toggle fill' }).click();
  await expect(page.locator('[data-style="fill"]')).toHaveValue('#ffff00');
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

test('gives counters a separate border and text formatting', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="counter"]').click();
  await page.getByRole('button', { name: 'Toggle stroke' }).click();
  await page.locator('[data-style="color"]').fill('#00ff00');
  await page.locator('[data-style="width"]').fill('5');
  await page.getByRole('button', { name: 'Italic counter text' }).click();
  await page.getByRole('button', { name: 'Underline counter text' }).click();
  await page.getByRole('button', { name: 'Bold counter text' }).click();
  await expect(page.getByRole('button', { name: 'Bold counter text' })).toHaveAttribute('aria-pressed', 'false');
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  const [counter] = (await saveScene(page)).objects;
  expect(counter).toMatchObject({ type: 'counter', paint: 'separate', fontWeight: 'normal', fontStyle: 'italic', underline: true, style: { stroke: true, color: '#00ff00', width: 5 } });
  expect(counter.style.fill).toBeTruthy();
});
