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
  const canvas = await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  await page.mouse.move(canvas.x + canvas.width / 2 - 30, canvas.y + canvas.height / 2 - 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 30, canvas.y + canvas.height / 2 + 20);
  await page.mouse.up();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('keeps the Load image label in the button text color', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('.empty-open-button');
  const colors = await button.evaluate((element) => [getComputedStyle(element).color, getComputedStyle(element.querySelector('span')!).color]);
  expect(colors[1]).toBe(colors[0]);
});

test('keeps primary regions and touch targets usable at 320 by 256 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await loadImage(page);

  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await expect(page.locator('body')).toHaveJSProperty('scrollHeight', 256);
  const header = await page.locator('.app-header').boundingBox();
  const tools = await page.locator('.toolrail').boundingBox();
  expect(header?.y).toBe(0);
  await expect(page.locator('#status')).toBeVisible();
  await expect(page.locator('footer .repo-link')).toBeHidden();
  expect(tools?.y).toBeGreaterThanOrEqual(header?.height ?? 0);
  expect((tools?.y ?? 0) + (tools?.height ?? 0)).toBeLessThanOrEqual(256);

  // Compact Photoshop-style swatches: each control meets the WCAG 2.5.8 minimum, the docked group a 44px touch area.
  const group = await page.locator('.tool-colors').boundingBox();
  expect(group?.width).toBeGreaterThanOrEqual(44);
  expect(group?.height).toBeGreaterThanOrEqual(44);
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

test('focuses a dialog heading and returns to the invoking menu on close', async ({ page }) => {
  await page.goto('/');
  const help = page.getByText('Help', { exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Tools and drawing' })).toBeFocused();
  await page.getByRole('button', { name: 'About imagemarkup' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#about-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
});

test('opens each guide without changing the canvas and returns focus on Escape or Close', async ({ page }) => {
  await loadImage(page);
  await page.locator('[data-tool="rect"]').click();
  const canvas = page.locator('.stage-host canvas:not(.tool-preview)');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
  await page.mouse.up();
  const help = page.locator('details.app-menu').filter({ has: page.locator('summary', { hasText: 'Help' }) }).locator('summary');
  const before = await page.locator('#stage').getAttribute('data-active-tool');
  const beforePixels = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  for (const [index, name] of ['tools', 'editing', 'saving', 'shortcuts'].entries()) {
    await help.click();
    await page.locator(`[data-action="${name}-guide"]`).click();
    const dialog = page.locator(`#${name}-guide-dialog`);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    if (index % 2 === 0) await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    await expect(page.locator('#stage')).toHaveAttribute('data-active-tool', before!);
    expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(beforePixels);
  }
});

test('keeps guides inside a 320 by 256 viewport with internal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/');
  for (const name of ['tools', 'editing', 'saving', 'shortcuts']) {
    await page.locator('details.app-menu').filter({ has: page.locator('summary', { hasText: 'Help' }) }).locator('summary').click();
    await page.locator(`[data-action="${name}-guide"]`).click();
    const dialog = page.locator(`#${name}-guide-dialog`);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(256);
    expect(await dialog.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await dialog.evaluate((element) => element.clientHeight));
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
    await dialog.getByRole('button', { name: 'Close' }).click();
  }
});

test('shows focus and selected controls in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await loadImage(page);
  const selectedTool = page.locator('.toolrail [data-tool="rect"]');
  await selectedTool.click();
  const selectedSwatch = page.locator('[data-color-presets="color"] button[data-color="#ff0000"]');
  await selectedSwatch.click();
  await selectedTool.focus();
  for (const control of [selectedTool, selectedSwatch]) {
    await expect(control).toHaveCSS('outline-style', 'solid');
    await expect(control).toHaveCSS('outline-width', '2px');
  }
});

test('shows a focus ring on the inline text editor', async ({ page }) => {
  await loadImage(page);
  await page.locator('[data-tool="text"]').click();
  const canvas = await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox();
  if (!canvas) throw new Error('Canvas is not visible');
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.locator('.text-editor')).toBeFocused();
  await expect(page.locator('.text-editor')).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.text-editor')).toHaveCSS('outline-width', '2px');
});

test('moves a selected annotation with focused arrow keys', async ({ page }) => {
  await loadImage(page);
  await page.locator('[data-tool="rect"]').click();
  const canvas = await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox();
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
