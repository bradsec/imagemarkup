import { isPathAnnotation, type Annotation, type ArrowHead, type CounterFormat, type SymbolAnnotation } from '../core/types';
import { annotationBounds } from '../core/annotations';
import { MATERIAL_SYMBOLS } from '../core/material-symbols';
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
  const baseTransform = ctx.getTransform();
  const parametric = (object.name === 'star' && (object.points !== undefined || object.innerRatio !== undefined)) || (object.name === 'hexagon' && object.sides !== undefined);
  const material = !parametric && Boolean(MATERIAL_SYMBOLS[object.name]);
  const legacy = object.paint !== 'separate';
  const fill = legacy && material ? object.style.color : object.style.fill;
  const stroke = legacy ? !material && object.style.stroke !== false : object.style.stroke === true;
  // With a fill, stroke first at double width and fill over its inner half, so the fill stays
  // whole and the outline shows its full width outside the shape.
  const paint = (fillShape: () => void, strokeShape: () => void): void => {
    if (stroke && fill) { ctx.lineWidth = object.style.width * 2; strokeShape(); }
    if (fill) { ctx.fillStyle = fill; fillShape(); }
    if (stroke && !fill) strokeShape();
  };
  if (parametric) {
    const vertices = object.name === 'star' ? starVertices(object.points ?? 5, object.innerRatio ?? 0.43) : polygonVertices(object.sides ?? 6);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 100 || 1, h / 100 || 1);
    ctx.beginPath();
    vertices.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    // Legacy parametric symbols retain their original scaled outline.
    if (legacy) {
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) ctx.stroke();
    } else {
      ctx.setTransform(baseTransform);
      paint(() => ctx.fill(), () => ctx.stroke());
    }
    ctx.restore();
    return;
  }
  const symbol = MATERIAL_SYMBOLS[object.name];
  if (symbol) {
    if (legacy) {
      const path = new Path2D(symbol.path);
      ctx.save();
      if (symbol.viewBox) { ctx.translate(x, y); ctx.scale(w / 512 || 1, h / 512 || 1); }
      else { ctx.translate(x, y + h); ctx.scale(w / 960 || 1, h / 960 || 1); }
      if (!symbol.viewBox && symbol.rotation) { ctx.translate(480, -480); ctx.rotate(symbol.rotation * Math.PI / 180); ctx.translate(-480, 480); }
      ctx.fillStyle = object.style.color;
      ctx.fill(path);
      ctx.restore();
      return;
    }
    const path = new Path2D();
    const transform = new DOMMatrix();
    if (symbol.viewBox) transform.translateSelf(x, y).scaleSelf(w / 512 || 1, h / 512 || 1);
    else transform.translateSelf(x, y + h).scaleSelf(w / 960 || 1, h / 960 || 1);
    if (!symbol.viewBox && symbol.rotation) transform.translateSelf(480, -480).rotateSelf(symbol.rotation).translateSelf(-480, 480);
    path.addPath(new Path2D(symbol.path), transform);
    ctx.save();
    paint(() => ctx.fill(path), () => ctx.stroke(path));
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
  if (object.name === 'plus') { ctx.moveTo(50, 12); ctx.lineTo(50, 88); ctx.moveTo(12, 50); ctx.lineTo(88, 50); }
  if (object.name === 'minus') { ctx.moveTo(12, 50); ctx.lineTo(88, 50); }
  if (object.name === 'exclamation') { ctx.moveTo(50, 12); ctx.lineTo(50, 64); ctx.moveTo(50, 84); ctx.lineTo(50, 86); }
  if (object.name === 'question') { ctx.moveTo(25, 30); ctx.bezierCurveTo(30, 5, 75, 5, 75, 32); ctx.bezierCurveTo(75, 52, 50, 52, 50, 68); ctx.moveTo(50, 86); ctx.lineTo(50, 88); }
  if (object.name === 'info') { ctx.arc(50, 50, 40, 0, Math.PI * 2); ctx.moveTo(50, 42); ctx.lineTo(50, 75); ctx.moveTo(50, 25); ctx.lineTo(50, 27); }
  if (object.name === 'warning') { ctx.moveTo(50, 7); ctx.lineTo(94, 89); ctx.lineTo(6, 89); ctx.closePath(); ctx.moveTo(50, 34); ctx.lineTo(50, 62); ctx.moveTo(50, 76); ctx.lineTo(50, 78); }
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
  if (!legacy) ctx.setTransform(baseTransform);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) ctx.stroke();
  ctx.restore();
}
