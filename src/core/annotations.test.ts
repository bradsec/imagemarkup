import { describe, expect, it } from 'vitest';
import { annotationBounds, annotationHandles, annotationVisualBounds, appendPathPoints, createAnnotation, hitHandle, hitTest, moveAnnotation, resizeAnnotation, resizeAnnotationToBounds, resizeFromHandle } from './annotations';

const style = { color: '#f00', width: 4, opacity: 1 };

describe('annotations', () => {
  it('normalizes a rectangle drawn in any direction and moves it', () => {
    const object = resizeAnnotation(createAnnotation('1', 'rect', { x: 20, y: 30 }, style), { x: 20, y: 30 }, { x: 5, y: 10 });
    expect(object).toMatchObject({ rect: { x: 5, y: 10, w: 15, h: 20 } });
    expect(moveAnnotation(object, 3, -2)).toMatchObject({ rect: { x: 8, y: 8, w: 15, h: 20 } });
  });

  it('resizes annotation geometry to typed dimensions', () => {
    const rect = resizeAnnotation(createAnnotation('rect', 'rect', { x: 10, y: 20 }, style), { x: 10, y: 20 }, { x: 50, y: 40 });
    expect(annotationBounds(resizeAnnotationToBounds(rect, 80, 10))).toEqual({ x: 10, y: 20, w: 80, h: 10 });
    const line = resizeAnnotation(createAnnotation('line', 'line', { x: 10, y: 20 }, style), { x: 10, y: 20 }, { x: 50, y: 40 });
    expect(annotationBounds(resizeAnnotationToBounds(line, 20, 40))).toEqual({ x: 10, y: 20, w: 20, h: 40 });
  });

  it('hit-tests the topmost shape and line', () => {
    const rect = resizeAnnotation(createAnnotation('rect', 'rect', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 20 });
    const line = resizeAnnotation(createAnnotation('line', 'line', { x: 0, y: 10 }, style), { x: 0, y: 10 }, { x: 20, y: 10 });
    expect(hitTest([rect, line], { x: 10, y: 10 }, 2)?.id).toBe('line');
    expect(hitTest([rect], { x: 10, y: 10 }, 2)?.id).toBe('rect');
    expect(hitTest([line], { x: 10, y: 30 }, 2)).toBeNull();
  });

  it('includes a symbol outline in visual bounds and hit testing', () => {
    const symbol = { id: 'symbol', type: 'symbol' as const, name: 'ring' as const, rect: { x: 10, y: 10, w: 30, h: 30 }, style: { color: '#ff0000', width: 10, opacity: 1, stroke: true } };
    expect(annotationVisualBounds(symbol)).toEqual({ x: 5, y: 5, w: 40, h: 40 });
    expect(hitTest([symbol], { x: 6, y: 25 }, 0)?.id).toBe('symbol');
    expect(hitTest([symbol], { x: 4, y: 25 }, 0)).toBeNull();
  });

  it('skips locked objects so artwork underneath remains selectable', () => {
    const bottom = resizeAnnotation(createAnnotation('bottom', 'rect', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 20 });
    const top = { ...resizeAnnotation(createAnnotation('top', 'ellipse', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 20 }), locked: true };
    expect(hitTest([bottom, top], { x: 10, y: 10 }, 2)?.id).toBe('bottom');
  });

  it('finds and moves shape and line handles', () => {
    const rect = resizeAnnotation(createAnnotation('rect', 'rect', { x: 10, y: 10 }, style), { x: 10, y: 10 }, { x: 30, y: 30 });
    expect(annotationHandles(rect)).toHaveLength(9);
    expect(hitHandle(rect, { x: 30, y: 30 }, 2)).toBe('se');
    expect(resizeFromHandle(rect, 'se', { x: 40, y: 45 })).toMatchObject({ rect: { x: 10, y: 10, w: 30, h: 35 } });

    const line = resizeAnnotation(createAnnotation('line', 'line', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 20 });
    expect(annotationHandles(line).map(({ handle }) => handle)).toEqual(['start', 'end', 'rotate']);
    const rotateHandle = annotationHandles(line).find(({ handle }) => handle === 'rotate')!;
    expect(hitHandle(line, rotateHandle.point, 2)).toBe('rotate');
    expect(resizeFromHandle(line, 'end', { x: 30, y: 5 })).toMatchObject({ end: { x: 30, y: 5 } });
  });

  it('rotates line endpoints and controls around the line center', () => {
    const line = { ...resizeAnnotation(createAnnotation('line', 'line', { x: 0, y: 10 }, style), { x: 0, y: 10 }, { x: 40, y: 10 }), rotation: Math.PI / 2 };
    const handles = annotationHandles(line);
    expect(handles.find(({ handle }) => handle === 'start')?.point).toMatchObject({ x: 20, y: -10 });
    expect(handles.find(({ handle }) => handle === 'end')?.point).toMatchObject({ x: 20, y: 30 });
    expect(hitHandle(line, { x: 46, y: 10 }, 2)).toBe('rotate');
  });

  it('keeps the opposite visual endpoint fixed while resizing a rotated line', () => {
    const line = { ...resizeAnnotation(createAnnotation('line', 'line', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 40, y: 0 }), rotation: Math.PI / 2 };
    const before = annotationHandles(line);
    const fixed = before.find(({ handle }) => handle === 'start')!.point;
    const resized = resizeFromHandle(line, 'end', { x: 40, y: 20 });
    const after = annotationHandles(resized);
    expect(after.find(({ handle }) => handle === 'start')!.point).toEqual(fixed);
    expect(after.find(({ handle }) => handle === 'end')!.point).toMatchObject({ x: 40, y: 20 });
  });

  it('constrains handle resizing with Adobe-style modifier keys', () => {
    const rect = resizeAnnotation(createAnnotation('rect', 'rect', { x: 10, y: 20 }, style), { x: 10, y: 20 }, { x: 50, y: 40 });
    const proportional = resizeFromHandle(rect, 'se', { x: 90, y: 70 }, { constrainProportions: true });
    expect(annotationBounds(proportional).w / annotationBounds(proportional).h).toBeCloseTo(2);
    expect(annotationBounds(proportional)).toMatchObject({ x: 10, y: 20 });

    const centered = resizeFromHandle(rect, 'e', { x: 70, y: 30 }, { fromCenter: true });
    expect(annotationBounds(centered)).toEqual({ x: -10, y: 20, w: 80, h: 20 });

    const combined = resizeFromHandle(rect, 'se', { x: 70, y: 50 }, { constrainProportions: true, fromCenter: true });
    const combinedBounds = annotationBounds(combined);
    expect(combinedBounds.w / combinedBounds.h).toBeCloseTo(2);
    expect({ x: combinedBounds.x + combinedBounds.w / 2, y: combinedBounds.y + combinedBounds.h / 2 }).toEqual({ x: 30, y: 30 });
  });

  it('constrains line endpoints to 45-degree increments', () => {
    const line = resizeAnnotation(createAnnotation('line', 'line', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 0 });
    const resized = resizeFromHandle(line, 'end', { x: 20, y: 8 }, { constrainProportions: true });
    if (!('end' in resized)) throw new Error('Expected line annotation');
    expect(Math.atan2(resized.end.y - resized.start.y, resized.end.x - resized.start.x) / (Math.PI / 4)).toBeCloseTo(0);
  });

  it('rounds resized text font sizes up to whole pixels', () => {
    const text = createAnnotation('text', 'text', { x: 10, y: 20 }, style);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    text.text = 'Resize me';
    const resized = resizeFromHandle(text, 'se', { x: 125.5, y: 65.25 });
    expect(resized.type === 'text' && Number.isInteger(resized.fontSize)).toBe(true);
  });

  it('creates and moves paths, text, counters, and redactions', () => {
    const pen = resizeAnnotation(createAnnotation('p', 'pen', { x: 1, y: 2 }, style), { x: 1, y: 2 }, { x: 4, y: 6 });
    expect(moveAnnotation(pen, 2, 3)).toMatchObject({ points: [{ x: 3, y: 5 }, { x: 6, y: 9 }] });
    expect(moveAnnotation(createAnnotation('t', 'text', { x: 5, y: 6 }, style), 1, 2)).toMatchObject({ position: { x: 6, y: 8 } });
    expect(createAnnotation('c', 'counter', { x: 5, y: 6 }, style)).toMatchObject({ n: 1 });
    expect(resizeAnnotation(createAnnotation('b', 'redaction', { x: 10, y: 10 }, style), { x: 10, y: 10 }, { x: 2, y: 4 })).toMatchObject({ rect: { x: 2, y: 4, w: 8, h: 6 } });
  });

  it('includes every text line in multiline bounds', () => {
    const text = createAnnotation('t', 'text', { x: 10, y: 20 }, style);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    text.text = 'short\na much longer line\nthird';
    expect(annotationBounds(text).h).toBeGreaterThan(text.fontSize * 3);
    expect(annotationBounds(text).w).toBeGreaterThan(text.fontSize * 8);
  });

  it('keeps selection bounds tight around short and narrow text', () => {
    const text = createAnnotation('t', 'text', { x: 100, y: 100 }, style);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    text.text = 'I';
    const narrow = annotationBounds(text);
    expect(narrow.w).toBeLessThan(text.fontSize / 2);
    expect(narrow.y).toBeGreaterThan(text.position.y - text.fontSize);

    text.text = 'Wide text';
    expect(annotationBounds(text).w).toBeGreaterThan(narrow.w * 5);
  });

  it('hit-tests rotated objects in their local coordinates', () => {
    const object = { ...resizeAnnotation(createAnnotation('r', 'rect', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 40, y: 10 }), rotation: Math.PI / 2 };
    expect(hitTest([object], { x: 20, y: 20 }, 1)?.id).toBe('r');
    expect(hitTest([object], { x: 35, y: 5 }, 1)).toBeNull();
  });

  it('exposes handles for paths, text, and counters', () => {
    const pen = resizeAnnotation(createAnnotation('p', 'pen', { x: 0, y: 0 }, style), { x: 0, y: 0 }, { x: 20, y: 10 });
    expect(annotationHandles(pen)).toHaveLength(9);
    expect(annotationHandles(createAnnotation('t', 'text', { x: 10, y: 20 }, style))).toHaveLength(9);
    expect(annotationHandles(createAnnotation('c', 'counter', { x: 10, y: 20 }, style))).toHaveLength(9);
  });

  it('adds freehand points while filtering pointer noise', () => {
    const pen = createAnnotation('p', 'pen', { x: 0, y: 0 }, style);
    const result = appendPathPoints(pen, [{ x: 0.1, y: 0.1 }, { x: 2, y: 2 }, { x: 4, y: 3 }], 1);
    expect(result).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 3 }] });
  });

  it('accounts for text alignment in its selection bounds', () => {
    const text = createAnnotation('t', 'text', { x: 100, y: 100 }, style);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    expect(annotationBounds({ ...text, align: 'center', text: 'Hello' }).x).toBeLessThan(100);
    expect(annotationBounds({ ...text, align: 'right', text: 'Hello' }).x + annotationBounds({ ...text, align: 'right', text: 'Hello' }).w).toBe(100);
  });

  it('gives a click-created symbol visible and selectable bounds', () => {
    expect(createAnnotation('s', 'symbol', { x: 50, y: 60 }, style)).toMatchObject({ rect: { x: 30, y: 40, w: 40, h: 40 } });
  });
});
