import { describe, expect, it } from 'vitest';
import { createScene, type Tool } from '../core/types';
import { annotationBounds } from '../core/annotations';
import { buildPreviewScene, previewBackground } from './options-preview';

describe('buildPreviewScene', () => {
  it('shows styled tools and hides tools without a useful sample', () => {
    const scene = createScene();
    for (const tool of ['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'counter', 'symbol', 'redaction'] as Tool[]) {
      scene.activeTool = tool;
      expect(buildPreviewScene(scene, undefined)?.object.type).toBe(tool);
    }
    for (const tool of ['select', 'crop', 'image', 'pan'] as Tool[]) {
      scene.activeTool = tool;
      expect(buildPreviewScene(scene, undefined)).toBeNull();
    }
  });

  it('keeps sample geometry fixed and draws widths at true size until the tile cap', () => {
    const scene = createScene();
    scene.activeTool = 'arrow';
    scene.toolStyle.width = 2;
    const thin = buildPreviewScene(scene, undefined)!;
    scene.toolStyle.width = 6;
    const thick = buildPreviewScene(scene, undefined)!;
    expect(thick.object).toMatchObject({ start: (thin.object as { start: unknown }).start, end: (thin.object as { end: unknown }).end });
    expect(thick.object.style.width).toBe(6);
    expect(thick.sizeLabel).toBeNull();
    scene.toolStyle.width = 40;
    const capped = buildPreviewScene(scene, undefined)!;
    expect(capped.object.style.width).toBeLessThan(40);
    expect(capped.sizeLabel).toBe('40 px');
  });

  it('uses the selected object style and hides locked selections', () => {
    const scene = createScene();
    scene.activeTool = 'pen';
    const base = buildPreviewScene(scene, undefined)!;
    const selected = { ...base.object, style: { ...base.object.style, width: 8, color: '#123456' } };
    expect(buildPreviewScene(scene, selected)!.object.style).toEqual(selected.style);
    expect(buildPreviewScene(scene, { ...selected, locked: true })).toBeNull();
  });

  it('shows text and counter sizes at true size until the tile cap, then labels them', () => {
    const scene = createScene();
    scene.activeTool = 'text';
    const sizes = [8, 20, 40].map((fontSize) => { scene.fontSize = fontSize; return buildPreviewScene(scene, undefined)!; });
    expect(sizes.map((preview) => (preview.object as { fontSize: number }).fontSize)).toEqual([8, 20, 40]);
    expect(sizes.every((preview) => preview.sizeLabel === null)).toBe(true);
    scene.fontSize = 300;
    const big = buildPreviewScene(scene, undefined)!;
    expect((big.object as { fontSize: number }).fontSize).toBeLessThan(300);
    expect(big.sizeLabel).toBe('300 px');
    scene.activeTool = 'counter'; scene.counterSize = 12;
    expect(buildPreviewScene(scene, undefined)).toMatchObject({ object: { radius: 12 }, sizeLabel: null });
    scene.counterSize = 64;
    const counter = buildPreviewScene(scene, undefined)!;
    expect((counter.object as { radius: number }).radius).toBeLessThan(64);
    expect(counter.sizeLabel).toBe('64 px');
    scene.activeTool = 'redaction';
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBeNull();
  });

  it('centers the text sample in the tile at any font size', () => {
    const scene = createScene();
    scene.activeTool = 'text';
    for (const fontSize of [8, 32, 300]) {
      scene.fontSize = fontSize;
      const bounds = annotationBounds(buildPreviewScene(scene, undefined)!.object);
      expect(bounds.x + bounds.w / 2).toBeCloseTo(40);
      expect(bounds.y + bounds.h / 2).toBeCloseTo(40);
    }
  });
  it('uses a dark tile background for light samples so white marks stay visible', () => {
    const scene = createScene();
    scene.activeTool = 'text';
    scene.toolStyle.color = '#ffffff';
    expect(previewBackground(buildPreviewScene(scene, undefined)!.object)).toBe('#2b3036');
    scene.toolStyle.color = '#ff3b30';
    expect(previewBackground(buildPreviewScene(scene, undefined)!.object)).toBe('#ffffff');
    scene.activeTool = 'counter';
    scene.toolStyle = { ...scene.toolStyle, fill: '#fafafa', stroke: false };
    expect(previewBackground(buildPreviewScene(scene, undefined)!.object)).toBe('#2b3036');
  });
});
