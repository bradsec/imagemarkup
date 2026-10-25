import { expect, it } from 'vitest';
import { clampCrop, cropFromDrag, fitCropToRatio, moveCrop } from './crop-geometry';

it('keeps fixed-ratio crops square and inside the image', () => {
  expect(cropFromDrag({ x: 80, y: 80 }, { x: 120, y: 100 }, 100, 100, 1)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  expect(moveCrop({ x: 80, y: 80, w: 20, h: 20 }, 10, 10, 100, 100)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
});

it('keeps proportionally resized crops inside the image', () => {
  expect(clampCrop({ x: 80, y: 80, w: 40, h: 40 }, 100, 100)).toEqual({ x: 60, y: 60, w: 40, h: 40 });
});

it('reshapes an existing crop to a ratio around its center, keeping its area', () => {
  const crop = fitCropToRatio({ x: 100, y: 100, w: 200, h: 200 }, 4, 1000, 1000);
  expect(crop.w / crop.h).toBeCloseTo(4);
  expect(crop.w * crop.h).toBeCloseTo(40_000);
  expect(crop.x + crop.w / 2).toBeCloseTo(200);
  expect(crop.y + crop.h / 2).toBeCloseTo(200);
});

it('swaps width and height when the ratio is inverted', () => {
  const wide = fitCropToRatio({ x: 100, y: 200, w: 400, h: 300 }, 4 / 3, 1000, 1000);
  const tall = fitCropToRatio(wide, 3 / 4, 1000, 1000);
  expect(tall.w).toBeCloseTo(wide.h);
  expect(tall.h).toBeCloseTo(wide.w);
});

it('keeps a reshaped crop inside the image and creates a centered crop when none exists', () => {
  const clamped = fitCropToRatio({ x: 0, y: 0, w: 100, h: 100 }, 16 / 9, 120, 100);
  expect(clamped.x).toBeGreaterThanOrEqual(0);
  expect(clamped.x + clamped.w).toBeLessThanOrEqual(120 + 1e-9);
  expect(clamped.w / clamped.h).toBeCloseTo(16 / 9);
  const created = fitCropToRatio(null, 1, 400, 200);
  expect(created).toEqual({ x: 120, y: 20, w: 160, h: 160 });
});
