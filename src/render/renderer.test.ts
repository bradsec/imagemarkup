import { describe, it, expect } from 'vitest';
import { createCanvas, Path2D as CanvasPath2D, type Canvas } from '@napi-rs/canvas';
import { counterLabel, renderArtwork, renderScene, watermarkTileSpacing, type Surface } from './renderer';
import { createScene, type SymbolName } from '../core/types';
import { parseScene, serializeScene } from '../core/serialize';

globalThis.Path2D = CanvasPath2D as unknown as typeof Path2D;
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
