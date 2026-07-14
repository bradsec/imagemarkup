import { describe, expect, it } from 'vitest';
import { createScene } from '../core/types';
import { exportBounds, exportSize } from './export';

describe('export sizing', () => {
  it('applies crop, border, and output scale', () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: '', width: 800, height: 600 };
    scene.crop = { x: 100, y: 50, w: 400, h: 300 };
    scene.border = { width: 10, color: '#000000' };
    expect(exportSize(scene, 2)).toEqual({ width: 840, height: 640 });
  });

  it('expands around overflow objects while retaining the image origin', () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: '', width: 800, height: 600 };
    scene.showOverflow = true;
    scene.objects.push({ id: 'overflow', type: 'image', rect: { x: -40, y: -20, w: 900, h: 650 }, dataUrl: 'data:image/png;base64,AA==', style: { color: '#000000', width: 1, opacity: 1 } });

    expect(exportBounds(scene)).toEqual({ x: -40, y: -20, w: 900, h: 650 });
    expect(exportSize(scene, 2)).toEqual({ width: 1800, height: 1300 });
  });
});
