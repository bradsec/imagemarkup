import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';

const fixture = createCanvas(320, 240).toBuffer('image/png');

async function loadImage(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
}

test('has no automatically detectable WCAG A or AA violations in primary states', async ({ page }) => {
  await page.goto('/');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);

  await loadImage(page);
  await page.locator('[data-tool="rect"]').click();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  await page.mouse.move(canvas.x + canvas.width / 2 - 30, canvas.y + canvas.height / 2 - 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 30, canvas.y + canvas.height / 2 + 20);
  await page.mouse.up();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('keeps primary regions and touch targets usable at 320 by 256 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await loadImage(page);

  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await expect(page.locator('body')).toHaveJSProperty('scrollHeight', 256);
  const header = await page.locator('.app-header').boundingBox();
  const tools = await page.locator('.toolrail').boundingBox();
  expect(header?.y).toBe(0);
  expect(tools?.y).toBeGreaterThanOrEqual(header?.height ?? 0);
  expect((tools?.y ?? 0) + (tools?.height ?? 0)).toBeLessThanOrEqual(256);

  for (const control of await page.locator('.tool-colors input, .tool-colors button').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
});

test('keeps native keyboard activation and scopes single-key canvas shortcuts', async ({ page }) => {
  await loadImage(page);
  const hand = page.getByRole('button', { name: 'Hand' });
  await hand.focus();
  await page.keyboard.press('Space');
  await expect(hand).toHaveAttribute('aria-pressed', 'true');

  const file = page.getByText('File', { exact: true });
  await file.focus();
  await page.keyboard.press('r');
  await expect(hand).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#stage').focus();
  await page.keyboard.press('r');
  await expect(page.locator('[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');
});

test('returns focus to a disclosure when Escape closes it', async ({ page }) => {
  await page.goto('/');
  const file = page.getByText('File', { exact: true });
  await file.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /New project/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(file).toBeFocused();
  await expect(page.locator('details.app-menu').first()).not.toHaveAttribute('open', '');
});

test('moves a selected annotation with focused arrow keys', async ({ page }) => {
  await loadImage(page);
  await page.locator('[data-tool="rect"]').click();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  await page.mouse.move(canvas.x + canvas.width / 2 - 30, canvas.y + canvas.height / 2 - 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 30, canvas.y + canvas.height / 2 + 20);
  await page.mouse.up();
  await page.locator('#stage').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#status')).toHaveText('Moved selection 10 pixels');
});

test('bounds the expanded Layers palette on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 704 });
  await loadImage(page);
  await page.getByRole('button', { name: 'Expand Layers panel' }).click();
  const panel = await page.locator('.layers-panel').boundingBox();
  const tools = await page.locator('.toolrail').boundingBox();
  expect(panel?.width).toBeLessThanOrEqual(260);
  expect(panel?.height).toBeLessThanOrEqual(704 * 0.52 + 1);
  expect(panel?.x).toBeGreaterThanOrEqual(0);
  const verticalTools = await page.locator('.toolrail').evaluate((element) => getComputedStyle(element).flexDirection === 'column');
  if (verticalTools) {
    expect(panel?.x).toBeGreaterThanOrEqual((tools?.x ?? 0) + (tools?.width ?? 0));
    expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(704);
  } else {
    expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(tools?.y ?? 704);
  }
});
