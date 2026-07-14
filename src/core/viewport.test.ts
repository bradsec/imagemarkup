import { describe, it, expect } from 'vitest';
import { zoomAt, panBy, fitViewport, clampScale, MAX_SCALE, MIN_SCALE } from './viewport';
import { screenToImage, imageToScreen, type Viewport } from './geometry';

describe('viewport', () => {
  it('keeps the image point under the anchor fixed while zooming', () => {
    const v: Viewport = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 100, y: 60 };
    const imageBefore = screenToImage(anchor, v);
    const zoomed = zoomAt(v, anchor, 2);
    const screenAfter = imageToScreen(imageBefore, zoomed);
    expect(zoomed.scale).toBe(2);
    expect(screenAfter.x).toBeCloseTo(anchor.x, 10);
    expect(screenAfter.y).toBeCloseTo(anchor.y, 10);
  });

  it('clamps scale to bounds', () => {
    expect(clampScale(9999)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
  });

  it('does not overshoot translate when zoom is clamped', () => {
    const v: Viewport = { scale: MAX_SCALE, tx: 5, ty: 5 };
    const anchor = { x: 10, y: 10 };
    const zoomed = zoomAt(v, anchor, 4);
    expect(zoomed.scale).toBe(MAX_SCALE);
    expect(zoomed.tx).toBe(5);
    expect(zoomed.ty).toBe(5);
  });

  it('pans by a delta', () => {
    expect(panBy({ scale: 1, tx: 2, ty: 3 }, 10, -4)).toEqual({ scale: 1, tx: 12, ty: -1 });
  });

  it('fits and centers an image in the canvas', () => {
    const v = fitViewport(100, 100, 200, 400, 1);
    expect(v.scale).toBe(2);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(100);
  });
});
