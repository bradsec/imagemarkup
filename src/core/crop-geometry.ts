import type { Point, Rect } from './geometry';

export function cropFromDrag(start: Point, end: Point, imageWidth: number, imageHeight: number, ratio?: number): Rect {
  const x0 = Math.max(0, Math.min(imageWidth, start.x));
  const y0 = Math.max(0, Math.min(imageHeight, start.y));
  const x1 = Math.max(0, Math.min(imageWidth, end.x));
  const y1 = Math.max(0, Math.min(imageHeight, end.y));
  if (!ratio) return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  const signX = end.x < start.x ? -1 : 1;
  const signY = end.y < start.y ? -1 : 1;
  const limitWidth = signX < 0 ? x0 : imageWidth - x0;
  const limitHeight = signY < 0 ? y0 : imageHeight - y0;
  const width = Math.min(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0) * ratio), limitWidth, limitHeight * ratio);
  const height = width / ratio;
  return { x: signX < 0 ? x0 - width : x0, y: signY < 0 ? y0 - height : y0, w: width, h: height };
}

export function moveCrop(crop: Rect, dx: number, dy: number, imageWidth: number, imageHeight: number): Rect {
  return { ...crop, x: Math.max(0, Math.min(imageWidth - crop.w, crop.x + dx)), y: Math.max(0, Math.min(imageHeight - crop.h, crop.y + dy)) };
}

export function clampCrop(crop: Rect, imageWidth: number, imageHeight: number): Rect {
  const scale = Math.min(1, imageWidth / crop.w, imageHeight / crop.h);
  const w = crop.w * scale;
  const h = crop.h * scale;
  return { x: Math.max(0, Math.min(imageWidth - w, crop.x)), y: Math.max(0, Math.min(imageHeight - h, crop.y)), w, h };
}
