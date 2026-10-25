import { expect, test as base, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';

// On phones the tool options panel floats over the canvas and collapses when a canvas gesture
// starts. Shared tests act like a user: collapse the panel before pressing under it, and reopen
// it after a gesture that collapsed it. The 'mobile layout' tests cover the panel itself.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (testInfo.project.name === 'webkit-iphone' && !testInfo.titlePath.includes('mobile layout')) {
      let last = { x: 0, y: 0 };
      let reopen = false;
      const { move, down, up, click } = page.mouse;
      const panelState = () => page.evaluate(({ x, y }) => {
        const panel = document.querySelector<HTMLElement>('.optionsbar');
        const visible = Boolean(panel?.checkVisibility());
        if (!panel || !visible || panel.dataset.collapsed === 'true') return { visible, expanded: false, covered: false };
        const box = panel.getBoundingClientRect();
        const covered = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
        return { visible, expanded: true, covered };
      }, last);
      const toggle = async () => {
        await page.locator('[data-action="toggle-options-panel"]').click();
        // Clicking the toggle moved the pointer; return it to where the test left it.
        await move.call(page.mouse, last.x, last.y);
      };
      const beforePress = async () => {
        const { visible, expanded, covered } = await panelState();
        // A visibly collapsed panel was collapsed on purpose by the test; leave it.
        reopen = expanded || !visible;
        if (covered) await toggle();
      };
      const afterRelease = async () => {
        if (!reopen) return;
        reopen = false;
        const state = await panelState();
        if (state.visible && !state.expanded) await toggle();
      };
      page.mouse.move = async (x, y, options) => { last = { x, y }; return move.call(page.mouse, x, y, options); };
      page.mouse.down = async (options) => { await beforePress(); return down.call(page.mouse, options); };
      page.mouse.up = async (options) => { await up.call(page.mouse, options); await afterRelease(); };
      page.mouse.click = async (x, y, options) => {
        last = { x, y };
        await beforePress();
        await click.call(page.mouse, x, y, options);
        // Reopening after a right-click would dismiss the context menu it opened.
        if (options?.button === 'right') reopen = false;
        await afterRelease();
      };
    }
    await use(page);
  },
});

const fixture = createCanvas(320, 240);
export const fixtureContext = fixture.getContext('2d');
fixtureContext.fillStyle = '#e84c3d';
fixtureContext.fillRect(0, 0, 160, 120);
fixtureContext.fillStyle = '#36a269';
fixtureContext.fillRect(160, 0, 160, 120);
fixtureContext.fillStyle = '#3679c9';
fixtureContext.fillRect(0, 120, 160, 120);
fixtureContext.fillStyle = '#f2cf45';
fixtureContext.fillRect(160, 120, 160, 120);
export const imageBuffer = fixture.toBuffer('image/png');

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

export async function loadImage(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'quadrants.png', mimeType: 'image/png', buffer: imageBuffer });
  await expect(page.locator('#status')).toContainText('320 x 240');
}

export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.stage-host > canvas').boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function drag(page: Page, from: [number, number], to: [number, number], steps = 1): Promise<void> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x + from[0], center.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(center.x + to[0], center.y + to[1], { steps });
  await page.mouse.up();
}

export async function imagePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const scene = await saveScene(page);
  const box = await page.locator('.stage-host > canvas').boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  return { x: box.x + scene.viewport.tx + x * scene.viewport.scale, y: box.y + scene.viewport.ty + y * scene.viewport.scale };
}

export async function dragImage(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const start = await imagePoint(page, ...from);
  const end = await imagePoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

export async function saveScene(page: Page): Promise<any> {
  const download = page.waitForEvent('download');
  await page.getByText('File', { exact: true }).click();
  await page.locator('details[open]').getByRole('button', { name: /Save project/ }).click();
  const path = await (await download).path();
  if (!path) throw new Error('Project download path unavailable');
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function canvasColorPixelCount(page: Page, color: [number, number, number]): Promise<number> {
  return page.locator('.stage-host > canvas').evaluate((element, expected) => {
    const canvas = element as HTMLCanvasElement;
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
