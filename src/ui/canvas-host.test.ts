import { describe, it, expect } from 'vitest';
import { constrainDrawPoint, constrainRotation, drawBounds, isTypingTarget, makeToolAnnotation, pinchViewport, wheelZoom } from './canvas-host';
import { createScene, type Scene } from '../core/types';
import { imageToScreen, screenToImage } from '../core/geometry';

describe('isTypingTarget', () => {
  it('keeps Space available for text inputs but allows controls to pan', () => {
    expect(isTypingTarget('INPUT', 'number', false)).toBe(true);
    expect(isTypingTarget('TEXTAREA', '', false)).toBe(true);
    expect(isTypingTarget('DIV', '', true)).toBe(true);
    expect(isTypingTarget('INPUT', 'range', false)).toBe(false);
    expect(isTypingTarget('INPUT', 'checkbox', false)).toBe(false);
    expect(isTypingTarget('BUTTON', '', false)).toBe(false);
  });
});

describe('makeToolAnnotation', () => {
  it('uses the next counter value and current shape settings for placement and preview', () => {
    const scene = createScene();
    scene.activeTool = 'counter';
    scene.counterNext = 7;
    scene.counterFormat = 'roman';
    scene.counterSize = 24;
    const placed = makeToolAnnotation('placed', scene, { x: 50, y: 40 });
    const ghost = makeToolAnnotation('ghost', scene, { x: 50, y: 40 }, true);
    const expected = { type: 'counter', position: { x: 50, y: 40 }, n: 7, format: 'roman', radius: 24 };
    expect(placed).toMatchObject(expected);
    expect(ghost).toMatchObject(expected);
  });

  it('keeps a redaction preview inside the image', () => {
    const scene = createScene();
    scene.activeTool = 'redaction';
    scene.image = { width: 200, height: 100 } as Scene['image'];
    scene.redactionMode = 'blur';
    scene.redactionStrength = 20;
    expect(makeToolAnnotation('ghost', scene, { x: 195, y: 95 }, true)).toMatchObject({
      type: 'redaction', mode: 'blur', strength: 20, rect: { x: 100, y: 0, w: 100, h: 100 },
    });
  });

  it('defaults new solid redactions to black', () => {
    const scene = createScene();
    scene.activeTool = 'redaction';
    scene.redactionMode = 'solid';
    expect(makeToolAnnotation('solid', scene, { x: 5, y: 5 })).toMatchObject({
      mode: 'solid', style: { fill: '#000000' },
    });
  });
});

describe('constrainDrawPoint', () => {
  it('forces an equal-sided square for rects and keeps the drag direction', () => {
    const end = constrainDrawPoint('rect', { x: 0, y: 0 }, { x: 40, y: -90 });
    expect(end).toEqual({ x: 90, y: -90 });
  });

  it('snaps lines to the nearest 45 degree step, preserving length', () => {
    const end = constrainDrawPoint('line', { x: 0, y: 0 }, { x: 100, y: 10 });
    expect(end.y).toBeCloseTo(0, 6);
    expect(end.x).toBeCloseTo(Math.hypot(100, 10), 6);
  });

  it('draws symmetrically from the initial pointer with Alt or Option', () => {
    expect(drawBounds('ellipse', { x: 100, y: 80 }, { x: 130, y: 100 }, { fromCenter: true }))
      .toEqual({ start: { x: 70, y: 60 }, end: { x: 130, y: 100 } });
  });

  it('combines centered and constrained drawing modifiers', () => {
    expect(drawBounds('ellipse', { x: 100, y: 80 }, { x: 130, y: 100 }, { fromCenter: true, constrainProportions: true }))
      .toEqual({ start: { x: 70, y: 50 }, end: { x: 130, y: 110 } });
  });
});

describe('constrainRotation', () => {
  it('snaps rotation to 45 degree increments', () => {
    expect(constrainRotation(40 * Math.PI / 180)).toBeCloseTo(Math.PI / 4);
    expect(constrainRotation(100 * Math.PI / 180)).toBeCloseTo(Math.PI / 2);
  });
});

describe('wheelZoom', () => {
  it('zooms in on scroll up and keeps the cursor point fixed', () => {
    const scene = createScene();
    scene.viewport = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 120, y: 80 };
    const imgPt = screenToImage(anchor, scene.viewport);
    const next = wheelZoom(scene, anchor, -100, false);
    expect(next.scale).toBeGreaterThan(1);
    const back = imageToScreen(imgPt, next);
    expect(back.x).toBeCloseTo(anchor.x, 6);
    expect(back.y).toBeCloseTo(anchor.y, 6);
  });

  it('zooms out on scroll down', () => {
    const scene = createScene();
    scene.viewport = { scale: 1, tx: 0, ty: 0 };
    const next = wheelZoom(scene, { x: 0, y: 0 }, 100, false);
    expect(next.scale).toBeLessThan(1);
  });

  it('uses a finer step for trackpad pinch', () => {
    const scene = createScene();
    scene.viewport = { scale: 1, tx: 0, ty: 0 };
    const coarse = wheelZoom(scene, { x: 0, y: 0 }, -100, false).scale;
    const fine = wheelZoom(scene, { x: 0, y: 0 }, -100, true).scale;
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeGreaterThan(1);
  });

  it('zooms and pans between two pointer pairs', () => {
    const next = pinchViewport(
      { scale: 1, tx: 0, ty: 0 },
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 10, y: 20 }, { x: 210, y: 20 }],
    );
    expect(next.scale).toBe(2);
    expect(imageToScreen({ x: 50, y: 0 }, next)).toEqual({ x: 110, y: 20 });
  });
});
