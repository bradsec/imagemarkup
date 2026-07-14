import { describe, it, expect } from 'vitest';
import { screenToImage, imageToScreen, type Viewport } from './geometry';

const v: Viewport = { scale: 2, tx: 30, ty: -10 };

describe('coordinate transforms', () => {
  it('maps image-space to screen-space', () => {
    expect(imageToScreen({ x: 10, y: 20 }, v)).toEqual({ x: 50, y: 30 });
  });

  it('is the inverse of screenToImage', () => {
    const p = { x: 123.5, y: 88 };
    const round = imageToScreen(screenToImage(p, v), v);
    expect(round.x).toBeCloseTo(p.x, 10);
    expect(round.y).toBeCloseTo(p.y, 10);
  });
});
