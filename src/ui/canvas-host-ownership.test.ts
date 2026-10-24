// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../core/types';
import { Store } from '../state/store';
import { mountCanvasHost } from './canvas-host';

vi.mock('../render/renderer', () => ({ renderScene: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('canvas bitmap ownership', () => {
  it('closes replaced scene and undo sources only when the new scene does not reference them', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class { observe() {} });
    const host = document.createElement('main');
    host.innerHTML = '<div class="empty-state"></div><div class="load-error" hidden><p role="alert"></p><button></button></div>';
    const store = new Store(createScene());
    const canvas = mountCanvasHost({ host, store });
    const first = { close: vi.fn() } as unknown as ImageBitmap;
    const second = { close: vi.fn() } as unknown as ImageBitmap;
    const image = (source: ImageBitmap) => ({ source, width: 10, height: 10, dataUrl: '' });
    const scene = createScene();
    scene.image = image(first);
    canvas.setScene(scene);
    canvas.checkpointScene();
    store.set({ image: image(second) });
    canvas.setScene({ ...store.get(), image: image(first) });
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).toHaveBeenCalledOnce();
    canvas.setScene(createScene());
    expect(first.close).toHaveBeenCalledOnce();
  });
});
