import { describe, expect, it } from 'vitest';
import { createScene, type Tool } from '../core/types';
import { annotationBounds } from '../core/annotations';
import { buildPreviewScene } from './options-preview';

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

  it('fits oversized strokes and uses the selected object style', () => {
    const scene = createScene();
    scene.activeTool = 'pen';
    scene.toolStyle.width = 120;
    const wide = buildPreviewScene(scene, undefined)!;
    expect(wide.scale).toBeLessThan(1);
    expect(wide.sizeLabel).toBe('120 px');
    const selected = { ...wide.object, style: { ...wide.object.style, width: 8, color: '#123456' } };
    const preview = buildPreviewScene(scene, selected)!;
    expect(preview.object.style).toEqual(selected.style);
    expect(preview.scale).toBe(1);
    expect(buildPreviewScene(scene, { ...selected, locked: true })).toBeNull();
  });

  it('labels the control value whenever the sample is drawn below true size', () => {
    const scene = createScene();
    scene.activeTool = 'text'; scene.fontSize = 300;
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBe('300 px');
    scene.fontSize = 12;
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBeNull();
    scene.activeTool = 'counter'; scene.counterSize = 64;
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBe('64 px');
    scene.activeTool = 'arrow'; scene.toolStyle.width = 12;
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBe('12 px');
    scene.activeTool = 'rect'; scene.toolStyle.width = 4;
    expect(buildPreviewScene(scene, undefined)?.sizeLabel).toBeNull();
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

  it('fits large counter and text samples in the tile', () => {
    const scene = createScene();
    scene.activeTool = 'counter'; scene.counterSize = 80;
    expect(buildPreviewScene(scene, undefined)?.scale).toBeLessThan(1);
    scene.activeTool = 'text'; scene.fontSize = 200;
    expect(buildPreviewScene(scene, undefined)?.scale).toBeLessThan(1);
    scene.activeTool = 'arrow'; scene.toolStyle.width = 40;
    expect(buildPreviewScene(scene, undefined)?.scale).toBeLessThan(.3);
  });
});
