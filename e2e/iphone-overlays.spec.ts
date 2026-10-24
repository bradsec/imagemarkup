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
