import { describe, it, expect } from 'vitest';
import { createCanvas, DOMMatrix as CanvasDOMMatrix, Path2D as CanvasPath2D, type Canvas } from '@napi-rs/canvas';
import { counterLabel, renderArtwork, renderScene, watermarkTileSpacing, type Surface } from './renderer';
import { createScene, type SymbolName } from '../core/types';
import { parseScene, serializeScene } from '../core/serialize';
import { MATERIAL_SYMBOLS } from '../core/material-symbols';
import { starVertices } from '../core/symbol-geometry';

globalThis.Path2D = CanvasPath2D as unknown as typeof Path2D;
globalThis.DOMMatrix = CanvasDOMMatrix as unknown as typeof DOMMatrix;
import { fitViewport } from '../core/viewport';

function makeSurface(w: number, h: number): { surface: Surface; canvas: Canvas } {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d') as unknown as Surface['ctx'];
  return { surface: { width: w, height: h, ctx }, canvas };
}

describe('renderScene', () => {
  it('formats numeric, alphabetic, and Roman counters', () => {
    expect(counterLabel(28, 'numeric')).toBe('28');
    expect(counterLabel(28, 'alpha')).toBe('AB');
    expect(counterLabel(28, 'roman')).toBe('XXVIII');
  });
  it('draws the image centered and scaled by the viewport', () => {
    // Build a 40x40 solid-red image via a source canvas.
    const src = createCanvas(40, 40);
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#ff0000';
    sctx.fillRect(0, 0, 40, 40);

    const { surface, canvas } = makeSurface(200, 200);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 40, height: 40, dataUrl: '' };
    scene.viewport = fitViewport(40, 40, 200, 200, 1);

    renderScene(surface, scene);

    // Center pixel should be red.
    const mid = canvas.getContext('2d').getImageData(100, 100, 1, 1).data;
    expect(mid[0]).toBeGreaterThan(200);
    expect(mid[1]).toBeLessThan(60);
    expect(mid[2]).toBeLessThan(60);
  });

  it('does not throw with no image', () => {
    const { surface } = makeSurface(50, 50);
    expect(() => renderScene(surface, createScene())).not.toThrow();
  });

  it('draws annotations over the image', () => {
    const src = createCanvas(20, 20);
    src.getContext('2d').fillRect(0, 0, 20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: '1', type: 'rect', rect: { x: 2, y: 2, w: 16, h: 16 }, style: { color: '#ff0000', width: 2, opacity: 1 } });

    renderScene(surface, scene);

    const edge = canvas.getContext('2d').getImageData(2, 10, 1, 1).data;
    expect(edge[0]).toBeGreaterThan(200);
    expect(edge[1]).toBeLessThan(60);
  });

  it('does not render hidden annotations', () => {
    const src = createCanvas(20, 20);
    src.getContext('2d').fillStyle = '#ffffff';
    src.getContext('2d').fillRect(0, 0, 20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: 'hidden', type: 'rect', hidden: true, rect: { x: 2, y: 2, w: 16, h: 16 }, style: { color: '#ff0000', fill: '#ff0000', stroke: false, width: 2, opacity: 1 } });

    renderArtwork(surface, scene);

    expect([...canvas.getContext('2d').getImageData(10, 10, 1, 1).data]).toEqual([255, 255, 255, 255]);
  });

  it('renders a 100 percent highlighter with the selected opaque color', () => {
    const src = createCanvas(20, 20);
    src.getContext('2d').fillStyle = '#ffffff';
    src.getContext('2d').fillRect(0, 0, 20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: 'highlight', type: 'highlighter', points: [{ x: 2, y: 10 }, { x: 18, y: 10 }], style: { color: '#f4df57', width: 8, opacity: 1 } });

    renderArtwork(surface, scene);

    expect([...canvas.getContext('2d').getImageData(10, 10, 1, 1).data]).toEqual([244, 223, 87, 255]);
  });

  it('renders counter shape and text colors independently', () => {
    const src = createCanvas(60, 60);
    const { surface, canvas } = makeSurface(60, 60);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 60, height: 60, dataUrl: '' };
    scene.objects.push({ id: 'counter', type: 'counter', position: { x: 30, y: 30 }, n: 8, radius: 22, fontSize: 24, filled: true, textColor: '#0000ff', style: { color: '#ff0000', width: 2, opacity: 1 } });

    renderArtwork(surface, scene);

    const pixels = canvas.getContext('2d').getImageData(0, 0, 60, 60).data;
    let red = 0;
    let blue = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 200 && pixels[index + 2] < 50) red++;
      if (pixels[index] < 50 && pixels[index + 2] > 200) blue++;
    }
    expect(red).toBeGreaterThan(500);
    expect(blue).toBeGreaterThan(10);
  });

  it('renders separate counter fill and border, and omits either when disabled', () => {
    const count = (paint: { fill: string | null; stroke: boolean }) => {
      const { surface, canvas } = makeSurface(60, 60);
      const scene = createScene();
      scene.image = { source: createCanvas(60, 60) as unknown as CanvasImageSource, width: 60, height: 60, dataUrl: '' };
      scene.objects.push({ id: 'c', type: 'counter', paint: 'separate', position: { x: 30, y: 30 }, n: 1, radius: 20, fontSize: 1, textColor: '#000000', style: { color: '#0000ff', width: 6, opacity: 1, fill: paint.fill, stroke: paint.stroke } });
      renderArtwork(surface, scene);
      const pixels = canvas.getContext('2d').getImageData(0, 0, 60, 60).data;
      let red = 0; let blue = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 200 && pixels[index + 2] < 50) red++;
        if (pixels[index] < 50 && pixels[index + 2] > 200) blue++;
      }
      return { red, blue };
    };
    const both = count({ fill: '#ff0000', stroke: true });
    expect(both.red).toBeGreaterThan(500);
    expect(both.blue).toBeGreaterThan(300);
    expect(count({ fill: '#ff0000', stroke: false }).blue).toBe(0);
    expect(count({ fill: null, stroke: true }).red).toBe(0);
  });

  it('renders target reticle and map marker as distinct symbols', () => {
    const renderSymbol = (name: 'pin' | 'target') => {
      const src = createCanvas(100, 100);
      const { surface, canvas } = makeSurface(100, 100);
      const scene = createScene();
      scene.image = { source: src as unknown as CanvasImageSource, width: 100, height: 100, dataUrl: '' };
      scene.objects.push({ id: name, type: 'symbol', name, rect: { x: 0, y: 0, w: 100, h: 100 }, style: { color: '#ff0000', width: 3, opacity: 1 } });
      renderArtwork(surface, scene);
      return canvas.getContext('2d');
    };

    expect(renderSymbol('target').getImageData(5, 50, 1, 1).data[3]).toBeGreaterThan(200);
    expect(renderSymbol('pin').getImageData(5, 50, 1, 1).data[3]).toBe(0);
  });

  it('draws a symbol outline outside its fill so the fill stays whole', () => {
    const { surface, canvas } = makeSurface(120, 120);
    const scene = createScene();
    scene.image = { source: createCanvas(120, 120) as unknown as CanvasImageSource, width: 120, height: 120, dataUrl: '' };
    scene.objects.push({ id: 'p', type: 'symbol', paint: 'separate', name: 'circle', rect: { x: 20, y: 20, w: 80, h: 80 },
      style: { color: '#0000ff', fill: '#00ff00', stroke: true, width: 12, opacity: 1 } });
    renderArtwork(surface, scene);
    const ctx = canvas.getContext('2d');
    // A centred 12px outline would cover 4px inside the left edge; the fill must show there.
    const left = Array.from({ length: 120 }, (_, x) => ctx.getImageData(x, 60, 1, 1).data).findIndex((pixel) => pixel[1] > 200 || pixel[2] > 200);
    const inside = ctx.getImageData(left + 16, 60, 1, 1).data;
    expect([inside[0], inside[1], inside[2]]).toEqual([0, 255, 0]);
    const outside = ctx.getImageData(left + 2, 60, 1, 1).data;
    expect([outside[0], outside[1], outside[2]]).toEqual([0, 0, 255]);
  });

  it.each(['star', 'ring', 'hand-stop'] as const)('uses fill and a uniform image-pixel outline for %s', (name) => {
    const render = (w: number, h: number, stroke: boolean, fill: string | null) => {
      const { surface, canvas } = makeSurface(180, 180);
      const scene = createScene();
      scene.image = { source: createCanvas(180, 180) as unknown as CanvasImageSource, width: 180, height: 180, dataUrl: '' };
      scene.objects.push({ id: name, type: 'symbol', paint: 'separate', name, rect: { x: 20, y: 20, w, h },
        ...(name === 'star' ? { points: 5 } : {}),
        style: { color: '#ff0000', fill, stroke, width: 4, opacity: 1 } });
      renderArtwork(surface, scene);
      return canvas.getContext('2d');
    };
    const painted = render(100, 100, true, '#00ff00').getImageData(0, 0, 180, 180).data;
    expect(painted.some((value, index) => index % 4 === 0 && value > 200 && painted[index + 1] < 50)).toBe(true);
    expect(painted.some((value, index) => index % 4 === 1 && value > 200 && painted[index - 1] < 50)).toBe(true);
    const fillOnly = render(100, 100, false, '#00ff00').getImageData(0, 0, 180, 180).data;
    expect(fillOnly.some((value, index) => index % 4 === 0 && value > 200 && fillOnly[index + 3] > 0)).toBe(false);
    if (name === 'ring') expect(render(100, 100, false, '#00ff00').getImageData(70, 70, 1, 1).data[3]).toBe(0);
    const strokeOnly = render(100, 100, true, null).getImageData(0, 0, 180, 180).data;
    expect(strokeOnly.some((value, index) => index % 4 === 1 && value > 200 && strokeOnly[index + 3] > 0)).toBe(false);
    expect(render(100, 50, true, '#00ff00').getImageData(0, 0, 180, 180).data.some((value, index) => index % 4 === 0 && value > 200)).toBe(true);
  });

  it('keeps a Material symbol outline uniform when its aspect ratio changes', () => {
    const thickness = (w: number, h: number) => {
      const { surface, canvas } = makeSurface(180, 180);
      const scene = createScene();
      scene.image = { source: createCanvas(180, 180) as unknown as CanvasImageSource, width: 180, height: 180, dataUrl: '' };
      scene.objects.push({ id: 'ring', type: 'symbol', paint: 'separate', name: 'ring', rect: { x: 20, y: 20, w, h },
        style: { color: '#ff0000', fill: '#00ff00', stroke: true, width: 8, opacity: 1 } });
      renderArtwork(surface, scene);
      const row = canvas.getContext('2d').getImageData(0, 20 + h / 2, 180, 1).data;
      let start = -1;
      for (let x = 0; x < 180; x++) {
        if (row[x * 4] > 200 && row[x * 4 + 1] < 50) { if (start < 0) start = x; }
        else if (start >= 0) return x - start;
      }
      throw new Error('No outline pixels');
    };
    expect(Math.abs(thickness(100, 100) - thickness(150, 100))).toBeLessThanOrEqual(1);
    expect(Math.abs(thickness(100, 100) - thickness(100, 150))).toBeLessThanOrEqual(1);
  });

  it('renders legacy stars and hexagons unchanged after project load', () => {
    const source = createCanvas(100, 100);
    const scene = createScene();
    scene.image = { source: source as unknown as CanvasImageSource, width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' };
    scene.objects = (['star', 'hexagon'] as const).map((name, index) => ({ id: name, type: 'symbol', name, rect: { x: index * 50, y: 0, w: 50, h: 50 }, style: { color: '#ff0000', width: 3, opacity: 1 } }));
    const before = makeSurface(100, 100);
    renderArtwork(before.surface, scene);
    const restored = parseScene(serializeScene(scene));
    const after = makeSurface(100, 100);
    renderArtwork(after.surface, { ...scene, objects: restored.objects });
    expect(after.canvas.toBuffer('image/png')).toEqual(before.canvas.toBuffer('image/png'));
  });

  it('renders an old Material symbol with the same fill calls after a project round-trip', () => {
    const scene = createScene();
    scene.image = { source: createCanvas(120, 120) as unknown as CanvasImageSource, width: 120, height: 120, dataUrl: 'data:image/png;base64,AA==' };
    scene.objects.push({ id: 'old', type: 'symbol', name: 'ring', rect: { x: 10, y: 15, w: 80, h: 60 }, style: { color: '#123456', fill: '#00ff00', width: 7, opacity: 1, stroke: true } });
    const expected = createCanvas(120, 120);
    const ctx = expected.getContext('2d');
    ctx.translate(10, 15);
    ctx.scale(80 / 512, 60 / 512);
    ctx.fillStyle = '#123456';
    ctx.fill(new CanvasPath2D(MATERIAL_SYMBOLS.ring.path));
    const actual = makeSurface(120, 120);
    renderArtwork(actual.surface, { ...scene, objects: parseScene(serializeScene(scene)).objects });
    expect(actual.canvas.toBuffer('image/png')).toEqual(expected.toBuffer('image/png'));
  });

  it('retains the old scaled outline for an unmarked parametric star', () => {
    const scene = createScene();
    scene.image = { source: createCanvas(120, 120) as unknown as CanvasImageSource, width: 120, height: 120, dataUrl: 'data:image/png;base64,AA==' };
    scene.objects.push({ id: 'old-star', type: 'symbol', name: 'star', points: 5, rect: { x: 10, y: 15, w: 80, h: 60 }, style: { color: '#123456', fill: '#00ff00', width: 7, opacity: 1 } });
    const expected = createCanvas(120, 120);
    const ctx = expected.getContext('2d');
    ctx.translate(10, 15);
    ctx.scale(80 / 100, 60 / 100);
    ctx.beginPath();
    starVertices(5, 0.43).forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    ctx.strokeStyle = '#123456';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    const actual = makeSurface(120, 120);
    renderArtwork(actual.surface, { ...scene, objects: parseScene(serializeScene(scene)).objects });
    expect(actual.canvas.toBuffer('image/png')).toEqual(expected.toBuffer('image/png'));
  });

  it('renders stop and directional hand symbols', () => {
    const renderSymbol = (name: SymbolName) => {
      const src = createCanvas(100, 100);
      const { surface, canvas } = makeSurface(100, 100);
      const scene = createScene();
      scene.image = { source: src as unknown as CanvasImageSource, width: 100, height: 100, dataUrl: '' };
      scene.objects.push({ id: name, type: 'symbol', name, rect: { x: 0, y: 0, w: 100, h: 100 }, style: { color: '#ff0000', width: 3, opacity: 1 } });
      renderArtwork(surface, scene);
      return canvas.getContext('2d');
    };
    const alphaIn = (name: SymbolName, x: number, y: number, width: number, height: number) => {
      const pixels = renderSymbol(name).getImageData(x, y, width, height).data;
      return pixels.filter((_, index) => index % 4 === 3).reduce((total, alpha) => total + alpha, 0);
    };

    expect(alphaIn('hand-stop', 25, 3, 55, 20)).toBeGreaterThan(0);
    expect(alphaIn('hand-point-right', 80, 17, 18, 18)).toBeGreaterThan(0);
    expect(alphaIn('hand-point-left', 2, 17, 18, 18)).toBeGreaterThan(0);
  });

  it('renders distinct arrowheads without using the shaft line cap at the tip', () => {
    const renderArrow = (endHead: 'open' | 'triangle' | 'stealth' | 'circle') => {
      const src = createCanvas(120, 80);
      const { surface, canvas } = makeSurface(120, 80);
      const scene = createScene();
      scene.image = { source: src as unknown as CanvasImageSource, width: 120, height: 80, dataUrl: '' };
      scene.objects.push({ id: endHead, type: 'arrow', start: { x: 15, y: 40 }, end: { x: 105, y: 40 }, endHead, style: { color: '#ff0000', width: 8, opacity: 1, lineCap: 'square' } });
      renderArtwork(surface, scene);
      return canvas.toBuffer('image/png');
    };
    const outputs = ['open', 'triangle', 'stealth', 'circle'].map((head) => renderArrow(head as 'open' | 'triangle' | 'stealth' | 'circle').toString('base64'));
    expect(new Set(outputs)).toHaveLength(4);
  });

  it('hides overflow by default and reveals it when enabled', () => {
    const src = createCanvas(20, 20);
    const { surface, canvas } = makeSurface(40, 30);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: 'outside', type: 'rect', rect: { x: 25, y: 5, w: 10, h: 10 }, style: { color: '#ff0000', fill: '#ff0000', stroke: false, width: 1, opacity: 1 } });

    renderScene(surface, scene);
    expect(canvas.getContext('2d').getImageData(30, 10, 1, 1).data[0]).toBeLessThan(100);

    scene.showOverflow = true;
    renderScene(surface, scene);
    expect(canvas.getContext('2d').getImageData(30, 10, 1, 1).data[0]).toBeGreaterThan(200);
  });

  it('renders a filled shape without a stroke', () => {
    const src = createCanvas(20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: '1', type: 'rect', rect: { x: 2, y: 2, w: 16, h: 16 }, style: { color: '#ff0000', fill: '#00ff00', stroke: false, width: 8, opacity: 1 } });

    renderArtwork(surface, scene);

    const edge = canvas.getContext('2d').getImageData(2, 10, 1, 1).data;
    expect([...edge]).toEqual([0, 255, 0, 255]);
  });

  it('preserves transparent PNG pixels behind annotations', () => {
    const src = createCanvas(20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: 'data:image/png;base64,' };
    scene.objects.push({ id: '1', type: 'rect', rect: { x: 5, y: 5, w: 10, h: 10 }, style: { color: '#ff0000', fill: '#ff0000', stroke: false, width: 1, opacity: 1 } });

    renderArtwork(surface, scene);

    expect(canvas.getContext('2d').getImageData(1, 1, 1, 1).data[3]).toBe(0);
    expect(canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3]).toBe(255);
  });

  it('renders flat and round line end caps differently', () => {
    const src = createCanvas(20, 20);
    const sourceCtx = src.getContext('2d');
    sourceCtx.fillStyle = '#000000';
    sourceCtx.fillRect(0, 0, 20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };
    scene.objects.push({ id: 'line', type: 'line', start: { x: 5, y: 10 }, end: { x: 15, y: 10 }, style: { color: '#ff0000', width: 6, opacity: 1, lineCap: 'butt' } });

    renderArtwork(surface, scene);
    expect(canvas.getContext('2d').getImageData(3, 10, 1, 1).data[0]).toBeLessThan(60);

    scene.objects[0].style.lineCap = 'round';
    renderArtwork(surface, scene);
    expect(canvas.getContext('2d').getImageData(3, 10, 1, 1).data[0]).toBeGreaterThan(200);
  });

  it('rotates a centered image watermark', () => {
    const src = createCanvas(40, 40);
    const watermark = createCanvas(8, 2);
    watermark.getContext('2d').fillStyle = '#ff0000';
    watermark.getContext('2d').fillRect(0, 0, 8, 2);
    const { surface, canvas } = makeSurface(40, 40);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 40, height: 40, dataUrl: '' };
    scene.watermark = { kind: 'image', dataUrl: '', source: watermark as unknown as CanvasImageSource, scale: .5, opacity: 1, tile: false, angle: 90 };

    renderArtwork(surface, scene);
    const ctx = canvas.getContext('2d');
    expect(ctx.getImageData(20, 17, 1, 1).data[0]).toBeGreaterThan(200);
    expect(ctx.getImageData(17, 20, 1, 1).data[0]).toBeLessThan(60);
  });

  it('spaces tiled watermarks with equal gutters beyond their rotated bounds', () => {
    const spacing = watermarkTileSpacing(120, 48, .5, 16);
    expect(spacing.stepX).toBeGreaterThan(60);
    expect(spacing.stepY).toBeGreaterThan(24);
    expect(spacing.stepX - 60).toBeCloseTo(spacing.stepY - 24);
  });

  it('scales an oversized rotated watermark inside the image', () => {
    const src = createCanvas(40, 40);
    const watermark = createCanvas(100, 20);
    watermark.getContext('2d').fillStyle = '#ff0000';
    watermark.getContext('2d').fillRect(0, 0, 100, 20);
    const { surface, canvas } = makeSurface(40, 40);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 40, height: 40, dataUrl: '' };
    scene.watermark = { kind: 'image', dataUrl: '', source: watermark as unknown as CanvasImageSource, scale: 1, opacity: 1, tile: false, angle: 45 };

    renderArtwork(surface, scene);
    const pixels = canvas.getContext('2d').getImageData(0, 0, 40, 40).data;
    const occupied: Array<[number, number]> = [];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (pixels[(y * 40 + x) * 4]) occupied.push([x, y]);
    expect(Math.min(...occupied.map(([x]) => x))).toBeGreaterThanOrEqual(14);
    expect(Math.max(...occupied.map(([x]) => x))).toBeLessThanOrEqual(25);
    expect(Math.min(...occupied.map(([, y]) => y))).toBeGreaterThanOrEqual(14);
    expect(Math.max(...occupied.map(([, y]) => y))).toBeLessThanOrEqual(25);
  });

  it('renders multiline text on separate baselines', () => {
    const src = createCanvas(80, 80);
    const { surface, canvas } = makeSurface(80, 80);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 80, height: 80, dataUrl: '' };
    scene.objects.push({ id: 'text', type: 'text', position: { x: 5, y: 20 }, text: 'A\nA\nA', fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'normal', align: 'left', style: { color: '#ffffff', width: 1, opacity: 1 } });

    renderArtwork(surface, scene);
    const pixels = canvas.getContext('2d').getImageData(0, 0, 80, 80).data;
    const occupiedRows = new Set<number>();
    for (let y = 0; y < 80; y++) for (let x = 0; x < 30; x++) if (pixels[(y * 80 + x) * 4 + 3]) occupiedRows.add(y);
    expect(Math.max(...occupiedRows)).toBeGreaterThan(40);
  });

  it('renders italic, underlined, justified text', () => {
    const src = createCanvas(120, 60);
    const { surface, canvas } = makeSurface(120, 60);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 120, height: 60, dataUrl: '' };
    scene.objects.push({ id: 'text', type: 'text', position: { x: 5, y: 20 }, text: 'A A\nA longer line', fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'bold', fontStyle: 'italic', underline: true, align: 'justify', style: { color: '#ffffff', width: 1, opacity: 1 } });

    renderArtwork(surface, scene);

    const pixels = canvas.getContext('2d').getImageData(0, 0, 120, 60).data;
    const underlinePixels = Array.from({ length: 120 }, (_, x) => pixels[(22 * 120 + x) * 4 + 3]).filter(Boolean);
    expect(underlinePixels.length).toBeGreaterThan(30);
  });

  it('renders clean artwork without stage checkerboard', () => {
    const src = createCanvas(4, 4);
    src.getContext('2d').fillStyle = '#00ff00';
    src.getContext('2d').fillRect(0, 0, 4, 4);
    const { surface, canvas } = makeSurface(8, 8);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 4, height: 4, dataUrl: '' };
    renderArtwork(surface, scene, 2);
    const pixel = canvas.getContext('2d').getImageData(7, 7, 1, 1).data;
    expect([...pixel]).toEqual([0, 255, 0, 255]);
  });

  it('pixelates redaction regions from source pixels', () => {
    const src = createCanvas(2, 1);
    const sourceCtx = src.getContext('2d');
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 1, 1);
    sourceCtx.fillStyle = '#0000ff';
    sourceCtx.fillRect(1, 0, 1, 1);
    const { surface, canvas } = makeSurface(2, 1);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 2, height: 1, dataUrl: '' };
    scene.objects.push({ id: 'r', type: 'redaction', rect: { x: 0, y: 0, w: 2, h: 1 }, mode: 'pixelate', strength: 2, style: { color: '#000000', width: 1, opacity: 1 } });
    renderArtwork(surface, scene);
    const left = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
    const right = canvas.getContext('2d').getImageData(1, 0, 1, 1).data;
    expect(left[0]).toBeGreaterThan(100);
    expect(left[2]).toBeGreaterThan(100);
    expect([...right]).toEqual([...left]);
  });

  it('covers source pixels with an opaque solid redaction color', () => {
    const src = createCanvas(4, 4);
    src.getContext('2d').fillStyle = '#ff0000';
    src.getContext('2d').fillRect(0, 0, 4, 4);
    const { surface, canvas } = makeSurface(4, 4);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 4, height: 4, dataUrl: '' };
    scene.objects.push({ id: 'solid', type: 'redaction', rect: { x: 1, y: 1, w: 2, h: 2 }, mode: 'solid', strength: 10, style: { color: '#ff0000', fill: '#123456', width: 1, opacity: .2 } });
    renderArtwork(surface, scene);
    expect([...canvas.getContext('2d').getImageData(1, 1, 1, 1).data]).toEqual([18, 52, 86, 255]);
  });

  it('uses opaque black when a solid redaction has no fill color', () => {
    const src = createCanvas(2, 2);
    src.getContext('2d').fillStyle = '#ffffff';
    src.getContext('2d').fillRect(0, 0, 2, 2);
    const { surface, canvas } = makeSurface(2, 2);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 2, height: 2, dataUrl: '' };
    scene.objects.push({ id: 'solid', type: 'redaction', rect: { x: 0, y: 0, w: 2, h: 2 }, mode: 'solid', strength: 10, style: { color: '#ff0000', width: 1, opacity: .2 } });
    renderArtwork(surface, scene);
    expect([...canvas.getContext('2d').getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 255]);
  });

  it('redacts placed images below it while leaving placed images above it visible', () => {
    const src = createCanvas(20, 20);
    const { surface, canvas } = makeSurface(20, 20);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 20, height: 20, dataUrl: '' };

    const placed = createCanvas(20, 20);
    const placedCtx = placed.getContext('2d');
    placedCtx.fillStyle = '#ff0000';
    placedCtx.fillRect(0, 0, 10, 20);
    placedCtx.fillStyle = '#0000ff';
    placedCtx.fillRect(10, 0, 10, 20);

    scene.objects.push(
      { id: 'below', type: 'image', source: placed as unknown as CanvasImageSource, dataUrl: '', rect: { x: 0, y: 0, w: 20, h: 20 }, style: { color: '#000000', width: 1, opacity: 1 } },
      { id: 'r', type: 'redaction', rect: { x: 0, y: 0, w: 20, h: 20 }, mode: 'pixelate', strength: 20, style: { color: '#000000', width: 1, opacity: 1 } },
    );
    renderArtwork(surface, scene);
    const redactedLeft = canvas.getContext('2d').getImageData(5, 10, 1, 1).data;
    const redactedRight = canvas.getContext('2d').getImageData(15, 10, 1, 1).data;
    expect([...redactedLeft]).toEqual([...redactedRight]);

    scene.objects.push({ id: 'above', type: 'image', source: placed as unknown as CanvasImageSource, dataUrl: '', rect: { x: 0, y: 0, w: 20, h: 20 }, style: { color: '#000000', width: 1, opacity: 1 } });
    renderArtwork(surface, scene);
    const visibleLeft = canvas.getContext('2d').getImageData(5, 10, 1, 1).data;
    const visibleRight = canvas.getContext('2d').getImageData(15, 10, 1, 1).data;
    expect(visibleLeft[0]).toBeGreaterThan(200);
    expect(visibleLeft[2]).toBeLessThan(60);
    expect(visibleRight[0]).toBeLessThan(60);
    expect(visibleRight[2]).toBeGreaterThan(200);
  });

  it('renders redactions consistently across allocation tile boundaries', () => {
    const src = createCanvas(1100, 4);
    const srcCtx = src.getContext('2d');
    srcCtx.fillStyle = '#ff0000';
    srcCtx.fillRect(0, 0, 550, 4);
    srcCtx.fillStyle = '#0000ff';
    srcCtx.fillRect(550, 0, 550, 4);
    const scene = createScene();
    scene.image = { source: src as unknown as CanvasImageSource, width: 1100, height: 4, dataUrl: '' };
    scene.objects.push({ id: 'r', type: 'redaction', rect: { x: 1000, y: 0, w: 48, h: 4 }, mode: 'pixelate', strength: 8, style: { color: '#000000', width: 1, opacity: 1 } });
    const { surface, canvas } = makeSurface(1100, 4);

    renderArtwork(surface, scene);

    expect([...canvas.getContext('2d').getImageData(1023, 2, 1, 1).data]).toEqual([...canvas.getContext('2d').getImageData(1024, 2, 1, 1).data]);
  });
});
