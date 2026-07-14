import type { RedactionAnnotation } from '../core/types';

export function normalizeRedactionStrength(value: number): number {
  return Math.max(2, Math.min(100, Math.round(Number.isFinite(value) ? value : 10)));
}

export function drawRedaction(ctx: CanvasRenderingContext2D, object: RedactionAnnotation, source: CanvasImageSource, sourceOrigin = { x: 0, y: 0 }): void {
  const { x, y, w, h } = object.rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const strength = normalizeRedactionStrength(object.strength);

  if (object.mode === 'blur') {
    ctx.filter = `blur(${strength}px)`;
    ctx.drawImage(source, sourceOrigin.x, sourceOrigin.y);
  } else {
    const columns = Math.max(1, Math.ceil(w / strength));
    const rows = Math.max(1, Math.ceil(h / strength));
    const scratch = createScratch(ctx, columns, rows);
    const scratchCtx = scratch.getContext('2d') as CanvasRenderingContext2D;
    scratchCtx.imageSmoothingEnabled = true;
    scratchCtx.drawImage(source, x - sourceOrigin.x, y - sourceOrigin.y, w, h, 0, 0, columns, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, columns, rows, x, y, w, h);
  }
  ctx.restore();
}

function createScratch(ctx: CanvasRenderingContext2D, width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }
  const Canvas = ctx.canvas.constructor as unknown as new (width: number, height: number) => HTMLCanvasElement;
  return new Canvas(width, height);
}
