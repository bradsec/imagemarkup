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
    vi.stubGlobal('requestAnimationFrame', () => 1);
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

function mountedScene() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('ResizeObserver', class { observe() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  const host = document.createElement('main');
  host.innerHTML = '<div class="empty-state"></div><div class="load-error" hidden><p role="alert"></p><button></button></div>';
  document.body.appendChild(host);
  const scene = createScene();
  scene.image = { source: {} as ImageBitmap, width: 100, height: 100, dataUrl: '' };
  scene.viewport = { scale: 1, tx: 0, ty: 0 };
  const store = new Store(scene);
  const canvasHost = mountCanvasHost({ host, store });
  const canvas = host.querySelector('canvas')!;
  const pointer = (type: string, x: number, y: number, target: Element = canvas) => {
    const event = new Event(type, { bubbles: true }) as PointerEvent;
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, button: { value: 0 }, clientX: { value: x }, clientY: { value: y } });
    target.dispatchEvent(event);
  };
  return { host, store, canvasHost, pointer };
}

describe('canvas gesture cancellation', () => {
  it('keeps the touch text editor at 16px while its visual box follows canvas zoom', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { host, store, pointer } = mountedScene();
    Object.defineProperty(host, 'clientWidth', { value: 300 });
    store.set({ activeTool: 'text', viewport: { scale: 0.25, tx: 0, ty: 0 } });
    pointer('pointerdown', 20, 20);
    await Promise.resolve();
    const editor = host.querySelector<HTMLTextAreaElement>('.text-editor')!;
    editor.value = 'AB';
    editor.dispatchEvent(new Event('input'));
    const visualScale = Number(editor.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    expect(Number.parseFloat(getComputedStyle(editor).fontSize)).toBeGreaterThanOrEqual(16);
    expect(Number.parseFloat(editor.style.width) * visualScale).toBeCloseTo(12);
    expect(Number.parseFloat(editor.style.height) * visualScale).toBeCloseTo(9.6);
    host.remove();
  });

  it('keeps typed text when pointercancel bubbles from its editor', async () => {
    const { host, store, pointer } = mountedScene();
    store.set({ activeTool: 'text' });
    pointer('pointerdown', 20, 20);
    await Promise.resolve();
    const editor = host.querySelector<HTMLTextAreaElement>('.text-editor')!;
    expect(editor).not.toBeNull();
    editor.value = 'Typed text';
    pointer('pointercancel', 20, 20, editor);
    expect(host.querySelector('.text-editor')).toBe(editor);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(store.get().objects.some((object) => object.type === 'text' && object.text === 'Typed text')).toBe(true);
    host.remove();
  });

  it('honors a newly chosen crop ratio when resizing a handle', () => {
    const { host, store, canvasHost, pointer } = mountedScene();
    store.set({ activeTool: 'crop', crop: { x: 20, y: 20, w: 40, h: 40 } });
    canvasHost.setCropRatio(2);
    pointer('pointerdown', 60, 60);
    pointer('pointermove', 80, 80);
    const crop = store.get().crop!;
    expect(crop.w / crop.h).toBeCloseTo(2);
    host.remove();
  });
});

describe('accessible placement', () => {
  it('does not activate drawing shortcuts without an image', () => {
    const { host, store } = mountedScene();
    store.set({ image: null });
    host.tabIndex = 0;
    host.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    expect(store.get().activeTool).toBe('select');
    const viewport = store.get().viewport;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(store.get().viewport).toBe(viewport);
    host.remove();
  });

  it('creates a visible rectangle on click without dragging', () => {
    const { host, store, pointer } = mountedScene();
    store.set({ activeTool: 'rect' });
    pointer('pointerdown', 50, 50);
    pointer('pointerup', 50, 50);
    const object = store.get().objects[0];
    expect(object).toMatchObject({ type: 'rect' });
    expect(object && 'rect' in object && object.rect.w).toBeGreaterThan(0);
    host.remove();
  });

  it('creates a visible crop on click without dragging', () => {
    const { host, store, pointer } = mountedScene();
    store.set({ activeTool: 'crop' });
    pointer('pointerdown', 50, 50);
    pointer('pointerup', 50, 50);
    expect(store.get().crop?.w).toBeGreaterThan(0);
    expect(store.get().crop?.h).toBeGreaterThan(0);
    host.remove();
  });

  it('places a shape from the keyboard when the canvas has focus', () => {
    const { host, store } = mountedScene();
    host.tabIndex = 0;
    host.focus();
    store.set({ activeTool: 'ellipse' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(store.get().objects[0]).toMatchObject({ type: 'ellipse' });
    host.remove();
  });
});

describe('replacement and modal keys', () => {
  it('confirms image replacement and restores the prior image with one undo', () => {
    const { host, store, canvasHost } = mountedScene();
    const original = store.get().image;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const replacement = { source: {} as ImageBitmap, width: 90, height: 90, dataUrl: '' };
    canvasHost.setImage(replacement);
    expect(store.get().image).toBe(original);
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true);
    canvasHost.setImage(replacement);
    expect(store.get().image).toBe(replacement);
    canvasHost.undo();
    expect(store.get().image).toBe(original);
    host.remove();
  });

  it('keeps canvas state when Escape closes a dialog', () => {
    const { host, store } = mountedScene();
    store.set({ activeTool: 'rect' });
    const dialog = document.createElement('dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(store.get().activeTool).toBe('rect');
    dialog.remove();
    host.remove();
  });

  it('still resets the canvas on Escape when focus rests on a closed menu', () => {
    const { host, store } = mountedScene();
    store.set({ activeTool: 'rect' });
    const menu = document.createElement('details');
    menu.className = 'app-menu';
    const summary = document.createElement('summary');
    menu.appendChild(summary);
    document.body.appendChild(menu);
    summary.tabIndex = 0;
    summary.focus();
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(store.get().activeTool).toBe('select');
    menu.remove();
    host.remove();
  });
});
