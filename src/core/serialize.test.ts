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

    expect(() => parseScene(serializeScene(scene))).toThrow('Invalid or unsupported');
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
});
