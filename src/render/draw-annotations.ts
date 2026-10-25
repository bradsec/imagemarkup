import { isPathAnnotation, type Annotation, type ArrowHead, type CounterFormat, type SymbolAnnotation } from '../core/types';
import { annotationBounds } from '../core/annotations';
import { SYMBOLS } from '../core/symbols';
import { symbolPathData } from '../core/symbol-path';
import { graphemes, textLineHeight, textSpacing, textWidth } from '../core/text-layout';
import { polygonVertices, starVertices } from '../core/symbol-geometry';

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

export function drawAnnotation(ctx: CanvasRenderingContext2D, object: Annotation): void {
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
  } else if (isPathAnnotation(object)) {
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
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const lineHeight = textLineHeight(object.fontSize, object.lineHeight);
      const lines = object.text.split('\n');
      const measure = (value: string) => ctx.measureText(value).width;
      const width = (value: string) => textWidth(value, object.fontSize, object.letterSpacing, measure);
      const targetWidth = Math.max(0, ...lines.map(width));
      const spacing = textSpacing(object.fontSize, object.letterSpacing);
      const nativeSpacing = spacing !== 0 && typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;
      const drawText = (value: string, x: number, y: number) => {
        if (!spacing || nativeSpacing) {
          if (nativeSpacing) ctx.letterSpacing = `${spacing}px`;
          ctx.fillText(value, x, y);
          if (nativeSpacing) ctx.letterSpacing = '0px';
          return;
        }
        for (const glyph of graphemes(value)) {
          ctx.fillText(glyph, x, y);
          x += measure(glyph) + spacing;
        }
      };
      lines.forEach((line, index) => {
        const y = object.position.y + index * lineHeight;
        const words = line.trim().split(/\s+/).filter(Boolean);
        const shouldJustify = object.align === 'justify' && index < lines.length - 1 && words.length > 1;
        if (shouldJustify) {
          const wordsWidth = words.reduce((total, word) => total + width(word), 0);
          const gap = (targetWidth - wordsWidth) / (words.length - 1);
          let x = object.position.x;
          for (const word of words) {
            drawText(word, x, y);
            x += width(word) + gap;
          }
        } else {
          const lineWidth = width(line);
          const x = object.align === 'center' ? object.position.x - lineWidth / 2 : object.align === 'right' || object.align === 'end' ? object.position.x - lineWidth : object.position.x;
          drawText(line, x, y);
        }
        if (object.underline && line) {
          const lineWidth = shouldJustify ? targetWidth : width(line);
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
      if (object.paint === 'separate') {
        if (object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(); }
        if (object.style.stroke === true) ctx.stroke();
      } else if (filled) {
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(2, object.style.width);
        ctx.stroke();
      }
      ctx.fillStyle = object.textColor ?? (filled ? '#ffffff' : object.style.color);
      const label = counterLabel(object.n, object.format);
      let labelSize = object.fontSize ?? r;
      const font = (size: number) => `${object.fontStyle ?? 'normal'} ${object.fontWeight ?? 'bold'} ${size}px ${object.fontFamily ?? 'system-ui'}`;
      ctx.font = font(labelSize);
      const availableWidth = r * (shape === 'diamond' ? 1.15 : 1.45);
      const measuredWidth = ctx.measureText(label).width;
      if (measuredWidth > availableWidth) {
        labelSize *= availableWidth / measuredWidth;
        ctx.font = font(labelSize);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const metrics = ctx.measureText(label);
      const baseline = y + ((metrics.actualBoundingBoxAscent ?? labelSize * .75) - (metrics.actualBoundingBoxDescent ?? labelSize * .25)) / 2;
      ctx.fillText(label, x, baseline);
      if (object.underline) {
        const labelWidth = ctx.measureText(label).width;
        ctx.fillRect(x - labelWidth / 2, baseline + labelSize * 0.1, labelWidth, Math.max(1, labelSize / 16));
      }
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
  const parametric = (object.name === 'star' && (object.points !== undefined || object.innerRatio !== undefined)) || (object.name === 'hexagon' && object.sides !== undefined);
  const legacy = object.paint !== 'separate';
  if (parametric) {
    const vertices = object.name === 'star' ? starVertices(object.points ?? 5, object.innerRatio ?? 0.43) : polygonVertices(object.sides ?? 6);
    const baseTransform = ctx.getTransform();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 100 || 1, h / 100 || 1);
    ctx.beginPath();
    vertices.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    if (legacy) {
      if (object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(); }
      if (object.style.stroke !== false) ctx.stroke();
    } else {
      ctx.setTransform(baseTransform);
      if (object.style.stroke === true && object.style.fill) { ctx.lineWidth = object.style.width * 2; ctx.stroke(); }
      if (object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(); }
      if (object.style.stroke === true && !object.style.fill) ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const symbol = SYMBOLS[object.name];
  const transform = new DOMMatrix().translateSelf(x, y).scaleSelf(w / 24 || 1, h / 24 || 1);
  if (symbol.rotation || symbol.flip) {
    transform.translateSelf(12, 12);
    if (symbol.rotation) transform.rotateSelf(symbol.rotation);
    if (symbol.flip) transform.scaleSelf(-1, 1);
    transform.translateSelf(-12, -12);
  }
  const path = new Path2D();
  path.addPath(new Path2D(symbolPathData(symbol.markup)), transform);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (legacy) {
    ctx.strokeStyle = object.style.color;
    ctx.lineWidth = (2 / 24) * Math.min(w, h);
    ctx.stroke(path);
  } else {
    if (symbol.closed && object.style.fill) { ctx.fillStyle = object.style.fill; ctx.fill(path); }
    if (object.style.stroke === true) { ctx.lineWidth = object.style.width; ctx.stroke(path); }
  }
  ctx.restore();
}
