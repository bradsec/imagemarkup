import { expect } from '@playwright/test';
import { test, loadImage, canvasCenter, drag, saveScene } from './editor-helpers';

test('pen options preview and controls fit the mobile palette at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loadImage(page);
  await page.locator('.toolrail [data-tool="pen"]').click();
  const tile = page.locator('.tool-options-preview');
  const color = page.locator('.optionsbar [data-style="color"]');
  await expect(tile).toBeVisible();
  await expect(color).toBeVisible();
  const tileBounds = await tile.boundingBox();
  const panelBounds = await page.locator('.optionsbar').boundingBox();
  const editorBounds = await page.locator('.editor').boundingBox();
  expect(tileBounds && panelBounds && editorBounds).toBeTruthy();
  expect(panelBounds!.x).toBeGreaterThanOrEqual(editorBounds!.x);
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(editorBounds!.x + editorBounds!.width);
  expect(tileBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
  expect(tileBounds!.x + tileBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width);
  await color.scrollIntoViewIfNeeded();
  const colorBounds = await color.boundingBox();
  expect(colorBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
  expect(colorBounds!.x + colorBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width);
  await page.locator('.optionsbar [data-choice-for="line-cap"] button:last-child').scrollIntoViewIfNeeded();
  await expect(page.locator('.optionsbar [data-choice-for="line-cap"] button:last-child')).toBeInViewport();
});

// One test per viewport: walking every tool at all sizes in one test outran the timeout on CI runners.
for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 320, height: 256 }]) {
  test(`iPhone controls stay readable and reachable for every tool at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone layout');
    await page.setViewportSize(viewport);
    await loadImage(page);
    for (const tool of await page.locator('.toolrail [data-tool]').all()) {
      await tool.scrollIntoViewIfNeeded();
      await tool.click();
      const options = page.locator('.optionsbar');
      if (await options.isHidden()) continue;
      if (await options.getAttribute('data-collapsed') === 'true') await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
      expect(await options.evaluate((bar) => bar.scrollWidth <= bar.clientWidth + 1)).toBe(true);
      // One in-page pass: the options bar re-renders on store updates, which detaches per-control locators.
      const unreachable = await page.locator('.optionsbar').evaluate((bar) => [...bar.querySelectorAll<HTMLElement>('button, input, select, textarea')]
        .filter((control) => control.checkVisibility() && !(control as HTMLButtonElement).disabled)
        .filter((control) => {
          const outside = (box: DOMRect, area: { left: number; top: number; right: number; bottom: number }) =>
            box.right <= area.left || box.bottom <= area.top || box.left >= area.right || box.top >= area.bottom;
          // Script can scroll overflow: hidden, a finger cannot, so a control that starts clipped needs a user-scrollable ancestor.
          for (let parent = control.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (!outside(control.getBoundingClientRect(), parent.getBoundingClientRect())) continue;
            const scrollable = (/auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth)
              || (/auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight);
            if (!scrollable && style.overflow !== 'visible') return true;
          }
          control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return outside(control.getBoundingClientRect(), { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
        })
        .map((control) => control.getAttribute('aria-label') ?? control.outerHTML.slice(0, 80)));
      expect(unreachable, await tool.getAttribute('data-tool') ?? '').toEqual([]);
      expect(await page.evaluate(() => document.body.scrollWidth)).toBe(viewport.width);
      const fields = page.locator('input:visible, select:visible, textarea:visible');
      for (const field of await fields.all()) {
        expect(await field.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      }
    }
    if (viewport.height === 256) return;
    await page.locator('#stage').focus();
    for (let step = 0; step < 6; step++) await page.keyboard.press('-');
    await page.locator('.toolrail [data-tool="text"]').click();
    const stage = await page.locator('#stage').boundingBox();
    if (!stage) throw new Error('Stage is not visible');
    await page.locator('#stage').click({ position: { x: stage.width / 2, y: stage.height - 60 } });
    const editor = page.locator('.text-editor');
    await expect(editor).toBeVisible();
    expect(await editor.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await page.keyboard.press('Escape');
  });
}

test('mobile stroke and fill controls stay docked in the toolrail', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loadImage(page);
  const rail = await page.locator('.toolrail').boundingBox();
  const colors = await page.locator('.tool-colors').boundingBox();
  const stage = await page.locator('#stage').boundingBox();
  expect(rail && colors && stage).toBeTruthy();
  expect(colors!.x).toBeGreaterThanOrEqual(rail!.x);
  expect(colors!.x + colors!.width).toBeLessThanOrEqual(rail!.x + rail!.width);
  expect(colors!.y + colors!.height).toBeLessThanOrEqual(rail!.y + rail!.height);
  expect(colors!.x + colors!.width).toBeLessThanOrEqual(stage!.x);
  await page.locator('[data-tool="image"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-tool="image"]')).toBeInViewport();
});

test('symbol picker fits the mobile options palette at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loadImage(page);
  await page.locator('.toolrail [data-tool="symbol"]').click();
  const picker = page.locator('.symbol-options');
  await expect(picker).toBeVisible();
  await page.getByRole('button', { name: 'Star symbol' }).click();
  await page.getByRole('button', { name: 'Target reticle symbol' }).click();
  const bounds = await picker.boundingBox();
  const options = await page.locator('.optionsbar').boundingBox();
  const stage = await page.locator('#stage').boundingBox();
  expect(bounds && options && stage).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(options!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(options!.x + options!.width);
  expect(options!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(options!.y + options!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  await page.getByRole('button', { name: 'Target reticle symbol' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Target reticle symbol' })).toBeInViewport();
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

  test('opens tool options on tool choice and collapses them when drawing starts on the canvas', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="pen"]').click();
    const options = page.locator('.optionsbar');
    const toggle = page.locator('[data-action="toggle-options-panel"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Expand Layers panel' })).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Expand Tool options panel');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(options.locator('.options-heading')).toBeVisible();
    await expect(options.locator('[data-style="width"]')).toBeHidden();

    // Choosing a tool shows its options again.
    await page.locator('.toolrail [data-tool="rect"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(options.locator('[data-style="width"]')).toBeVisible();

    // A gesture on uncovered canvas collapses the panel and still draws.
    const panel = (await options.boundingBox())!;
    const stage = (await page.locator('#stage').boundingBox())!;
    const x = panel.x + panel.width + (stage.x + stage.width - panel.x - panel.width) / 2;
    const y = stage.y + stage.height * 0.6;
    await page.mouse.move(x - 20, y - 20);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 20, { steps: 4 });
    await page.mouse.up();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect((await saveScene(page)).objects).toHaveLength(1);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByText('File', { exact: true }).click();
    await page.locator('details[open]').getByRole('button', { name: 'Reset settings' }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('opening one mobile palette closes the other', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await loadImage(page);
    await page.locator('.toolrail [data-tool="pen"]').click();
    const options = page.locator('.optionsbar');
    const layers = page.locator('.layers-panel');
    const separated = async () => {
      const a = (await options.boundingBox())!;
      const b = (await layers.boundingBox())!;
      expect(a.y + a.height).toBeLessThanOrEqual(b.y);
    };
    await separated();
    await page.getByRole('button', { name: 'Expand Layers panel' }).click();
    await expect(page.getByRole('button', { name: 'Expand Tool options panel' })).toBeVisible();
    await separated();
    await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
    await expect(page.getByRole('button', { name: 'Expand Layers panel' })).toBeVisible();
    await separated();
  });

  test('drags and clamps the tool palette without drawing on it', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="pen"]').click();
    const panel = page.locator('.optionsbar');
    const heading = panel.locator('.options-heading');
    const start = (await heading.boundingBox())!;
    const before = (await panel.boundingBox())!;
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x + 55, start.y + 65, { steps: 4 });
    await page.mouse.up();
    const moved = (await panel.boundingBox())!;
    expect(moved.x).toBeGreaterThan(before.x);
    expect(moved.y).toBeGreaterThan(before.y);
    expect((await saveScene(page)).objects).toHaveLength(0);
    await panel.locator('.tool-options-preview').tap();
    expect((await saveScene(page)).objects).toHaveLength(0);
    const toggle = page.getByRole('button', { name: 'Collapse Tool options panel' });
    await toggle.tap();
    expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x, 0);
    await drag(page, [-20, -20], [20, 20], 4);
    expect((await saveScene(page)).objects).toHaveLength(1);
    await page.setViewportSize({ width: 320, height: 256 });
    const editor = (await page.locator('.editor').boundingBox())!;
    const clamped = (await panel.boundingBox())!;
    expect(clamped.x).toBeGreaterThanOrEqual(editor.x + 8);
    expect(clamped.y).toBeGreaterThanOrEqual(editor.y + 8);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(editor.x + editor.width - 8 + 1);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(editor.y + editor.height - 8 + 1);
  });

  test('clamps saved palette positions after tool content appears', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.addInitScript(() => localStorage.setItem('imagemarkup.panel-layout', JSON.stringify({ tools: { symbol: { left: 5000, top: 5000 } }, layers: { left: 5000, top: 5000 } })));
    await loadImage(page);
    await page.locator('.toolrail [data-tool="symbol"]').click();
    const editor = (await page.locator('.editor').boundingBox())!;
    for (const selector of ['.optionsbar', '.layers-panel']) {
      await expect.poll(async () => {
        const box = (await page.locator(selector).boundingBox())!;
        return box.x >= editor.x + 8 && box.y >= editor.y + 8
          && box.x + box.width <= editor.x + editor.width - 8 + 1
          && box.y + box.height <= editor.y + editor.height - 8 + 1;
      }).toBe(true);
    }
  });

  test('keeps both heading buttons operable when palettes overlap', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="pen"]').click();
    const options = page.locator('.optionsbar');
    const layers = page.locator('.layers-panel');
    const heading = (await layers.locator('.layers-heading').boundingBox())!;
    const target = (await options.boundingBox())!;
    await page.mouse.move(heading.x + 20, heading.y + 20);
    await page.mouse.down();
    await page.mouse.move(heading.x + 20, target.y + 120, { steps: 4 });
    await page.mouse.up();
    const layerBox = (await layers.boundingBox())!;
    expect(layerBox.y).toBeLessThan(target.y + target.height);
    expect(Number(await layers.evaluate((panel) => getComputedStyle(panel).zIndex))).toBeGreaterThan(Number(await options.evaluate((panel) => getComputedStyle(panel).zIndex)));
    await page.getByRole('button', { name: 'Collapse Tool options panel' }).click();
    await page.getByRole('button', { name: 'Expand Layers panel' }).click();
    await expect(page.getByRole('button', { name: 'Expand Tool options panel' })).toBeVisible();
  });

  test('keeps selected dimensions when tool options collapse', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="rect"]').click();
    await page.getByRole('button', { name: 'Collapse Tool options panel' }).click();
    await drag(page, [-40, -30], [40, 30]);
    await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
    const dimensions = page.locator('.optionsbar [data-selection-dimensions]');
    const width = dimensions.locator('[data-selection-size="width"]');
    const height = dimensions.locator('[data-selection-size="height"]');
    await expect(dimensions).toBeVisible();
    expect(await page.locator('.optionsbar').evaluate((bar) => bar.scrollWidth <= bar.clientWidth + 1)).toBe(true);
    await dimensions.locator('[data-action="toggle-selection-aspect"]').click();
    await width.fill('120');
    await width.press('Tab');
    await height.fill('70');
    await height.press('Tab');
    await page.getByRole('button', { name: 'Collapse Tool options panel' }).click();
    await expect(dimensions).toBeHidden();
    await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
    await expect(width).toHaveValue('120');
    await expect(height).toHaveValue('70');
    await expect(dimensions.locator('[data-action="toggle-selection-aspect"]')).toHaveAttribute('aria-pressed', 'false');
    await width.focus();
    // Wider than 760px the dimensions move to the top bar, keeping focus and value.
    const anyWidth = page.locator('[data-selection-size="width"]');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(anyWidth).toBeFocused();
    await expect(anyWidth).toHaveValue('120');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(width).toBeFocused();
    await expect(page.locator('[data-selection-dimensions]')).toHaveCount(1);
    expect((await saveScene(page)).selectedId).toBeTruthy();
  });

  test('keeps inline text editing open while changing a floating option', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="text"]').click();
    const stage = (await page.locator('#stage').boundingBox())!;
    await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height - 60);
    const editor = page.locator('.text-editor');
    await editor.fill('Palette text');
    // The tap that opened the editor collapsed the panel; reopening it keeps the editor open.
    await page.getByRole('button', { name: 'Expand Tool options panel' }).click();
    await expect(editor).toBeVisible();
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect(editor).toBeVisible();
    // A canvas tap commits the edit; with Text still active it opens a new, empty editor.
    await page.mouse.click(stage.x + 20, stage.y + stage.height - 30);
    await expect(editor).toHaveValue('');
    await page.keyboard.press('Escape');
    expect((await saveScene(page)).objects).toEqual([expect.objectContaining({ type: 'text', text: 'Palette text', fontWeight: 'bold' })]);
  });

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
    await page.getByRole('button', { name: 'Collapse Tool options panel' }).click();
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
    await options.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await options.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.locator('.toolrail [data-tool="text"]').click();
    await expect.poll(() => options.evaluate((element) => element.scrollTop)).toBe(0);
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
    // Double-tap page zoom would strand the UI, since pinch-out is blocked.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
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

  test('keeps counter options intact and vertically scrollable', async ({ page }) => {
    await loadImage(page);
    await page.locator('.toolrail [data-tool="counter"]').click();

    const options = page.locator('.optionsbar');
    await expect.poll(() => options.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await options.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    for (const row of [
      options.locator('[data-choice-for="counter-shape"]'),
      options.locator('[data-choice-for="counter-format"]'),
    ]) {
      const buttons = await row.locator('button').all();
      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        const box = await button.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(30);
        expect(box?.height).toBeGreaterThanOrEqual(30);
      }
    }
    await options.locator('[data-choice-for="counter-format"] button:last-child').scrollIntoViewIfNeeded();
    await expect(options.locator('[data-choice-for="counter-format"] button:last-child')).toBeInViewport();
    await options.locator('[data-style="counter-next"]').scrollIntoViewIfNeeded();
    await expect(options.locator('[data-style="counter-next"]')).toBeInViewport();
  });

  test('keeps stage bounds fixed across tool changes', async ({ page }) => {
    await loadImage(page);
    const stage = page.locator('#stage');
    const before = await stage.boundingBox();
    for (const tool of ['pen', 'symbol', 'crop', 'select']) {
      await page.locator(`.toolrail [data-tool="${tool}"]`).click();
      expect(await stage.boundingBox(), tool).toEqual(before);
    }
  });
});
