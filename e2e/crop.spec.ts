import { expect } from '@playwright/test';
import { test, loadImage, drag, dragImage, saveScene } from './editor-helpers';

test('entering crop clears the selection and marquee overlay', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await dragImage(page, [40, 40], [90, 90]);
  // Capture the reference in crop mode for comparison with the crop result.
  await page.locator('.toolrail [data-tool="crop"]').click();
  const canvas = page.locator('.stage-host > canvas:not(.tool-preview)');
  const cleanPixels = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.locator('.toolrail [data-tool="select"]').click();
  await dragImage(page, [20, 20], [110, 110]);
  await expect(page.locator('#active-tool-name')).toHaveText('Rect selected');
  await page.locator('.toolrail [data-tool="crop"]').click();
  expect((await saveScene(page)).selectedId).toBeNull();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(cleanPixels);
});

test('switching away from crop clears the pending rectangle and crop actions', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await dragImage(page, [40, 30], [210, 170]);
  expect((await saveScene(page)).crop.w).toBeGreaterThan(0);
  await page.locator('.toolrail [data-tool="rect"]').click();
  expect((await saveScene(page)).crop).toBeNull();
  await expect(page.locator('[data-action="apply-crop"]')).toBeHidden();
  await expect(page.locator('[data-action="cancel-crop"]')).toBeHidden();
});

test('resizing crop changes applied dimensions, and crop uses one undo step', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="rect"]').click();
  await dragImage(page, [80, 60], [130, 110]);
  const annotation = (await saveScene(page)).objects[0];
  await page.locator('.toolrail [data-tool="crop"]').click();
  await dragImage(page, [30, 20], [200, 160]);
  await dragImage(page, [200, 160], [230, 190]);
  const adjusted = (await saveScene(page)).crop;
  expect(adjusted.w).toBeGreaterThan(170);
  expect(adjusted.h).toBeGreaterThan(140);
  await page.locator('[data-action="apply-crop"]').click();
  let scene = await saveScene(page);
  expect(scene.image).toMatchObject({ width: Math.round(adjusted.w), height: Math.round(adjusted.h) });
  await page.keyboard.press('Control+z');
  scene = await saveScene(page);
  expect(scene.image).toMatchObject({ width: 320, height: 240 });
  expect(scene.objects).toEqual([annotation]);
  await page.keyboard.press('Control+z');
  expect((await saveScene(page)).objects).toHaveLength(0);
});

test('Escape cancels crop', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await dragImage(page, [40, 30], [210, 170]);
  await page.keyboard.press('Escape');
  const scene = await saveScene(page);
  expect(scene.crop).toBeNull();
  expect(scene.activeTool).toBe('select');
  await expect(page.locator('[data-action="apply-crop"]')).toBeHidden();
});

test('1:1 crop ratio makes a square crop', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await page.locator('[data-style="crop-ratio"]').selectOption('1:1');
  await dragImage(page, [30, 30], [230, 130]);
  const crop = (await saveScene(page)).crop;
  expect(crop.w).toBeCloseTo(crop.h, 1);
});

test('crop can move, nudge, and apply with Enter', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await dragImage(page, [40, 30], [140, 110]);
  const initial = (await saveScene(page)).crop;
  await dragImage(page, [90, 70], [100, 80]);
  let crop = (await saveScene(page)).crop;
  // Pointer drags map through zoom, so allow sub-pixel error; keyboard nudges are exact.
  expect(crop.x).toBeCloseTo(initial.x + 10, 0);
  expect(crop.y).toBeCloseTo(initial.y + 10, 0);
  const dragged = crop;
  await page.locator('#stage').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  crop = (await saveScene(page)).crop;
  expect(crop.x).toBeCloseTo(dragged.x + 1, 5);
  expect(crop.y).toBeCloseTo(dragged.y + 10, 5);
  await page.locator('#stage').focus();
  await page.keyboard.press('Enter');
  expect((await saveScene(page)).image).toMatchObject({ width: Math.round(crop.w), height: Math.round(crop.h) });
  await expect(page.locator('[data-action="apply-crop"]')).toBeHidden();
});

test('crop orientation swap and Shift constrain the rectangle', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await page.locator('[data-style="crop-ratio"]').selectOption('4:3');
  await page.getByRole('button', { name: 'Swap crop orientation' }).click();
  await dragImage(page, [30, 30], [150, 140]);
  const swapped = (await saveScene(page)).crop;
  expect(swapped.w / swapped.h).toBeCloseTo(3 / 4, 1);
  await page.locator('[data-style="crop-ratio"]').selectOption('free');
  await page.keyboard.down('Shift');
  await dragImage(page, [250, 180], [150, 70]);
  await page.keyboard.up('Shift');
  const crop = (await saveScene(page)).crop;
  expect(crop.w / crop.h).toBeCloseTo(320 / 240, 1);
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

test('applies a chosen ratio and orientation swap to the visible crop', async ({ page }) => {
  await loadImage(page);
  await page.locator('.toolrail [data-tool="crop"]').click();
  await dragImage(page, [60, 40], [200, 160]);
  const swap = page.getByRole('button', { name: 'Swap crop orientation' });
  await expect(swap).toBeDisabled();
  await page.locator('[data-style="crop-ratio"]').selectOption('16:9');
  const wide = (await saveScene(page)).crop;
  expect(wide.w / wide.h).toBeCloseTo(16 / 9, 3);
  await swap.click();
  await expect(swap).toHaveAttribute('aria-pressed', 'true');
  const tall = (await saveScene(page)).crop;
  expect(tall.w / tall.h).toBeCloseTo(9 / 16, 3);
  expect(tall.w).toBeCloseTo(wide.h, 3);
});
