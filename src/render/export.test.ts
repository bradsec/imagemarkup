import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../core/types';
import { downloadBlob, exportBounds, exportScene, exportSize } from './export';

describe('export sizing', () => {
  it('clips the base image to the crop when overflow remains visible', async () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: '', width: 100, height: 100 };
    scene.crop = { x: 20, y: 30, w: 40, h: 50 };
    scene.showOverflow = true;
    const calls: string[] = [];
    const ctx = {
      setTransform: () => {}, resetTransform: () => {},
      save: () => { calls.push('save'); }, restore: () => { calls.push('restore'); },
      beginPath: () => { calls.push('beginPath'); },
      rect: (x: number, y: number, w: number, h: number) => { calls.push(`rect:${x},${y},${w},${h}`); },
      clip: () => { calls.push('clip'); },
      drawImage: () => { calls.push('drawImage'); },
    };
    vi.stubGlobal('document', {
      fonts: { ready: Promise.resolve() },
      createElement: () => ({ getContext: () => ctx, toBlob: (callback: (blob: Blob) => void) => callback(new Blob()) }),
    });

    await exportScene(scene, 'png');

    expect(calls).toContain('rect:20,30,40,50');
    expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('drawImage'));
    vi.unstubAllGlobals();
  });
  it('keeps the download URL alive through the click', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:download', revokeObjectURL: revoke });
    vi.stubGlobal('document', { createElement: () => ({ click: () => expect(revoke).not.toHaveBeenCalled() }) });
    downloadBlob(new Blob(), 'image.png');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:download');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('applies crop, border, and output scale', () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: '', width: 800, height: 600 };
    scene.crop = { x: 100, y: 50, w: 400, h: 300 };
    scene.border = { width: 10, color: '#000000' };
    expect(exportSize(scene, 2)).toEqual({ width: 840, height: 640 });
  });

  it('expands around overflow objects while retaining the image origin', () => {
    const scene = createScene();
    scene.image = { source: {} as CanvasImageSource, dataUrl: '', width: 800, height: 600 };
    scene.showOverflow = true;
    scene.objects.push({ id: 'overflow', type: 'image', rect: { x: -40, y: -20, w: 900, h: 650 }, dataUrl: 'data:image/png;base64,AA==', style: { color: '#000000', width: 1, opacity: 1 } });

    expect(exportBounds(scene)).toEqual({ x: -40, y: -20, w: 900, h: 650 });
    expect(exportSize(scene, 2)).toEqual({ width: 1800, height: 1300 });
  });
});
