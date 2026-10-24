import { describe, expect, it } from 'vitest';
import { cropAnnotations, scaleAnnotation, transformAnnotation, transformPoint, translateAnnotation } from './transform';
import type { Annotation } from './types';

const rect: Annotation = { id: 'r', type: 'rect', rect: { x: 10, y: 20, w: 30, h: 40 }, style: { color: '#f00', width: 2, opacity: 1 } };

describe('frame transforms', () => {
  it('rotates points and annotation rectangles', () => {
    expect(transformPoint({ x: 10, y: 20 }, 'rotate-right', 100, 80)).toEqual({ x: 60, y: 10 });
    expect(transformAnnotation(rect, 'rotate-right', 100, 80)).toMatchObject({ rect: { x: 20, y: 10, w: 40, h: 30 } });
  });

  it('scales and translates annotations', () => {
    expect(scaleAnnotation(rect, 2, 0.5)).toMatchObject({ rect: { x: 20, y: 10, w: 60, h: 20 } });
    expect(translateAnnotation(rect, -5, 3)).toMatchObject({ rect: { x: 5, y: 23, w: 30, h: 40 } });
    const counter: Annotation = { id: 'c', type: 'counter', position: { x: 10, y: 20 }, n: 1, radius: 10, fontSize: 8, style: { color: '#f00', width: 2, opacity: 1 } };
    expect(scaleAnnotation(counter, 2, 2)).toMatchObject({ position: { x: 20, y: 40 }, radius: 20, fontSize: 16, style: { width: 4 } });
  });

  it('translates intersecting annotations into a crop and removes outside objects', () => {
    const inside: Annotation = { ...rect, id: 'inside', rect: { x: 30, y: 30, w: 40, h: 40 } };
    const partial: Annotation = { ...rect, id: 'partial', rect: { x: 0, y: 0, w: 40, h: 40 } };
    const outside: Annotation = { ...rect, id: 'outside', rect: { x: 100, y: 100, w: 20, h: 20 } };
    const result = cropAnnotations([inside, partial, outside], { x: 20, y: 20, w: 60, h: 60 });
    expect(result.map((object) => object.id)).toEqual(['inside', 'partial']);
    expect(result[0]).toMatchObject({ rect: { x: 10, y: 10, w: 40, h: 40 } });
    expect(result[1]).toMatchObject({ rect: { x: -20, y: -20, w: 40, h: 40 } });
  });

  it('keeps rotated annotations whose visible bounds intersect the crop', () => {
    const rotated: Annotation = {
      ...rect,
      id: 'rotated',
      rect: { x: 8, y: 30, w: 10, h: 80 },
      rotation: Math.PI / 4,
    };

    expect(cropAnnotations([rotated], { x: 40, y: 40, w: 30, h: 30 })).toHaveLength(1);
  });

  it('keeps placed media oriented through frame rotation', () => {
    const image: Annotation = { id: 'i', type: 'image', rect: { x: 10, y: 20, w: 30, h: 10 }, dataUrl: 'data:image/png;base64,AA==', style: { color: '#f00', width: 2, opacity: 1 } };
    expect(transformAnnotation(image, 'rotate-right', 100, 80)).toMatchObject({ rect: { x: 40, y: 20, w: 30, h: 10 }, rotation: Math.PI / 2 });
    const text: Annotation = { id: 't', type: 'text', position: { x: 10, y: 20 }, text: 'Hi', fontFamily: 'sans-serif', fontSize: 20, fontWeight: 'normal', align: 'left', style: { color: '#f00', width: 2, opacity: 1 } };
    expect(scaleAnnotation(text, 2, 2)).toMatchObject({ position: { x: 20, y: 40 }, fontSize: 40, style: { width: 4 } });
    expect(scaleAnnotation(text, 1.23, 1.23)).toMatchObject({ fontSize: 25 });
  });

  it('composes frame flips with existing object rotation', () => {
    const image: Annotation = { id: 'i', type: 'image', rect: { x: 10, y: 20, w: 30, h: 10 }, dataUrl: 'data:image/png;base64,AA==', rotation: Math.PI / 6, style: { color: '#f00', width: 2, opacity: 1 } };
    expect(transformAnnotation(image, 'flip-horizontal', 100, 80)).toMatchObject({ rotation: -Math.PI / 6, flipX: true });
    expect(transformAnnotation({ ...image, flipY: true }, 'flip-vertical', 100, 80)).toMatchObject({ rotation: -Math.PI / 6, flipY: false });
  });

  it('reverses rotation when a shape is flipped with the frame', () => {
    const rotated = { ...rect, rotation: Math.PI / 6 };
    expect(transformAnnotation(rotated, 'flip-horizontal', 100, 80)).toMatchObject({ rotation: -Math.PI / 6 });
    expect(transformAnnotation(rotated, 'flip-vertical', 100, 80)).toMatchObject({ rotation: -Math.PI / 6 });
  });
});
