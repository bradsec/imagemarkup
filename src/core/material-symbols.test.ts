import { createCanvas, Path2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { MATERIAL_SYMBOLS, SYMBOL_GROUPS } from './material-symbols';

describe('symbol library', () => {
  it('renders every offered symbol with a non-empty path', () => {
    for (const group of SYMBOL_GROUPS) {
      expect(group.label).toBeTruthy();
      for (const name of group.names) {
        const symbol = MATERIAL_SYMBOLS[name];
        expect(symbol, name).toBeDefined();
        const canvas = createCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        if (symbol.viewBox) ctx.scale(100 / 512, 100 / 512);
        else { ctx.translate(0, 100); ctx.scale(100 / 960, 100 / 960); }
        ctx.fill(new Path2D(symbol.path));
        const pixels = canvas.getContext('2d').getImageData(0, 0, 100, 100).data;
        expect(pixels.some((alpha, index) => index % 4 === 3 && alpha > 0), name).toBe(true);
      }
    }
  });

  it('keeps the center of a ring transparent', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.scale(100 / 512, 100 / 512);
    ctx.fill(new Path2D(MATERIAL_SYMBOLS.ring.path));
    expect(ctx.getImageData(50, 50, 1, 1).data[3]).toBe(0);
  });
});
