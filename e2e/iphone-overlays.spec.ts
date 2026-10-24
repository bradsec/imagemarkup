import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

const image = createCanvas(320, 240).toBuffer('image/png');
const viewports = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];

async function checkOverlay(page: Page, selector: string): Promise<void> {
  const result = await page.evaluate((target) => {
    const overlay = document.querySelector<HTMLElement>(target)!;
    const box = overlay.getBoundingClientRect();
    const viewport = window.visualViewport!;
    const controls = [...overlay.querySelectorAll<HTMLElement>('button, input, select, textarea, a')]
      .filter((control) => control.getClientRects().length > 0);
    const horizontalScroll = overlay.scrollWidth > overlay.clientWidth + 1;
    overlay.scrollTop = overlay.scrollHeight;
    const finalAction = (overlay.querySelector('.dialog-actions button:last-child') ?? controls.at(-1))?.getBoundingClientRect();
    return {
      overlay: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      viewport: { left: viewport.offsetLeft, right: viewport.offsetLeft + viewport.width, top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height },
      pageWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      horizontalScroll,
      finalAction: finalAction && { top: finalAction.top, bottom: finalAction.bottom },
      controls: controls.map((control) => {
        const rect = control.getBoundingClientRect();
        return { name: control.getAttribute('name') ?? control.textContent?.trim() ?? control.tagName, left: rect.left, right: rect.right,
          fontSize: control.matches('input, select, textarea') ? Number.parseFloat(getComputedStyle(control).fontSize) : null };
      }),
    };
  }, selector);
  const { overlay, viewport } = result;
  expect(overlay.left, selector).toBeGreaterThanOrEqual(viewport.left - 1);
  expect(overlay.right, selector).toBeLessThanOrEqual(viewport.right + 1);
  expect(overlay.top, selector).toBeGreaterThanOrEqual(viewport.top - 1);
  expect(overlay.bottom, selector).toBeLessThanOrEqual(viewport.bottom + 1);
  expect(result.pageWidth, selector).toBe(page.viewportSize()!.width);
  expect(result.bodyWidth, selector).toBe(page.viewportSize()!.width);
  expect(result.horizontalScroll, selector).toBe(false);
  expect(result.finalAction!.top, selector).toBeGreaterThanOrEqual(overlay.top - 1);
  expect(result.finalAction!.bottom, selector).toBeLessThanOrEqual(overlay.bottom + 1);
  for (const control of result.controls) {
    expect(control.left, `${selector}: ${control.name}`).toBeGreaterThanOrEqual(overlay.left - 1);
    expect(control.right, `${selector}: ${control.name}`).toBeLessThanOrEqual(overlay.right + 1);
    if (control.fontSize !== null) expect(control.fontSize, `${selector}: ${control.name}`).toBeGreaterThanOrEqual(16);
  }
}

test('touch numeric controls fit the tool palette and stay at least 40px tall', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone touch controls');
  await page.goto('/');
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: image });
  for (const tool of ['pen', 'text', 'symbol', 'counter', 'redaction']) {
    await page.locator(`.toolrail [data-tool="${tool}"]`).click();
    const panel = page.locator('.optionsbar');
    if (await panel.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
    const result = await panel.evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      short: [...element.querySelectorAll<HTMLElement>('.numeric-pair > input, .numeric-pair > select')]
        .filter((control) => control.checkVisibility())
        .filter((control) => control.getBoundingClientRect().height < 40)
        .map((control) => control.getAttribute('aria-label') ?? control.outerHTML),
    }));
    expect(result.overflow, tool).toBe(false);
    expect(result.short, tool).toEqual([]);
  }
});

for (const viewport of [...viewports, { width: 320, height: 256 }]) {
  test(`keeps the tool palette inside the editor at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone layout');
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: image });
    await page.locator('.toolrail [data-tool="pen"]').click();
    const bounds = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const panel = rect('.optionsbar');
      const editor = rect('.editor');
      const rail = rect('.toolrail');
      const header = rect('.app-header');
      const status = rect('.statusbar');
      return { panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
        editor: { left: editor.left, right: editor.right, top: editor.top, bottom: editor.bottom },
        railRight: rail.right, headerBottom: header.bottom, statusTop: status.top,
        pageWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth };
    });
    expect(bounds.panel.left).toBeGreaterThanOrEqual(Math.max(bounds.editor.left, bounds.railRight));
    expect(bounds.panel.right).toBeLessThanOrEqual(bounds.editor.right);
    expect(bounds.panel.top).toBeGreaterThanOrEqual(Math.max(bounds.editor.top, bounds.headerBottom));
    expect(bounds.panel.bottom).toBeLessThanOrEqual(Math.min(bounds.editor.bottom, bounds.statusTop));
    expect(bounds.pageWidth).toBe(viewport.width);
    expect(bounds.bodyWidth).toBe(viewport.width);
  });

}

for (const viewport of viewports) {
  test(`keeps every dialog and menu within ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone layout and touch font sizes');
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: image });

    for (const [menu, action, id] of [
      ['File', 'export', 'export-dialog'],
      ['Help', 'about', 'about-dialog'],
      ['Help', 'tools-guide', 'tools-guide-dialog'],
      ['Help', 'editing-guide', 'editing-guide-dialog'],
      ['Help', 'saving-guide', 'saving-guide-dialog'],
      ['Help', 'shortcuts-guide', 'shortcuts-guide-dialog'],
      ['File', 'preferences', 'preferences-dialog'],
      ['Image', 'frame', 'frame-dialog'],
      ['Image', 'transform', 'transform-dialog'],
    ]) {
      await page.locator('.app-menu > summary').filter({ hasText: menu }).click();
      await page.locator(`details[open] [data-action="${action}"]`).click();
      await expect(page.locator(`#${id}`)).toBeVisible();
      await checkOverlay(page, `#${id}`);
      await page.keyboard.press('Escape');
    }

    for (const menu of ['File', 'Edit', 'Image', 'View', 'Help']) {
      await page.locator('.app-menu > summary').filter({ hasText: menu }).click();
      await checkOverlay(page, 'details.app-menu[open] .menu-popover');
      await page.keyboard.press('Escape');
    }

    await page.locator('.toolrail [data-tool="rect"]').click();
    // The expanded options panel covers the canvas center on phones; dismiss it as a user would.
    await page.getByRole('button', { name: 'Collapse Tool options panel' }).click();
    const canvas = (await page.locator('.stage-host canvas:not(.tool-preview)').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2 - 20, canvas.y + canvas.height / 2 - 20);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 20, canvas.y + canvas.height / 2 + 20);
    await page.mouse.up();
    await page.locator('#stage').evaluate((stage) => {
      stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 2, clientY: innerHeight - 2 }));
    });
    await expect(page.locator('#canvas-context-menu')).toBeVisible();
    await checkOverlay(page, '#canvas-context-menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Expand Layers panel' }).click();
    await page.locator('[data-layer-id]').first().evaluate((row) => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 2, clientY: innerHeight - 2 }));
    });
    await expect(page.locator('#layer-context-menu')).toBeVisible();
    await checkOverlay(page, '#layer-context-menu');
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`fits every tool's options without sideways scroll or overlapping swatches at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone layout');
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.stage-host input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: image });
    for (const tool of ['pen', 'rect', 'symbol', 'highlighter', 'text', 'counter']) {
      await page.locator(`.toolrail [data-tool="${tool}"]`).click();
      await expect(page.locator('[data-action="toggle-options-panel"]'), tool).toBeVisible();
      const layout = await page.locator('.optionsbar').evaluate((bar) => {
        const swatches = [...bar.querySelectorAll<HTMLElement>('.color-presets button')].filter((button) => button.checkVisibility()).map((button) => button.getBoundingClientRect());
        const overlaps = swatches.some((a, index) => swatches.slice(index + 1).some((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        return { sideways: bar.scrollWidth > bar.clientWidth + 1, overlaps };
      });
      expect(layout, tool).toEqual({ sideways: false, overlaps: false });
    }
  });
}
