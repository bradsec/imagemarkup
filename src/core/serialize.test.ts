import { describe, expect, it } from 'vitest';
import { createScene } from './types';
import { createAnnotation } from './annotations';
import { MAX_PROJECT_IMAGE_DATA_LENGTH, parseScene, serializeScene } from './serialize';

describe('scene serialization', () => {
  it('round-trips serializable scene state without the decoded image source', () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: 'data:image/png;base64,AA==', width: 20, height: 10 };
    scene.viewport = { scale: 2, tx: 3, ty: 4 };
    scene.activeTool = 'rect';
    scene.symbolName = 'target';
    scene.arrowStartHead = 'circle';
    scene.arrowEndHead = 'stealth';
    scene.counterNext = 7;
    scene.counterTextColor = '#112233';
    scene.fontFamily = 'Kalam';
    scene.fontStyle = 'italic';
    scene.textUnderline = true;
    scene.showOverflow = true;
    scene.objects.push({ id: 'a', type: 'rect', layerName: 'Callout background', locked: true, hidden: true, rect: { x: 1, y: 2, w: 3, h: 4 }, style: { color: '#ff0000', width: 2, opacity: 0.5, lineCap: 'square', lineJoin: 'bevel' } });
    scene.watermark = { kind: 'text', text: 'DRAFT', size: 18, color: '#ffffff', opacity: .4, tile: true, angle: -35, fontFamily: 'Poppins', fontWeight: 'bold', fontStyle: 'italic' };

    const dto = parseScene(serializeScene(scene));

    expect(dto).toMatchObject({ version: 1, image: { dataUrl: scene.image.dataUrl, width: 20, height: 10 }, activeTool: 'rect', symbolName: 'target', arrowStartHead: 'circle', arrowEndHead: 'stealth', counterNext: 7, counterTextColor: '#112233', fontFamily: 'Kalam', fontStyle: 'italic', textUnderline: true, showOverflow: true });
    expect(dto.image).not.toHaveProperty('source');
    expect(dto.objects).toEqual(scene.objects);
    expect(dto.watermark).toEqual(scene.watermark);
  });

  it('round-trips the hand gesture symbols', () => {
    const scene = createScene();
    scene.symbolName = 'hand-point-left';
    scene.objects.push({ id: 'hand', type: 'symbol', name: 'hand-stop', rect: { x: 1, y: 2, w: 30, h: 40 }, style: { color: '#ff0000', width: 2, opacity: 1 } });
    const dto = parseScene(serializeScene(scene));
    expect(dto.symbolName).toBe('hand-point-left');
    expect(dto.objects[0]).toMatchObject({ type: 'symbol', name: 'hand-stop' });
  });

  it('round-trips legacy symbols hidden from the picker', () => {
    const scene = createScene();
    scene.symbolName = 'rounded-square';
    scene.objects.push({ id: 'ring', type: 'symbol', name: 'ring', rect: { x: 1, y: 2, w: 30, h: 40 }, style: { color: '#ff0000', width: 2, opacity: 1 } });
    const dto = parseScene(serializeScene(scene));
    expect(dto.symbolName).toBe('rounded-square');
    expect(dto.objects[0]).toMatchObject({ type: 'symbol', name: 'ring' });
  });

  it('preserves legacy symbol paint and explicit fill-off state', () => {
    const scene = createScene();
    scene.objects.push({ id: 'old', type: 'symbol', name: 'ring', rect: { x: 1, y: 2, w: 30, h: 40 }, style: { color: '#123456', width: 3, opacity: 1 } });
    scene.objects.push({ id: 'new', type: 'symbol', paint: 'separate', name: 'ring', rect: { x: 5, y: 6, w: 30, h: 40 }, style: { color: '#abcdef', fill: null, stroke: true, width: 7, opacity: 1 } });
    expect(parseScene(serializeScene(scene)).objects).toEqual(scene.objects);
    expect(() => parseScene(serializeScene({ ...scene, objects: [{ ...scene.objects[1], style: { ...scene.objects[1].style, fill: 'invalid' } }] }))).toThrow('Invalid or unsupported');
  });

  it('rejects malformed and version-mismatched input', () => {
    expect(() => parseScene('{')).toThrow('Invalid imagemarkup project JSON');
    expect(() => parseScene(JSON.stringify({ version: 2 }))).toThrow('Invalid or unsupported');
    expect(() => parseScene(JSON.stringify({
      version: 1,
      image: null,
      viewport: { scale: 0, tx: 0, ty: 0 },
      objects: [],
      activeTool: 'select',
      selectedId: null,
      toolStyle: { color: '#ff0000', width: 2, opacity: 1 },
      crop: null,
      border: null,
      watermark: null,
      symbolName: 'check',
      fontFamily: 'system-ui',
      fontSize: 32,
      fontWeight: 'normal',
      textAlign: 'left',
      redactionMode: 'pixelate',
      redactionStrength: 10,
    }))).toThrow('Invalid or unsupported');
  });

  it('rounds restored text sizes up to whole pixels', () => {
    const scene = createScene();
    scene.fontSize = 31.2;
    const text = createAnnotation('text', 'text', { x: 1, y: 2 }, scene.toolStyle);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    text.fontSize = 55.8258;
    scene.objects.push(text);

    const restored = parseScene(serializeScene(scene));
    expect(restored.fontSize).toBe(32);
    expect(restored.objects[0]).toMatchObject({ type: 'text', fontSize: 56 });
  });

  it('loads older text and symbol objects with compatible defaults', () => {
    const scene = createScene();
    const text = createAnnotation('text', 'text', { x: 1, y: 2 }, scene.toolStyle);
    scene.objects.push(text, { id: 'star', type: 'symbol', name: 'star', rect: { x: 0, y: 0, w: 10, h: 10 }, style: scene.toolStyle });
    const legacy = JSON.parse(serializeScene(scene));
    delete legacy.letterSpacing;
    delete legacy.lineHeight;
    delete legacy.objects[0].letterSpacing;
    delete legacy.objects[0].lineHeight;
    const restored = parseScene(JSON.stringify(legacy));
    expect(restored).toMatchObject({ letterSpacing: 0, lineHeight: 1.2 });
    expect(restored.objects[0]).toMatchObject({ letterSpacing: 0, lineHeight: 1.2 });
    expect(restored.objects[1]).not.toHaveProperty('points');
  });

  it('clamps numeric text and symbol settings and rejects wrong types', () => {
    const scene = createScene();
    scene.letterSpacing = 2000;
    scene.lineHeight = 10;
    const text = createAnnotation('text', 'text', { x: 1, y: 2 }, scene.toolStyle);
    if (text.type !== 'text') throw new Error('Expected text annotation');
    text.letterSpacing = -500;
    text.lineHeight = 0.1;
    scene.objects.push(text);
    scene.objects.push({ id: 'star', type: 'symbol', name: 'star', points: 30, innerRatio: 0.1, rect: { x: 0, y: 0, w: 10, h: 10 }, style: scene.toolStyle });
    expect(parseScene(serializeScene(scene))).toMatchObject({ letterSpacing: 1000, lineHeight: 3, objects: [{ letterSpacing: -200, lineHeight: 0.5 }, { points: 24, innerRatio: 0.2 }] });
    expect(() => parseScene(serializeScene({ ...scene, letterSpacing: 'wide' } as never))).toThrow('Invalid or unsupported');
  });

  it('rejects project image data above the aggregate limit', () => {
    const scene = createScene();
    scene.objects.push({
      id: 'image',
      type: 'image',
      rect: { x: 0, y: 0, w: 1, h: 1 },
      dataUrl: `data:image/png;base64,${'A'.repeat(MAX_PROJECT_IMAGE_DATA_LENGTH)}`,
      style: { color: '#ff0000', width: 1, opacity: 1 },
    });

    expect(() => serializeScene(scene)).toThrow('Project image data is too large');
  });

  it('applies the image budget across multiple layers', () => {
    const scene = createScene();
    const dataUrl = `data:image/png;base64,${'A'.repeat(Math.floor(MAX_PROJECT_IMAGE_DATA_LENGTH / 2))}`;
    scene.objects.push(
      { id: 'first', type: 'image', rect: { x: 0, y: 0, w: 1, h: 1 }, dataUrl, style: scene.toolStyle },
      { id: 'second', type: 'image', rect: { x: 0, y: 0, w: 1, h: 1 }, dataUrl, style: scene.toolStyle },
    );
    expect(() => serializeScene(scene)).toThrow('Project image data is too large');
  });

  it('rejects ambiguous IDs and unsafe annotation geometry', () => {
    const scene = createScene();
    scene.objects.push(
      { id: 'duplicate', type: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, style: { ...scene.toolStyle } },
      { id: 'duplicate', type: 'pen', points: [{ x: 2_000_000, y: 0 }], style: { ...scene.toolStyle } },
    );
    expect(() => parseScene(serializeScene(scene))).toThrow('Invalid or unsupported');

    scene.objects = [{ id: 'empty-path', type: 'pen', points: [], style: { ...scene.toolStyle } }];
    expect(() => parseScene(serializeScene(scene))).toThrow('Invalid or unsupported');

  });

  it('rejects redaction strengths that exceed the renderer limit', () => {
    const scene = createScene();
    scene.objects = [{ id: 'redaction', type: 'redaction', rect: { x: 0, y: 0, w: 10, h: 10 }, mode: 'pixelate', strength: 101, style: { ...scene.toolStyle } }];
    expect(() => parseScene(serializeScene(scene))).toThrow('Invalid or unsupported');
  });

  it('round-trips solid redactions and rejects invalid fill colors', () => {
    const scene = createScene();
    scene.redactionMode = 'solid';
    scene.objects = [{ id: 'solid', type: 'redaction', rect: { x: 0, y: 0, w: 10, h: 10 }, mode: 'solid', strength: 10, style: { color: '#ff0000', fill: '#123456', width: 1, opacity: .2 } }];
    expect(parseScene(serializeScene(scene))).toMatchObject({ redactionMode: 'solid', objects: [{ mode: 'solid', style: { fill: '#123456' } }] });
    scene.objects[0].style.fill = 'transparent';
    expect(() => parseScene(serializeScene(scene))).toThrow('Invalid or unsupported');
  });
  it('converts legacy counters to separate fill and border paint', () => {
    const scene = createScene();
    scene.objects = [
      { id: 'filled', type: 'counter', position: { x: 1, y: 1 }, n: 1, radius: 10, style: { color: '#ff0000', width: 2, opacity: 1 } },
      { id: 'outline', type: 'counter', position: { x: 1, y: 1 }, n: 2, radius: 10, filled: false, style: { color: '#00ff00', width: 1, opacity: 1 } },
    ];
    const [filled, outline] = parseScene(serializeScene(scene)).objects;
    expect(filled).toMatchObject({ paint: 'separate', textColor: '#ffffff', fontWeight: 'bold', style: { fill: '#ff0000', stroke: false } });
    expect(outline).toMatchObject({ paint: 'separate', textColor: '#00ff00', style: { fill: null, stroke: true, color: '#00ff00', width: 2 } });
    expect(filled).not.toHaveProperty('filled');
  });

  it('round-trips counter text formatting and defaults', () => {
    const scene = createScene();
    scene.counterFontWeight = 'normal';
    scene.counterFontStyle = 'italic';
    scene.counterUnderline = true;
    scene.objects = [{ id: 'c', type: 'counter', paint: 'separate', position: { x: 1, y: 1 }, n: 1, radius: 10, fontWeight: 'normal', fontStyle: 'italic', underline: true, style: { color: '#ff0000', width: 2, opacity: 1, fill: '#00ff00', stroke: true } }];
    const parsed = parseScene(serializeScene(scene));
    expect(parsed).toMatchObject({ counterFontWeight: 'normal', counterFontStyle: 'italic', counterUnderline: true });
    expect(parsed.objects[0]).toMatchObject({ fontWeight: 'normal', fontStyle: 'italic', underline: true });
    expect(() => parseScene(serializeScene({ ...scene, objects: [{ ...scene.objects[0], fontWeight: 'heavy' } as never] }))).toThrow();
  });
});
