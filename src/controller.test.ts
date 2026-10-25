// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScene, type Scene } from './core/types';
import type { Store } from './state/store';

const mocks = vi.hoisted(() => ({
  host: { checkpoint: vi.fn(), checkpointScene: vi.fn(), setScene: vi.fn(), undo: vi.fn(), redo: vi.fn(), cancelGesture: vi.fn(), openImage: vi.fn(), duplicateSelected: vi.fn(), deleteSelected: vi.fn(), pickColor: vi.fn(), setCropRatio: vi.fn(), canUndo: vi.fn(() => false), canRedo: vi.fn(() => false) },
  store: null as Store<Scene> | null,
  storage: { getItem: vi.fn<() => Promise<string | null>>(), setItem: vi.fn<() => Promise<void>>(), removeItem: vi.fn<() => Promise<void>>() },
}));

vi.mock('./ui/canvas-host', () => ({ mountCanvasHost: ({ store }: { store: Store<Scene> }) => { mocks.store = store; return mocks.host; } }));
vi.mock('./ui/options-preview', () => ({ mountOptionsPreview: () => () => {} }));
vi.mock('./fonts/uploaded', () => ({ loadUploadedFonts: async () => [], saveUploadedFont: vi.fn() }));
vi.mock('./state/autosave', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./state/autosave')>();
  return { ...actual, createAutosaveStorage: () => mocks.storage };
});

import { startApp } from './controller';
import { MAX_PROJECT_FILE_BYTES, serializeScene } from './core/serialize';
import * as serialization from './core/serialize';

function flush(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

function app(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  startApp(root);
  return root;
}

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.clearAllMocks();
  mocks.storage.getItem.mockResolvedValue(null);
  mocks.storage.setItem.mockResolvedValue();
  mocks.storage.removeItem.mockResolvedValue();
  mocks.host.setScene.mockImplementation((scene: Scene) => mocks.store!.set(scene));
  Object.defineProperty(globalThis, 'indexedDB', { value: {}, configurable: true });
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addListener() {}, removeListener() {} }), configurable: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});

describe('controller regressions', () => {
  it('OWNER-4 disables image tools and actions until an image loads', () => {
    const root = app();
    expect(root.querySelector<HTMLButtonElement>('[data-tool="rect"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-action="fit"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-action="open-image"]')?.disabled).toBe(false);
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' } });
    expect(root.querySelector<HTMLButtonElement>('[data-tool="rect"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-action="fit"]')?.disabled).toBe(false);
  });

  it('OWNER-4 keeps Undo available after an undoable replacement leaves no image', () => {
    const root = app();
    mocks.host.canUndo.mockReturnValue(true);
    mocks.store!.set({ image: null });
    expect(root.querySelector<HTMLButtonElement>('[data-action="undo"]')?.disabled).toBe(false);
    mocks.host.canUndo.mockReturnValue(false);
  });

  it('CODE-04 reports a project size error when saving', () => {
    const root = app();
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' } });
    const serialize = vi.spyOn(serialization, 'serializeScene').mockImplementation(() => { throw new Error('Project image data is too large'); });
    root.querySelector<HTMLButtonElement>('[data-action="save-project"]')!.click();
    expect(root.querySelector('#status')?.textContent).toBe('Project image data is too large');
    serialize.mockRestore();
  });

  it('UX-06 keeps autosave failure visible until a later save succeeds', async () => {
    const root = app();
    const indicator = root.querySelector<HTMLElement>('[data-autosave-status]')!;
    expect(indicator.getAttribute('aria-live')).toBe('polite');
    mocks.storage.setItem.mockRejectedValue(new Error('no space'));
    mocks.store!.set({ showOverflow: true });
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(indicator.hidden).toBe(false);
    mocks.storage.setItem.mockResolvedValue();
    mocks.store!.set({ showOverflow: false });
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(indicator.hidden).toBe(true);
  });

  it('UX-07 moves the same dimensions control into mobile options', () => {
    Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, addListener() {} }), configurable: true });
    const root = app();
    const dimensions = root.querySelector<HTMLElement>('[data-selection-dimensions]')!;
    expect(dimensions.parentElement).toBe(root.querySelector('.optionsbar'));
    const scene = createScene();
    const object = { id: 'rect-1', type: 'rect' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, style: scene.toolStyle };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [object], selectedId: object.id });
    expect(dimensions.hidden).toBe(false);
    expect(dimensions.querySelector<HTMLInputElement>('[data-selection-size="width"]')?.value).toBe('20');
  });

  it('UX-03 uses the fill color for a selected solid redaction', () => {
    const root = app();
    const scene = createScene();
    const object = { id: 'redact-1', type: 'redaction' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, mode: 'solid' as const, strength: 10, style: { ...scene.toolStyle, fill: '#000000' } };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [object], selectedId: object.id });
    const fill = root.querySelector<HTMLInputElement>('[data-style="fill"]')!;
    expect(fill.closest<HTMLElement>('[data-options="fill"]')?.hidden).toBe(false);
    expect(fill.disabled).toBe(false);
    fill.value = '#123456';
    fill.dispatchEvent(new Event('input', { bubbles: true }));
    expect(mocks.store!.get().objects[0].style.fill).toBe('#123456');
  });

  it('UX-03 enables a black fill when switching a redaction to Solid', () => {
    const root = app();
    const scene = createScene();
    const object = { id: 'redact-1', type: 'redaction' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, mode: 'pixelate' as const, strength: 10, style: { ...scene.toolStyle, fill: undefined } };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [object], selectedId: object.id });
    const mode = root.querySelector<HTMLSelectElement>('[data-style="redaction-mode"]')!;
    mode.focus();
    mode.value = 'solid';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const fill = root.querySelector<HTMLInputElement>('[data-style="fill"]')!;
    expect(fill.disabled).toBe(false);
    expect(fill.value).toBe('#000000');
    expect(mocks.store!.get().objects[0].style.fill).toBe('#000000');
  });
  it('A11Y-03 keeps focus on a layer control after an update and moves focus after deletion', () => {
    const root = app();
    const scene = createScene();
    const object = { id: 'rect-1', type: 'rect' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, style: scene.toolStyle };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [object] });
    const visibility = root.querySelector<HTMLButtonElement>('[data-action="toggle-layer-visibility"]')!;
    visibility.focus();
    visibility.click();
    expect(document.activeElement).toBe(root.querySelector('[data-action="toggle-layer-visibility"]'));
    root.querySelector<HTMLButtonElement>('[data-action="delete-layer"]')!.focus();
    root.querySelector<HTMLButtonElement>('[data-action="delete-layer"]')!.click();
    expect(document.activeElement).toBe(root.querySelector('[data-layers-list]'));
  });

  it('A11Y-06 reorders one layer with Alt+ArrowUp and the one-step menu actions', () => {
    const root = app();
    const scene = createScene();
    const objects = ['a', 'b', 'c'].map((id) => ({ id, type: 'rect' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, style: scene.toolStyle }));
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects });
    const row = root.querySelector<HTMLElement>('[data-layer-id="a"]')!;
    row.querySelector<HTMLButtonElement>('[data-action="select-layer"]')!.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    expect(mocks.store!.get().objects.map((object) => object.id)).toEqual(['b', 'a', 'c']);
    expect(document.activeElement?.closest('[data-layer-id]')?.getAttribute('data-layer-id')).toBe('a');
    root.querySelector<HTMLButtonElement>('[data-action="bring-forward"]')!.click();
    expect(mocks.store!.get().objects.map((object) => object.id)).toEqual(['b', 'c', 'a']);
    const movedRow = root.querySelector<HTMLElement>('[data-layer-id="a"]')!;
    movedRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-layer-context-action="send-backward"]')!.click();
    expect(mocks.store!.get().objects.map((object) => object.id)).toEqual(['b', 'a', 'c']);
  });
  it('keeps a locked selected layer in place when arranging', () => {
    const root = app();
    const scene = createScene();
    const objects = ['a', 'b'].map((id) => ({ id, type: 'rect' as const, rect: { x: 1, y: 1, w: 20, h: 20 }, style: scene.toolStyle, locked: id === 'a' }));
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects, selectedId: 'a' });
    root.querySelector<HTMLButtonElement>('[data-action="bring-front"]')!.click();
    expect(mocks.store!.get().objects.map((object) => object.id)).toEqual(['a', 'b']);
    expect(mocks.host.checkpointScene).not.toHaveBeenCalled();
  });
  it('CODE-03 retains a failed autosave record and reports the restore error', async () => {
    mocks.storage.getItem.mockResolvedValue('{bad json');
    const root = app();
    await flush();
    expect(mocks.storage.removeItem).not.toHaveBeenCalled();
    expect(root.querySelector('#status')?.textContent).toContain('Autosave restore failed');
  });

  it('CODE-05 saves edits made while startup autosave is loading', async () => {
    let resolveRead!: (value: string | null) => void;
    mocks.storage.getItem.mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    app();
    mocks.store!.set({ showOverflow: true });
    resolveRead(null);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(mocks.storage.setItem).toHaveBeenCalled();
  });

  it('CODE-10 checkpoints a keyboard change to selected text', () => {
    const root = app();
    const scene = createScene();
    const text = { id: 'text-1', type: 'text' as const, position: { x: 0, y: 0 }, text: 'Hello', style: scene.toolStyle, fontFamily: 'system-ui', fontSize: 24, fontWeight: 'normal' as const, align: 'left' as const };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [text], selectedId: text.id });
    mocks.host.checkpoint.mockClear();
    const weight = root.querySelector<HTMLSelectElement>('[data-style="font-weight"]')!;
    weight.value = 'bold';
    weight.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mocks.host.checkpoint).toHaveBeenCalledTimes(1);
  });

  it('applies a letter spacing preset once and shows Custom for a typed value', () => {
    const root = app();
    const scene = createScene();
    const text = { id: 'text-1', type: 'text' as const, position: { x: 0, y: 0 }, text: 'Hello', style: scene.toolStyle, fontFamily: 'system-ui', fontSize: 24, fontWeight: 'normal' as const, align: 'left' as const };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [text], selectedId: text.id });
    const input = root.querySelector<HTMLInputElement>('[data-style="letter-spacing"]')!;
    const presets = root.querySelector<HTMLSelectElement>('[aria-label="Letter spacing presets"]')!;
    mocks.host.checkpoint.mockClear();
    presets.value = '50';
    presets.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mocks.store!.get().objects[0]).toMatchObject({ letterSpacing: 50 });
    expect(mocks.host.checkpoint).toHaveBeenCalledTimes(1);
    input.value = '37';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(presets.value).toBe('');
    expect(mocks.store!.get().objects[0]).toMatchObject({ letterSpacing: 37 });
  });

  it('CODE-10 records one undo step for a text formatting button', () => {
    const root = app();
    const scene = createScene();
    const text = { id: 'text-1', type: 'text' as const, position: { x: 0, y: 0 }, text: 'Hello', style: scene.toolStyle, fontFamily: 'system-ui', fontSize: 24, fontWeight: 'normal' as const, align: 'left' as const };
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' }, objects: [text], selectedId: text.id });
    mocks.host.checkpoint.mockClear();
    root.querySelector<HTMLButtonElement>('[data-action="toggle-bold"]')!.click();
    expect(mocks.host.checkpoint).toHaveBeenCalledTimes(1);
  });

  it('CODE-13 Escape cannot repeat a prior transform', () => {
    const root = app();
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' } });
    const button = root.querySelector<HTMLButtonElement>('[data-action="transform"]')!;
    const dialog = root.querySelector<HTMLDialogElement>('#transform-dialog')!;
    dialog.returnValue = 'flip-horizontal';
    mocks.host.checkpointScene.mockClear();
    button.click();
    dialog.dispatchEvent(new Event('cancel'));
    dialog.close();
    expect(mocks.host.checkpointScene).not.toHaveBeenCalled();
  });

  it('UX-01 and CODE-02 confirm a project replacement and make it undoable', async () => {
    const root = app();
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const file = new File([serializeScene(createScene())], 'empty.imgmarkup', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => serializeScene(createScene()) });
    const input = root.querySelector<HTMLInputElement>('input[accept^=".imgmarkup"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(mocks.host.setScene).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(mocks.host.setScene).toHaveBeenCalledWith(expect.anything(), true);
    confirm.mockRestore();
  });

  it('rejects an oversized project before reading it', async () => {
    const root = app();
    const file = new File(['{}'], 'large.imgmarkup');
    Object.defineProperty(file, 'size', { value: MAX_PROJECT_FILE_BYTES + 1 });
    const read = vi.fn(async () => '{}');
    Object.defineProperty(file, 'text', { value: read });
    const input = root.querySelector<HTMLInputElement>('input[accept^=".imgmarkup"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('#status')?.textContent).toBe('Project file is too large');
    expect(read).not.toHaveBeenCalled();
    expect(mocks.host.setScene).not.toHaveBeenCalled();
  });

  it('restores missing project settings to their prior defaults', async () => {
    const root = app();
    const project = JSON.parse(serializeScene(createScene())) as Record<string, unknown>;
    delete project.arrowStartHead;
    delete project.counterFormat;
    const file = new File([JSON.stringify(project)], 'older.imgmarkup');
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(project) });
    const input = root.querySelector<HTMLInputElement>('input[accept^=".imgmarkup"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(mocks.host.setScene).toHaveBeenCalledWith(expect.objectContaining({ arrowStartHead: 'none', counterFormat: 'numeric' }), true);
  });

  it('applies frame border and text watermark as one checkpointed change', async () => {
    const root = app();
    mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' } });
    root.querySelector<HTMLButtonElement>('[data-action="frame"]')!.click();
    const dialog = root.querySelector<HTMLDialogElement>('#frame-dialog')!;
    dialog.querySelector<HTMLInputElement>('[name="borderWidth"]')!.value = '4';
    dialog.querySelector<HTMLInputElement>('[name="borderColor"]')!.value = '#123456';
    dialog.querySelector<HTMLInputElement>('[name="watermarkText"]')!.value = 'Draft';
    mocks.host.checkpointScene.mockClear();
    dialog.close('apply');
    await flush();
    expect(mocks.host.checkpointScene).toHaveBeenCalledTimes(1);
    expect(mocks.store!.get()).toMatchObject({ border: { width: 4, color: '#123456' }, watermark: { kind: 'text', text: 'Draft' } });
  });

  it('removes only the watermark from frame settings', () => {
    const root = app();
    mocks.store!.set({ border: { width: 4, color: '#123456' }, watermark: { kind: 'text', text: 'Draft', size: 32, color: '#ffffff', opacity: .35, tile: false } });
    root.querySelector<HTMLDialogElement>('#frame-dialog')!.close('remove-watermark');
    expect(mocks.store!.get().border).toEqual({ width: 4, color: '#123456' });
    expect(mocks.store!.get().watermark).toBeNull();
    expect(mocks.host.checkpointScene).toHaveBeenCalledTimes(1);
  });

  it('crops the image and clips a layer in one undo step', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const dataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
    try {
      const root = app();
      const scene = createScene();
      mocks.store!.set({
        image: { source: document.createElement('canvas'), width: 100, height: 100, dataUrl: 'data:image/png;base64,AA==' },
        objects: [{ id: 'rect-1', type: 'rect', rect: { x: 15, y: 25, w: 10, h: 10 }, style: scene.toolStyle }],
        crop: { x: 10, y: 20, w: 40, h: 30 },
        activeTool: 'crop',
      });
      mocks.host.checkpointScene.mockClear();
      root.querySelector<HTMLButtonElement>('[data-action="apply-crop"]')!.click();
      expect(mocks.host.checkpointScene).toHaveBeenCalledTimes(1);
      expect(mocks.store!.get().image).toMatchObject({ width: 40, height: 30 });
      expect(mocks.store!.get().objects[0]).toMatchObject({ rect: { x: 5, y: 5, w: 10, h: 10 } });
      expect(mocks.store!.get().crop).toBeNull();
    } finally {
      context.mockRestore();
      dataUrl.mockRestore();
    }
  });

  it('rotates image dimensions and its layers together', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const dataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
    try {
      const root = app();
      mocks.store!.set({ image: { source: document.createElement('canvas'), width: 100, height: 80, dataUrl: 'data:image/png;base64,AA==' } });
      root.querySelector<HTMLButtonElement>('[data-action="transform"]')!.click();
      mocks.host.checkpointScene.mockClear();
      root.querySelector<HTMLDialogElement>('#transform-dialog')!.close('rotate-right');
      expect(mocks.host.checkpointScene).toHaveBeenCalledTimes(1);
      expect(mocks.store!.get().image).toMatchObject({ width: 80, height: 100 });
    } finally {
      context.mockRestore();
      dataUrl.mockRestore();
    }
  });
});
