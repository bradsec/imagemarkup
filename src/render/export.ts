import type { Scene } from '../core/types';
import { drawArtwork, drawWatermark } from './renderer';
import { annotationVisualBounds } from '../core/annotations';
import type { Rect } from '../core/geometry';

export type ExportFormat = 'png' | 'jpeg';

export function exportBounds(scene: Scene): Rect {
  if (!scene.image) return { x: 0, y: 0, w: 0, h: 0 };
  const crop = scene.crop && scene.crop.w > 0 && scene.crop.h > 0 ? scene.crop : { x: 0, y: 0, w: scene.image.width, h: scene.image.height };
  const border = scene.border?.width ?? 0;
  let left = crop.x - border;
  let top = crop.y - border;
  let right = crop.x + crop.w + border;
  let bottom = crop.y + crop.h + border;
  if (scene.showOverflow) {
    for (const object of scene.objects) {
      if (object.hidden) continue;
      const bounds = annotationVisualBounds(object);
      left = Math.min(left, bounds.x);
      top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.w);
      bottom = Math.max(bottom, bounds.y + bounds.h);
    }
  }
  left = Math.floor(left);
  top = Math.floor(top);
  right = Math.ceil(right);
  bottom = Math.ceil(bottom);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function exportSize(scene: Scene, scale = 1): { width: number; height: number } {
  const bounds = exportBounds(scene);
  return { width: Math.ceil(bounds.w * scale), height: Math.ceil(bounds.h * scale) };
}

export async function exportScene(scene: Scene, format: ExportFormat, scale = 1, quality = 0.9): Promise<Blob> {
  if (!scene.image) throw new Error('Load an image before exporting');
  await document.fonts?.ready;
  const crop = scene.crop && scene.crop.w > 0 && scene.crop.h > 0
    ? scene.crop
    : { x: 0, y: 0, w: scene.image.width, h: scene.image.height };
  const border = scene.border?.width ?? 0;
  const bounds = exportBounds(scene);
  const size = exportSize(scene, scale);
  if (size.width > 32_768 || size.height > 32_768 || size.width * size.height > 268_000_000) throw new Error('Export dimensions are too large');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
  if (scene.border) {
    ctx.fillStyle = scene.border.color;
    ctx.fillRect(crop.x - border, crop.y - border, crop.w + border * 2, crop.h + border * 2);
  }
  drawArtwork(ctx, scene, false);
  ctx.setTransform(scale, 0, 0, scale, (crop.x - bounds.x) * scale, (crop.y - bounds.y) * scale);
  if (scene.watermark) drawWatermark(ctx, scene.watermark, crop.w, crop.h);
  ctx.resetTransform();
  if (format === 'jpeg') {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not encode image')),
    `image/${format}`,
    quality,
  ));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
