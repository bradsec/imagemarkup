import { describe, expect, it } from 'vitest';
import { AnnotationHistory } from './history';
import type { Annotation } from './types';
import { createScene } from './types';

const rect = (id: string): Annotation => ({
  id,
  type: 'rect',
  rect: { x: 0, y: 0, w: 10, h: 10 },
  style: { color: '#f00', width: 2, opacity: 1 },
});

describe('AnnotationHistory', () => {
  it('undoes and redoes snapshots, then clears redo on a new change', () => {
    const history = new AnnotationHistory();
    const scene = createScene();
    history.record(scene);
    scene.objects = [rect('1')];
    expect(history.undo(scene)?.objects).toEqual([]);
    expect(history.redo(createScene())?.objects).toEqual([rect('1')]);
    history.record(scene);
    scene.objects.push(rect('2'));
    expect(history.redo(scene)).toBeNull();
  });

  it('tracks bitmap sources in past and future snapshots', () => {
    const history = new AnnotationHistory();
    const scene = createScene();
    const imageSource = {} as CanvasImageSource;
    const objectSource = {} as CanvasImageSource;
    const watermarkSource = {} as CanvasImageSource;
    scene.image = { source: imageSource, width: 10, height: 10, dataUrl: '' };
    scene.objects = [{ id: 'image', type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 }, dataUrl: '', source: objectSource, style: { color: '#000', width: 1, opacity: 1 } }];
    scene.watermark = { kind: 'image', dataUrl: '', source: watermarkSource, scale: 1, opacity: 1, tile: false };
    history.record(scene);
    expect(history.sources()).toEqual(new Set([imageSource, objectSource, watermarkSource]));
    history.record(createScene());
    history.undo(scene);
    expect(history.sources()).toEqual(new Set([imageSource, objectSource, watermarkSource]));
    history.clear();
    expect(history.sources().size).toBe(0);
  });
});
