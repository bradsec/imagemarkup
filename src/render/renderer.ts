import { type Scene, type Watermark } from '../core/types';
import { annotationBounds, annotationHandles, annotationVisualBounds } from '../core/annotations';
import type { Rect } from '../core/geometry';
export type { Surface } from './surface';
import type { Surface } from './surface';
import { drawRedaction } from './redaction';
import { drawAnnotation } from './draw-annotations';
export { counterLabel, drawAnnotation } from './draw-annotations';

const REDACTION_TILE_SIZE = 1024;
const REDACTION_TILE_BLEED = 200;

export const DEFAULT_SELECTION_COLOR = '#17c0b8';

let selectionColor = DEFAULT_SELECTION_COLOR;

export function setSelectionColor(color: string): void {
  if (/^#[0-9a-f]{6}$/i.test(color)) selectionColor = color;
}

export function drawCheckerboard(s: Surface, a: string, b: string, size = 12): void {
  const { ctx, width, height } = s;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = b;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
    }
  }
}

export function artworkBounds(scene: Scene, includeOverflow = scene.showOverflow): Rect {
  const image = scene.image;
  if (!image) return { x: 0, y: 0, w: 0, h: 0 };
  let left = 0;
  let top = 0;
  let right = image.width;
  let bottom = image.height;
  if (includeOverflow) {
    for (const object of scene.objects) {
      if (object.hidden) continue;
      const bounds = annotationVisualBounds(object);
      left = Math.min(left, bounds.x);
      top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.w);
      bottom = Math.max(bottom, bounds.y + bounds.h);
    }
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function drawArtwork(ctx: CanvasRenderingContext2D, scene: Scene, includeWatermark = true, imageClip?: Rect): void {
  const img = scene.image;
  if (!img) return;
  const objects = scene.objects.filter((object) => !object.hidden);
  const drawBaseImage = (target: CanvasRenderingContext2D): void => {
    if (imageClip) {
      target.save();
      target.beginPath();
      target.rect(imageClip.x, imageClip.y, imageClip.w, imageClip.h);
      target.clip();
    }
    target.drawImage(img.source, 0, 0, img.width, img.height);
    if (imageClip) target.restore();
  };

  if (!objects.some((object) => object.type === 'redaction')) {
    ctx.imageSmoothingEnabled = true;
    drawBaseImage(ctx);
    for (const object of objects) drawAnnotation(ctx, object);
    if (includeWatermark && scene.watermark) drawWatermark(ctx, scene.watermark, img.width, img.height);
    return;
  }

  const bounds = artworkBounds(scene);
  const left = Math.floor(bounds.x);
  const top = Math.floor(bounds.y);
  const right = Math.ceil(bounds.x + bounds.w);
  const bottom = Math.ceil(bounds.y + bounds.h);
  for (let tileY = top; tileY < bottom; tileY += REDACTION_TILE_SIZE) {
    for (let tileX = left; tileX < right; tileX += REDACTION_TILE_SIZE) {
      const tileWidth = Math.min(REDACTION_TILE_SIZE, right - tileX);
      const tileHeight = Math.min(REDACTION_TILE_SIZE, bottom - tileY);
      const origin = { x: tileX - REDACTION_TILE_BLEED, y: tileY - REDACTION_TILE_BLEED };
      const surfaceWidth = tileWidth + REDACTION_TILE_BLEED * 2;
      const surfaceHeight = tileHeight + REDACTION_TILE_BLEED * 2;
      const artwork = createCanvas(ctx, surfaceWidth, surfaceHeight);
      const artworkCtx = artwork.getContext('2d') as CanvasRenderingContext2D;
      artworkCtx.imageSmoothingEnabled = true;
      artworkCtx.translate(-origin.x, -origin.y);
      drawBaseImage(artworkCtx);
      const snapshot = createCanvas(ctx, surfaceWidth, surfaceHeight);
      const snapshotCtx = snapshot.getContext('2d') as CanvasRenderingContext2D;
      for (const object of objects) {
        if (object.type === 'redaction') {
          snapshotCtx.clearRect(0, 0, surfaceWidth, surfaceHeight);
          snapshotCtx.drawImage(artwork, 0, 0);
          drawRedaction(artworkCtx, object, snapshot, origin);
        } else {
          drawAnnotation(artworkCtx, object);
        }
      }
      if (includeWatermark && scene.watermark) drawWatermark(artworkCtx, scene.watermark, img.width, img.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        artwork,
        REDACTION_TILE_BLEED,
        REDACTION_TILE_BLEED,
        tileWidth,
        tileHeight,
        tileX,
        tileY,
        tileWidth,
        tileHeight,
      );
    }
  }
}

export function drawWatermark(ctx: CanvasRenderingContext2D, watermark: Watermark, width: number, height: number): void {
  const angle = (watermark.angle ?? -30) * Math.PI / 180;
  ctx.save();
  ctx.globalAlpha = watermark.opacity;

  if (watermark.kind === 'text') {
    ctx.fillStyle = watermark.color;
    const fontFamily = (watermark.fontFamily ?? 'system-ui').replace(/["\\]/g, '');
    ctx.font = `${watermark.fontStyle ?? 'normal'} ${watermark.fontWeight ?? 'normal'} ${watermark.size}px "${fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(watermark.text);
    const measuredWidth = Math.max(1, metrics.width);
    const textHeight = Math.max(watermark.size, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rotatedWidth = measuredWidth * cos + textHeight * sin;
    const rotatedHeight = measuredWidth * sin + textHeight * cos;
    const maxWidth = watermark.tile ? width * .62 : Math.max(1, width - 32);
    const maxHeight = watermark.tile ? height * .35 : Math.max(1, height - 32);
    const markScale = Math.min(1, maxWidth / rotatedWidth, maxHeight / rotatedHeight);
    const mark = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(markScale, markScale);
      ctx.fillText(watermark.text, 0, 0);
      ctx.restore();
    };
    if (watermark.tile) {
      const { stepX, stepY } = watermarkTileSpacing(rotatedWidth, rotatedHeight, markScale, watermark.size);
      for (let y = stepY / 2, row = 0; y < height; y += stepY, row++) {
        for (let x = (row % 2 ? 0 : -stepX / 2); x < width + stepX / 2; x += stepX) mark(x, y);
      }
    } else {
      mark(width / 2, height / 2);
    }
  } else if (watermark.source) {
    const source = watermark.source as CanvasImageSource & { width?: number; height?: number };
    const sourceWidth = source.width ?? width;
    const sourceHeight = source.height ?? height;
    let markWidth = width * watermark.scale;
    let markHeight = markWidth * sourceHeight / sourceWidth;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rotatedWidth = markWidth * cos + markHeight * sin;
    const rotatedHeight = markWidth * sin + markHeight * cos;
    const maxWidth = watermark.tile ? width * .62 : Math.max(1, width - 32);
    const maxHeight = watermark.tile ? height * .35 : Math.max(1, height - 32);
    const markScale = Math.min(1, maxWidth / rotatedWidth, maxHeight / rotatedHeight);
    markWidth *= markScale;
    markHeight *= markScale;
    const mark = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(source, -markWidth / 2, -markHeight / 2, markWidth, markHeight);
      ctx.restore();
    };
    if (watermark.tile) {
      const { stepX, stepY } = watermarkTileSpacing(rotatedWidth, rotatedHeight, markScale, 12);
      for (let y = stepY / 2, row = 0; y < height; y += stepY, row++) {
        for (let x = (row % 2 ? stepX / 2 : 0); x < width + stepX / 2; x += stepX) mark(x, y);
      }
    } else {
      mark(width / 2, height / 2);
    }
  }
  ctx.restore();
}

export function watermarkTileSpacing(rotatedWidth: number, rotatedHeight: number, scale: number, baseGap: number): { stepX: number; stepY: number } {
  const width = rotatedWidth * scale;
  const height = rotatedHeight * scale;
  const gap = Math.max(baseGap * scale, width * .18, height * .18);
  return {
    stepX: width + gap,
    stepY: height + gap,
  };
}

function createCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  const Canvas = ctx.canvas.constructor as unknown as new (canvasWidth: number, canvasHeight: number) => HTMLCanvasElement;
  return new Canvas(width, height);
}

export function renderArtwork(s: Surface, scene: Scene, scale = 1): void {
  const { ctx, width, height } = s;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawArtwork(ctx, scene);
  ctx.restore();
}

export function renderScene(s: Surface, scene: Scene): void {
  const { ctx, width, height } = s;
  ctx.clearRect(0, 0, width, height);
  drawCheckerboard(s, '#2a3040', '#232838');

  if (!scene.image) return;

  const { scale, tx, ty } = scene.viewport;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, tx, ty);
  if (scene.border) {
    ctx.fillStyle = scene.border.color;
    ctx.fillRect(-scene.border.width, -scene.border.width, scene.image.width + scene.border.width * 2, scene.image.height + scene.border.width * 2);
  }
  if (scene.showOverflow) {
    drawArtwork(ctx, scene);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, scene.image.width, scene.image.height);
    ctx.clip();
    drawArtwork(ctx, scene);
    ctx.restore();
  }
  const selectedIds = (scene.selectedIds ?? []).length ? scene.selectedIds : (scene.selectedId ? [scene.selectedId] : []);
  const selectedSet = new Set(selectedIds);
  const selectedObjects = scene.objects.filter((object) => !object.hidden && selectedSet.has(object.id));
  const single = selectedObjects.length === 1 ? selectedObjects[0] : null;
  for (const object of selectedObjects) {
    if ('start' in object) {
      const handles = annotationHandles(object);
      const start = handles.find(({ handle }) => handle === 'start')!.point;
      const end = handles.find(({ handle }) => handle === 'end')!.point;
      const rotate = handles.find(({ handle }) => handle === 'rotate')!.point;
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      ctx.save();
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (single && !object.locked) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(midpoint.x, midpoint.y);
        ctx.lineTo(rotate.x, rotate.y);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    const bounds = annotationBounds(object);
    const padding = object.type === 'text' || object.type === 'image' || object.style.stroke === false ? 0 : object.style.width / 2;
    const { x, y, w, h } = { x: bounds.x - padding, y: bounds.y - padding, w: bounds.w + padding * 2, h: bounds.h + padding * 2 };
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    ctx.save();
    if (object.rotation) {
      ctx.translate(center.x, center.y);
      ctx.rotate(object.rotation);
      ctx.translate(-center.x, -center.y);
    }
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.strokeRect(x, y, w, h);
    if (single && !object.locked) {
      // Connect the rotate grip to the top edge so it reads as a handle, not a stray dot.
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(center.x, y);
      ctx.lineTo(center.x, y - 24);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (single && !single.locked) {
    ctx.setLineDash([]);
    ctx.fillStyle = selectionColor;
    const size = 8 / scale;
    for (const { handle, point } of annotationHandles(single)) {
      if (handle === 'rotate') {
        ctx.beginPath();
        ctx.arc(point.x, point.y, size * .65, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      }
    }
  }
  if (scene.marquee && scene.marquee.w > 0 && scene.marquee.h > 0) {
    const { x, y, w, h } = scene.marquee;
    ctx.save();
    ctx.globalAlpha = .12;
    ctx.fillStyle = selectionColor;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
  if (scene.crop && scene.crop.w > 0 && scene.crop.h > 0) {
    const { x, y, w, h } = scene.crop;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, .5)';
    ctx.fillRect(0, 0, scene.image.width, y);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, scene.image.width - x - w, h);
    ctx.fillRect(0, y + h, scene.image.width, scene.image.height - y - h);
    ctx.restore();
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([8 / scale, 5 / scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x + w / 3, y); ctx.lineTo(x + w / 3, y + h);
    ctx.moveTo(x + w * 2 / 3, y); ctx.lineTo(x + w * 2 / 3, y + h);
    ctx.moveTo(x, y + h / 3); ctx.lineTo(x + w, y + h / 3);
    ctx.moveTo(x, y + h * 2 / 3); ctx.lineTo(x + w, y + h * 2 / 3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const fake = { id: 'crop', type: 'rect' as const, rect: scene.crop, style: scene.toolStyle };
    const handleSize = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 14 : 8) / scale;
    ctx.fillStyle = selectionColor;
    for (const { handle, point } of annotationHandles(fake)) if (handle !== 'rotate') ctx.fillRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
    const label = `${Math.round(w)} x ${Math.round(h)} px`;
    ctx.font = `${12 / scale}px system-ui`;
    const labelWidth = ctx.measureText(label).width + 12 / scale;
    const labelX = Math.max(0, Math.min(x, scene.image.width - labelWidth));
    const labelY = y > 26 / scale ? y - 23 / scale : Math.min(scene.image.height - 20 / scale, y + h + 4 / scale);
    ctx.fillStyle = 'rgba(0, 0, 0, .8)';
    ctx.fillRect(labelX, labelY, labelWidth, 19 / scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, labelX + 6 / scale, labelY + 14 / scale);
  }
  ctx.restore();
}
