import { expect, it } from 'vitest';
import { clampCrop, cropFromDrag, moveCrop } from './crop-geometry';

it('keeps fixed-ratio crops square and inside the image', () => {
  expect(cropFromDrag({ x: 80, y: 80 }, { x: 120, y: 100 }, 100, 100, 1)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  expect(moveCrop({ x: 80, y: 80, w: 20, h: 20 }, 10, 10, 100, 100)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
});

it('keeps proportionally resized crops inside the image', () => {
  expect(clampCrop({ x: 80, y: 80, w: 40, h: 40 }, 100, 100)).toEqual({ x: 60, y: 60, w: 40, h: 40 });
});
