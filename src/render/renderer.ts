import type { Annotation, ArrowHead, CounterFormat, Scene, SymbolAnnotation, Watermark } from '../core/types';
import { annotationBounds, annotationHandles, annotationVisualBounds } from '../core/annotations';
import { MATERIAL_SYMBOLS } from '../core/material-symbols';
import type { Rect } from '../core/geometry';
export type { Surface } from './surface';
import type { Surface } from './surface';
import { drawRedaction } from './redaction';

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

export function drawArtwork(ctx: CanvasRenderingContext2D, scene: Scene, includeWatermark = true): void {
  const img = scene.image;
  if (!img) return;
  const objects = scene.objects.filter((object) => !object.hidden);

  if (!objects.some((object) => object.type === 'redaction')) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img.source, 0, 0, img.width, img.height);
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
      artworkCtx.drawImage(img.source, 0, 0, img.width, img.height);
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
    const textWidth = Math.max(1, metrics.width);
    const textHeight = Math.max(watermark.size, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rotatedWidth = textWidth * cos + textHeight * sin;
    const rotatedHeight = textWidth * sin + textHeight * cos;
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

export function counterLabel(value: number, format: CounterFormat = 'numeric'): string {
  if (format === 'numeric') return String(value);
  if (format === 'alpha') {
    let current = Math.max(1, value);
    let label = '';
    while (current > 0) {
      current--;
      label = String.fromCharCode(65 + current % 26) + label;
      current = Math.floor(current / 26);
    }
    return label;
  }
  if (value <= 0 || value > 3999) return String(value);
  const numerals: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let current = value;
  let label = '';
  for (const [amount, numeral] of numerals) while (current >= amount) { label += numeral; current -= amount; }
  return label;
}

function drawAnnotation(ctx: CanvasRenderingContext2D, object: Annotation): void {
  ctx.save();
  if (object.rotation) {
    const bounds = annotationBounds(object);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    ctx.translate(center.x, center.y);
    ctx.rotate(object.rotation);
    ctx.translate(-center.x, -center.y);
  }
  if (object.flipX || object.flipY) {
    const bounds = annotationBounds(object);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    ctx.translate(center.x, center.y);
    ctx.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1);
    ctx.translate(-center.x, -center.y);
  }
  ctx.globalAlpha = object.style.opacity;
  ctx.strokeStyle = object.style.color;
  ctx.lineWidth = object.style.width;
  ctx.lineCap = object.style.lineCap ?? 'round';
  ctx.lineJoin = object.style.lineJoin ?? 'round';

  if (object.type === 'image') {
    if (object.source) ctx.drawImage(object.source, object.rect.x, object.rect.y, object.rect.w, object.rect.h);
    ctx.restore();
    return;
  }
  if (object.type === 'symbol') {
    drawSymbol(ctx, object);
    ctx.restore();
    return;
  }

  if ('rect' in object) {
    ctx.beginPath();
    const { x, y, w, h } = object.rect;
    if (object.type === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(x, y, w, h);
    if (object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(); }
    if (object.style.stroke !== false) ctx.stroke();
  } else if ('points' in object) {
    ctx.beginPath();
    const [first, ...rest] = object.points;
    if (first) ctx.moveTo(first.x, first.y);
    if (object.points.length === 1 && first) {
      ctx.lineTo(first.x + 0.01, first.y + 0.01);
    } else {
      rest.forEach((point, index) => {
        const next = object.points[index + 2];
        if (!next) ctx.lineTo(point.x, point.y);
        else ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      });
    }
    if (object.type === 'highlighter' && object.style.opacity < 1) {
      // Lower settings retain a marker-like blend. At 100%, source-over keeps
      // the selected color fully opaque as indicated by the opacity control.
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.stroke();
  } else if ('position' in object) {
    ctx.fillStyle = object.style.color;
    if (object.type === 'text') {
      ctx.font = `${object.fontStyle ?? 'normal'} ${object.fontWeight} ${object.fontSize}px "${object.fontFamily}"`;
      ctx.textAlign = object.align === 'justify' ? 'left' : object.align;
      ctx.textBaseline = 'alphabetic';
      const lineHeight = object.fontSize * 1.2;
      const lines = object.text.split('\n');
      const targetWidth = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
      lines.forEach((line, index) => {
        const y = object.position.y + index * lineHeight;
        const words = line.trim().split(/\s+/).filter(Boolean);
        const shouldJustify = object.align === 'justify' && index < lines.length - 1 && words.length > 1;
        if (shouldJustify) {
          const wordsWidth = words.reduce((total, word) => total + ctx.measureText(word).width, 0);
          const gap = (targetWidth - wordsWidth) / (words.length - 1);
          let x = object.position.x;
          for (const word of words) {
            ctx.fillText(word, x, y);
            x += ctx.measureText(word).width + gap;
          }
        } else {
          ctx.fillText(line, object.position.x, y);
        }
        if (object.underline && line) {
          const lineWidth = shouldJustify ? targetWidth : ctx.measureText(line).width;
          const startX = object.align === 'center' ? object.position.x - lineWidth / 2 : object.align === 'right' || object.align === 'end' ? object.position.x - lineWidth : object.position.x;
          ctx.fillRect(startX, y + object.fontSize * 0.1, lineWidth, Math.max(1, object.fontSize / 16));
        }
      });
    } else {
      const { x, y } = object.position;
      const r = object.radius;
      const shape = object.shape ?? 'circle';
      const filled = object.filled ?? true;
      ctx.beginPath();
      if (shape === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
      else if (shape === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      if (filled) {
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(2, object.style.width);
        ctx.stroke();
      }
      ctx.fillStyle = object.textColor ?? (filled ? '#ffffff' : object.style.color);
      const label = counterLabel(object.n, object.format);
      let labelSize = object.fontSize ?? r;
      ctx.font = `bold ${labelSize}px ${object.fontFamily ?? 'system-ui'}`;
      const availableWidth = r * (shape === 'diamond' ? 1.15 : 1.45);
      const measuredWidth = ctx.measureText(label).width;
      if (measuredWidth > availableWidth) {
        labelSize *= availableWidth / measuredWidth;
        ctx.font = `bold ${labelSize}px ${object.fontFamily ?? 'system-ui'}`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const metrics = ctx.measureText(label);
      const baseline = y + ((metrics.actualBoundingBoxAscent ?? labelSize * .75) - (metrics.actualBoundingBoxDescent ?? labelSize * .25)) / 2;
      ctx.fillText(label, x, baseline);
    }
  } else {
    const angle = Math.atan2(object.end.y - object.start.y, object.end.x - object.start.x);
    const startHead = object.type === 'arrow' ? object.startHead ?? 'none' : 'none';
    const endHead = object.type === 'arrow' ? object.endHead ?? 'open' : 'none';
    const startInset = arrowHeadInset(startHead, object.style.width);
    const endInset = arrowHeadInset(endHead, object.style.width);
    ctx.beginPath();
    ctx.moveTo(object.start.x + Math.cos(angle) * startInset, object.start.y + Math.sin(angle) * startInset);
    ctx.lineTo(object.end.x - Math.cos(angle) * endInset, object.end.y - Math.sin(angle) * endInset);
    ctx.stroke();
    if (object.type === 'arrow') {
      drawArrowHead(ctx, object.start, angle + Math.PI, startHead, object.style.width);
      drawArrowHead(ctx, object.end, angle, endHead, object.style.width);
    }
  }
  ctx.restore();
}

function arrowHeadSize(width: number): number {
  return width * 3 + 8;
}

function arrowHeadInset(head: ArrowHead, width: number): number {
  const size = arrowHeadSize(width);
  if (head === 'open') return width / 2;
  if (head === 'triangle') return size * .72;
  if (head === 'stealth') return size * .62;
  if (head === 'circle') return size * .3;
  return 0;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, tip: { x: number; y: number }, angle: number, head: ArrowHead, width: number): void {
  if (head === 'none') return;
  const size = arrowHeadSize(width);
  const back = (distance: number, spread: number) => ({
    x: tip.x - distance * Math.cos(angle) + spread * Math.sin(angle),
    y: tip.y - distance * Math.sin(angle) - spread * Math.cos(angle),
  });
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  if (head === 'circle') {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, size * .3, 0, Math.PI * 2);
    ctx.fill();
  } else if (head === 'open') {
    const left = back(size, size * .52);
    const right = back(size, -size * .52);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    const spread = head === 'stealth' ? size * .48 : size * .52;
    const left = back(size, spread);
    const right = back(size, -spread);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    if (head === 'stealth') {
      const notch = back(size * .48, 0);
      ctx.lineTo(notch.x, notch.y);
    }
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawSymbol(ctx: CanvasRenderingContext2D, object: SymbolAnnotation): void {
  const { x, y, w, h } = object.rect;
  const symbol = MATERIAL_SYMBOLS[object.name];
  if (symbol) {
    const path = new Path2D(symbol.path);
    ctx.save();
    if (symbol.viewBox) {
      ctx.translate(x, y);
      ctx.scale(w / 512 || 1, h / 512 || 1);
    } else {
      ctx.translate(x, y + h);
      ctx.scale(w / 960 || 1, h / 960 || 1);
    }
    if (!symbol.viewBox && symbol.rotation) {
      ctx.translate(480, -480);
      ctx.rotate(symbol.rotation * Math.PI / 180);
      ctx.translate(-480, 480);
    }
    ctx.fillStyle = object.style.color;
    ctx.fill(path);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 100 || 1, h / 100 || 1);
  if (object.name === 'hand-point-left') { ctx.translate(100, 0); ctx.scale(-1, 1); }
  ctx.beginPath();
  if (object.name === 'check') { ctx.moveTo(12, 52); ctx.lineTo(38, 78); ctx.lineTo(90, 18); }
  if (object.name === 'x') { ctx.moveTo(15, 15); ctx.lineTo(85, 85); ctx.moveTo(85, 15); ctx.lineTo(15, 85); }
  if (object.name === 'circle') ctx.arc(50, 50, 38, 0, Math.PI * 2);
  if (object.name === 'triangle') { ctx.moveTo(50, 10); ctx.lineTo(92, 88); ctx.lineTo(8, 88); ctx.closePath(); }
  if (object.name === 'square') ctx.rect(14, 14, 72, 72);
  if (object.name === 'diamond') { ctx.moveTo(50, 7); ctx.lineTo(93, 50); ctx.lineTo(50, 93); ctx.lineTo(7, 50); ctx.closePath(); }
  if (object.name === 'hexagon') { ctx.moveTo(27, 10); ctx.lineTo(73, 10); ctx.lineTo(94, 50); ctx.lineTo(73, 90); ctx.lineTo(27, 90); ctx.lineTo(6, 50); ctx.closePath(); }
  if (object.name === 'plus') { ctx.moveTo(50, 12); ctx.lineTo(50, 88); ctx.moveTo(12, 50); ctx.lineTo(88, 50); }
  if (object.name === 'minus') { ctx.moveTo(12, 50); ctx.lineTo(88, 50); }
  if (object.name === 'exclamation') { ctx.moveTo(50, 12); ctx.lineTo(50, 64); ctx.moveTo(50, 84); ctx.lineTo(50, 86); }
  if (object.name === 'question') { ctx.moveTo(25, 30); ctx.bezierCurveTo(30, 5, 75, 5, 75, 32); ctx.bezierCurveTo(75, 52, 50, 52, 50, 68); ctx.moveTo(50, 86); ctx.lineTo(50, 88); }
  if (object.name === 'info') { ctx.arc(50, 50, 40, 0, Math.PI * 2); ctx.moveTo(50, 42); ctx.lineTo(50, 75); ctx.moveTo(50, 25); ctx.lineTo(50, 27); }
  if (object.name === 'warning') { ctx.moveTo(50, 7); ctx.lineTo(94, 89); ctx.lineTo(6, 89); ctx.closePath(); ctx.moveTo(50, 34); ctx.lineTo(50, 62); ctx.moveTo(50, 76); ctx.lineTo(50, 78); }
  if (object.name === 'star') { for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5; const radius = i % 2 ? 18 : 42; const px = 50 + Math.cos(angle) * radius; const py = 50 + Math.sin(angle) * radius; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
  if (object.name === 'heart') { ctx.moveTo(50, 88); ctx.bezierCurveTo(40, 74, 12, 58, 12, 34); ctx.bezierCurveTo(12, 8, 42, 8, 50, 27); ctx.bezierCurveTo(58, 8, 88, 8, 88, 34); ctx.bezierCurveTo(88, 58, 60, 74, 50, 88); }
  if (object.name === 'arrow-up') { ctx.moveTo(50, 90); ctx.lineTo(50, 14); ctx.moveTo(18, 46); ctx.lineTo(50, 14); ctx.lineTo(82, 46); }
  if (object.name === 'arrow-down') { ctx.moveTo(50, 10); ctx.lineTo(50, 86); ctx.moveTo(18, 54); ctx.lineTo(50, 86); ctx.lineTo(82, 54); }
  if (object.name === 'arrow-left') { ctx.moveTo(90, 50); ctx.lineTo(14, 50); ctx.moveTo(46, 18); ctx.lineTo(14, 50); ctx.lineTo(46, 82); }
  if (object.name === 'arrow-right') { ctx.moveTo(10, 50); ctx.lineTo(86, 50); ctx.moveTo(54, 18); ctx.lineTo(86, 50); ctx.lineTo(54, 82); }
  if (object.name === 'lightning') { ctx.moveTo(58, 5); ctx.lineTo(18, 56); ctx.lineTo(45, 56); ctx.lineTo(38, 95); ctx.lineTo(82, 42); ctx.lineTo(55, 42); ctx.closePath(); }
  if (object.name === 'flag') { ctx.moveTo(23, 92); ctx.lineTo(23, 8); ctx.moveTo(23, 12); ctx.bezierCurveTo(43, 2, 58, 24, 82, 12); ctx.lineTo(82, 55); ctx.bezierCurveTo(58, 67, 43, 45, 23, 55); }
  if (object.name === 'pin') { ctx.moveTo(50, 94); ctx.bezierCurveTo(42, 81, 18, 60, 18, 38); ctx.bezierCurveTo(18, 19, 32, 7, 50, 7); ctx.bezierCurveTo(68, 7, 82, 19, 82, 38); ctx.bezierCurveTo(82, 60, 58, 81, 50, 94); ctx.closePath(); ctx.moveTo(50, 27); ctx.arc(50, 38, 11, -Math.PI / 2, Math.PI * 1.5); }
  if (object.name === 'target') { ctx.moveTo(80, 50); ctx.arc(50, 50, 30, 0, Math.PI * 2); ctx.moveTo(57, 50); ctx.arc(50, 50, 7, 0, Math.PI * 2, true); ctx.moveTo(50, 4); ctx.lineTo(50, 43); ctx.moveTo(50, 57); ctx.lineTo(50, 96); ctx.moveTo(4, 50); ctx.lineTo(43, 50); ctx.moveTo(57, 50); ctx.lineTo(96, 50); }
  if (object.name === 'speech') { ctx.moveTo(12, 15); ctx.lineTo(88, 15); ctx.lineTo(88, 70); ctx.lineTo(55, 70); ctx.lineTo(35, 89); ctx.lineTo(35, 70); ctx.lineTo(12, 70); ctx.closePath(); }
  if (object.name === 'eye') { ctx.moveTo(5, 50); ctx.bezierCurveTo(25, 18, 75, 18, 95, 50); ctx.bezierCurveTo(75, 82, 25, 82, 5, 50); ctx.closePath(); ctx.moveTo(64, 50); ctx.arc(50, 50, 14, 0, Math.PI * 2); }
  if (object.name === 'hand-stop') { ctx.moveTo(35, 93); ctx.lineTo(28, 65); ctx.lineTo(14, 51); ctx.bezierCurveTo(10, 45, 10, 45, 15, 41); ctx.bezierCurveTo(20, 37, 20, 37, 25, 44); ctx.lineTo(31, 50); ctx.lineTo(31, 18); ctx.bezierCurveTo(31, 11, 45, 11, 45, 18); ctx.lineTo(45, 43); ctx.lineTo(47, 12); ctx.bezierCurveTo(48, 5, 62, 6, 61, 13); ctx.lineTo(59, 43); ctx.lineTo(63, 16); ctx.bezierCurveTo(64, 9, 78, 11, 76, 18); ctx.lineTo(72, 46); ctx.lineTo(77, 27); ctx.bezierCurveTo(79, 20, 91, 26, 88, 34); ctx.lineTo(82, 62); ctx.bezierCurveTo(79, 76, 72, 80, 68, 83); ctx.lineTo(68, 93); ctx.closePath(); }
  if (object.name === 'hand-point-left' || object.name === 'hand-point-right') { ctx.moveTo(8, 78); ctx.lineTo(8, 48); ctx.bezierCurveTo(8, 41, 22, 41, 22, 48); ctx.lineTo(22, 54); ctx.lineTo(32, 48); ctx.lineTo(32, 22); ctx.bezierCurveTo(32, 14, 48, 14, 48, 22); ctx.lineTo(48, 42); ctx.lineTo(84, 42); ctx.bezierCurveTo(94, 42, 94, 60, 84, 60); ctx.lineTo(66, 60); ctx.bezierCurveTo(62, 78, 56, 84, 51, 88); ctx.lineTo(51, 94); ctx.lineTo(22, 94); ctx.lineTo(22, 86); ctx.bezierCurveTo(14, 84, 10, 81, 8, 78); ctx.closePath(); }
  if (object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(); }
  if (object.style.stroke !== false) ctx.stroke();
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
  }
  ctx.restore();
}
