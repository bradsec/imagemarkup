import { createScene, type AnnotationStyle, type Scene, type Tool } from './core/types';
import { Store } from './state/store';
import { mountCanvasHost } from './ui/canvas-host';
import { renderShell } from './ui/shell';
import { mountOptionsView, queryOptionControls } from './ui/options-view';
import { mountOptionEvents } from './ui/options-events';
import { mountExportActions } from './ui/export-actions';
import { MAX_PROJECT_IMAGE_DATA_LENGTH, projectImageDataLength } from './core/serialize';
import { decodeImageFile } from './io/load-image';
import { mountProjectIo } from './io/project';
import { cropAnnotations, scaleAnnotation, transformAnnotation, type FrameTransform } from './core/transform';
import { fitViewport } from './core/viewport';
import type { LoadedImage } from './core/types';
import { icon } from './ui/icons';
import { LAYOUT_STORAGE_KEY, mountPanels, readPanelLayout } from './ui/panels';
import { setSelectionColor } from './render/renderer';
import { DEFAULT_PREFERENCES, mountPreferences, readPreferences } from './ui/preferences';
import { annotationBounds, resizeAnnotationToBounds } from './core/annotations';
import { mountLayers } from './ui/layers';

export function startApp(root: HTMLElement): void {
  const { stageHost, statusEl } = renderShell(root);
  const autosaveStatus = root.querySelector<HTMLElement>('[data-autosave-status]');
  const autosaveUnavailable = () => { if (autosaveStatus?.hidden) { autosaveStatus.hidden = false; autosaveStatus.textContent = 'Autosave unavailable'; } };
  const autosaveAvailable = () => { if (autosaveStatus) { autosaveStatus.hidden = true; autosaveStatus.textContent = ''; } };
  let preferences = readPreferences();
  let panelLayout = readPanelLayout();
  setSelectionColor(preferences.selectionColor);
  const measurementValue = (pixels: number): number => {
    if (preferences.measurementUnit === 'px') return pixels;
    const inches = pixels / preferences.measurementPpi;
    return preferences.measurementUnit === 'in' ? inches : inches * (preferences.measurementUnit === 'cm' ? 2.54 : 25.4);
  };
  const measurementPixels = (value: number): number => {
    if (preferences.measurementUnit === 'px') return value;
    const inches = preferences.measurementUnit === 'in' ? value : value / (preferences.measurementUnit === 'cm' ? 2.54 : 25.4);
    return inches * preferences.measurementPpi;
  };
  const dimensionValue = (pixels: number): string => String(Number(measurementValue(pixels).toFixed(preferences.measurementUnit === 'px' ? 2 : 3)));
  const formatMeasurement = (pixels: number): string => {
    if (preferences.measurementUnit === 'px') return `${Math.round(pixels)} px`;
    const value = measurementValue(pixels);
    return `${value.toFixed(value < 10 ? 2 : 1)} ${preferences.measurementUnit}`;
  };
  const store = new Store<Scene>(createScene());
  const zoomValue = root.querySelector<HTMLOutputElement>('#zoom-value')!;
  const selectionDimensions = root.querySelector<HTMLElement>('[data-selection-dimensions]')!;
  const selectionWidth = root.querySelector<HTMLInputElement>('[data-selection-size="width"]')!;
  const selectionHeight = root.querySelector<HTMLInputElement>('[data-selection-size="height"]')!;
  const selectionAspectButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-selection-aspect"]')!;
  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>('.toolrail [data-tool]')];
  const toolList = root.querySelector<HTMLElement>('.tool-list')!;
  const overflowButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-overflow"]')!;
  const canvasInstructions = root.querySelector<HTMLElement>('#canvas-instructions')!;
  const canvasHost = mountCanvasHost({
    host: stageHost,
    store,
    onStatus: (text) => {
      statusEl.textContent = text;
    },
  });
  const numericPairs = [...root.querySelectorAll<HTMLElement>('.numeric-pair:has([data-numeric-companion])')].map((pair) => {
    const source = pair.firstElementChild as HTMLInputElement;
    const companion = pair.querySelector<HTMLInputElement | HTMLSelectElement>('[data-numeric-companion]')!;
    const factor = Number(companion.dataset.factor ?? 1);
    const sync = () => {
      const value = String(Number(source.value) * factor);
      companion.value = companion instanceof HTMLSelectElement && ![...companion.options].some((option) => option.value === value) ? '' : value;
    };
    source.addEventListener('input', sync);
    source.addEventListener('change', sync);
    if (source.type === 'range' && source.dataset.style) {
      companion.addEventListener('focus', canvasHost.checkpoint);
    }
    if (companion instanceof HTMLInputElement && companion.type === 'range') {
      companion.addEventListener('input', () => { source.value = String(Number(companion.value) / factor); });
    }
    companion.addEventListener('change', () => {
      if (!companion.value) { sync(); return; }
      const value = Number(companion.value) / factor;
      source.value = String(Math.max(Number(source.min), Math.min(Number(source.max), value)));
      source.dispatchEvent(new Event('input', { bubbles: true }));
      source.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    sync();
    return sync;
  });
  const syncNumericPairs = () => { for (const sync of numericPairs) sync(); };
  const openDialog = (dialog: HTMLDialogElement, invoker: HTMLElement) => {
    const menu = invoker.closest('details.app-menu');
    const returnTo = menu?.querySelector<HTMLElement>('summary') ?? invoker;
    syncNumericPairs();
    dialog.showModal();
    const heading = dialog.querySelector<HTMLElement>('h2')!;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    dialog.addEventListener('close', () => { if (returnTo.isConnected) returnTo.focus({ preventScroll: true }); }, { once: true });
  };
  mountPreferences(root, store, statusEl, openDialog, (value) => { preferences = value; setSelectionColor(value.selectionColor); }, () => preferences);
  const defaultToolStyles = () => new Map<Tool, AnnotationStyle>([
    ['highlighter', { color: '#f4df57', width: 22, opacity: .5 }],
    ['pen', { color: '#ff3b30', width: 4, opacity: 1 }],
  ]);
  const toolStyles = defaultToolStyles();
  // Swap per-tool styles on every tool change, not only toolrail clicks: Escape and the
  // single-key shortcuts change the tool inside canvas-host. A change that brings its own
  // style (project restore, settings reset) keeps it.
  let previousTool = store.get().activeTool;
  let previousStyle = store.get().toolStyle;
  store.subscribe(() => {
    const scene = store.get();
    if (scene.activeTool === previousTool) { previousStyle = scene.toolStyle; return; }
    toolStyles.set(previousTool, { ...previousStyle });
    previousTool = scene.activeTool;
    if (scene.toolStyle !== previousStyle) { previousStyle = scene.toolStyle; return; }
    // A first visit carries over color and width only; fill and a disabled outline belong to the previous tool.
    const toolStyle = toolStyles.get(scene.activeTool) ?? (scene.activeTool === 'symbol'
      ? { ...previousStyle, fill: previousStyle.color, stroke: false, opacity: 1 }
      : { ...previousStyle, fill: undefined, stroke: true, opacity: 1 });
    previousStyle = toolStyle;
    store.set({ toolStyle });
  });
  for (const button of toolButtons) {
    button.addEventListener('click', () => {
      const activeTool = button.dataset.tool as Tool;
      canvasHost.cancelGesture();
      store.set({ activeTool, selectedId: null, selectedIds: [], marquee: null, crop: null });
      // On phones a tool choice shows its options; drawing on the canvas collapses them again.
      // A tool without options must not collapse an open Layers panel.
      if (compactPanels.matches && !optionsbar.hidden) setOptionsCollapsed(false);
      if (activeTool === 'crop') updateCropRatio();
      if (activeTool === 'image') canvasHost.openImage('place');
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="undo"]')) button.addEventListener('click', canvasHost.undo);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="redo"]')) button.addEventListener('click', canvasHost.redo);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="open-image"]')) {
    button.addEventListener('click', () => canvasHost.openImage('replace'));
  }
  root.querySelector<HTMLButtonElement>('[data-action="new-project"]')!.addEventListener('click', () => {
    const scene = store.get();
    if ((scene.image || scene.objects.length > 0) && !window.confirm('Start a new project? This clears the current image and markup.')) return;
    canvasHost.setScene(createScene(), true);
    statusEl.textContent = 'New project';
  });
  root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.addEventListener('click', canvasHost.deleteSelected);
  root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.addEventListener('click', canvasHost.duplicateSelected);

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('.menu-popover button, .menu-popover a')) return;
    const menu = event.target.closest<HTMLDetailsElement>('details');
    if (!menu) return;
    menu.open = false;
    if (!root.querySelector('dialog[open]')) menu.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  });
  const appMenus = [...root.querySelectorAll<HTMLDetailsElement>('details.app-menu')];
  const closeMenus = (except?: HTMLDetailsElement) => {
    for (const menu of appMenus) if (menu !== except) menu.open = false;
  };
  for (const menu of appMenus) {
    // Native <details> do not close their siblings, so a second menu would stack
    // on top of the first. Close the others whenever one opens.
    menu.addEventListener('toggle', () => { if (menu.open) closeMenus(menu); });
    // Once any menu is open, hovering a sibling switches to it, like a desktop menu bar.
    menu.querySelector('summary')?.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (!menu.open && appMenus.some((other) => other.open)) menu.open = true;
    });
  }
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.app-menu')) closeMenus();
  }, { capture: true });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const activeMenu = appMenus.find((menu) => menu.open && menu.contains(document.activeElement));
    closeMenus();
    activeMenu?.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  });
  const contextMenu = root.querySelector<HTMLElement>('#canvas-context-menu')!;
  let contextMenuInvoker: HTMLElement = stageHost;
  stageHost.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!store.get().selectedId) { contextMenu.hidden = true; return; }
    const bounds = stageHost.getBoundingClientRect();
    contextMenuInvoker = document.activeElement instanceof HTMLElement && stageHost.contains(document.activeElement) ? document.activeElement : stageHost;
    contextMenu.hidden = false;
    contextMenu.style.left = `${Math.max(6, Math.min(event.clientX - bounds.left, bounds.width - contextMenu.offsetWidth - 6))}px`;
    contextMenu.style.top = `${Math.max(6, Math.min(event.clientY - bounds.top, window.innerHeight - bounds.top - contextMenu.offsetHeight - 6))}px`;
    contextMenu.querySelector<HTMLButtonElement>('button')?.focus();
  });
  window.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.context-menu')) contextMenu.hidden = true;
  }, { capture: true });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !contextMenu.hidden) {
      contextMenu.hidden = true;
      contextMenuInvoker.focus({ preventScroll: true });
    }
  });
  contextMenu.addEventListener('keydown', (event) => {
    const items = [...contextMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  });

  const controls = queryOptionControls(root);
  const { fill, railFill, watermarkFont } = controls;
  const panels = mountPanels(root, stageHost, selectionDimensions, () => panelLayout);
  const { optionsbar, editorEl, compactPanels, setOptionsCollapsed, resetPanels } = panels;
  root.querySelector<HTMLButtonElement>('[data-action="reset-settings"]')!.addEventListener('click', () => {
    if (!window.confirm('Reset panel positions, colors, and editor preferences to app defaults? Your artwork will not be changed.')) return;
    preferences = { ...DEFAULT_PREFERENCES };
    setSelectionColor(preferences.selectionColor);
    panelLayout = { tools: {} };
    try {
      localStorage.removeItem('imagemarkup.preferences');
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch { /* Defaults still apply for this session. */ }
    toolStyles.clear();
    for (const [tool, style] of defaultToolStyles()) toolStyles.set(tool, style);
    resetPanels();
    const defaults = createScene();
    const activeTool = store.get().activeTool;
    const activeStyle = toolStyles.get(activeTool) ?? (activeTool === 'symbol'
      ? { ...defaults.toolStyle, fill: defaults.toolStyle.color, stroke: false }
      : defaults.toolStyle);
    fill.value = '#17c0b8';
    railFill.value = '#17c0b8';
    store.set({
      selectedId: null,
      selectedIds: [],
      marquee: null,
      toolStyle: { ...activeStyle },
      symbolName: defaults.symbolName,
      symbolPoints: defaults.symbolPoints,
      symbolInnerRatio: defaults.symbolInnerRatio,
      symbolSides: defaults.symbolSides,
      arrowStartHead: defaults.arrowStartHead,
      arrowEndHead: defaults.arrowEndHead,
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      letterSpacing: defaults.letterSpacing,
      lineHeight: defaults.lineHeight,
      fontWeight: defaults.fontWeight,
      fontStyle: defaults.fontStyle,
      textUnderline: defaults.textUnderline,
      textAlign: defaults.textAlign,
      redactionMode: defaults.redactionMode,
      redactionStrength: defaults.redactionStrength,
      counterShape: defaults.counterShape,
      counterFilled: defaults.counterFilled,
      counterSize: defaults.counterSize,
      counterFormat: defaults.counterFormat,
      counterNext: defaults.counterNext,
      counterFontSize: defaults.counterFontSize,
      counterFontFamily: defaults.counterFontFamily,
      counterTextColor: defaults.counterTextColor,
    });
    statusEl.textContent = 'Settings reset to defaults';
  });
  const { renderLayers, reorder, reorderOne } = mountLayers(root, store, canvasHost, editorEl);
  const syncUi = mountOptionsView({ root, store, canvasHost, panels, controls, stageHost, statusEl, toolButtons, toolList, zoomValue, overflowButton, canvasInstructions, selectionDimensions, selectionWidth, selectionHeight, selectionAspectButton, getPreferences: () => preferences, dimensionValue, formatMeasurement, syncNumericPairs, renderLayers });
  const setSelectionAspectLocked = (locked: boolean) => {
    selectionAspectButton.setAttribute('aria-pressed', String(locked));
    selectionAspectButton.setAttribute('aria-label', locked ? 'Preserve aspect ratio' : 'Allow independent width and height');
    selectionAspectButton.title = locked ? 'Preserve aspect ratio' : 'Allow independent width and height';
    selectionAspectButton.innerHTML = icon(locked ? 'link' : 'unlink', 16);
  };
  const toggleSelectionAspect = () => setSelectionAspectLocked(selectionAspectButton.getAttribute('aria-pressed') !== 'true');
  selectionAspectButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    toggleSelectionAspect();
  });
  selectionAspectButton.addEventListener('click', (event) => {
    if (event.detail === 0) toggleSelectionAspect();
  });
  const applySelectionDimension = (dimension: 'width' | 'height') => {
    const input = dimension === 'width' ? selectionWidth : selectionHeight;
    const value = Number(input.value);
    const scene = store.get();
    const selected = scene.objects.find((object) => object.id === scene.selectedId);
    if (!selected || selected.locked || !Number.isFinite(value) || value <= 0) { syncUi(); return; }
    const pixels = measurementPixels(value);
    const bounds = annotationBounds(selected);
    let nextWidth = dimension === 'width' ? pixels : bounds.w;
    let nextHeight = dimension === 'height' ? pixels : bounds.h;
    if (selectionAspectButton.getAttribute('aria-pressed') === 'true' && bounds.w > 0 && bounds.h > 0) {
      if (dimension === 'width') nextHeight = pixels * bounds.h / bounds.w;
      else nextWidth = pixels * bounds.w / bounds.h;
    }
    canvasHost.checkpointScene();
    store.set({ objects: scene.objects.map((object) => object.id === selected.id ? resizeAnnotationToBounds(object, nextWidth, nextHeight) : object) });
  };
  selectionWidth.addEventListener('change', () => applySelectionDimension('width'));
  selectionHeight.addEventListener('change', () => applySelectionDimension('height'));
  store.subscribe(syncUi);
  syncUi();
  const uploadedFontsReady = mountOptionEvents({ root, store, canvasHost, controls, stageHost, statusEl, formatMeasurement, syncUi });
  root.querySelector<HTMLButtonElement>('[data-action="send-back"]')!.addEventListener('click', () => reorder(false));
  root.querySelector<HTMLButtonElement>('[data-action="bring-front"]')!.addEventListener('click', () => reorder(true));
  root.querySelector<HTMLButtonElement>('[data-action="send-backward"]')!.addEventListener('click', () => { if (store.get().selectedId) reorderOne(store.get().selectedId!, -1); });
  root.querySelector<HTMLButtonElement>('[data-action="bring-forward"]')!.addEventListener('click', () => { if (store.get().selectedId) reorderOne(store.get().selectedId!, 1); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="send-back"]')!.addEventListener('click', () => { reorder(false); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="bring-front"]')!.addEventListener('click', () => { reorder(true); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="delete"]')!.addEventListener('click', () => { canvasHost.deleteSelected(); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  mountProjectIo({ root, store, canvasHost, statusEl, uploadedFontsReady, autosaveAvailable, autosaveUnavailable });

  const copyButton = mountExportActions(root, store, statusEl, overflowButton, openDialog);
  root.querySelector<HTMLButtonElement>('[data-action="about"]')!.addEventListener('click', (event) => openDialog(root.querySelector<HTMLDialogElement>('#about-dialog')!, event.currentTarget as HTMLElement));
  for (const guide of ['tools', 'editing', 'saving', 'shortcuts']) {
    root.querySelector<HTMLButtonElement>(`[data-action="${guide}-guide"]`)!.addEventListener('click', (event) =>
      openDialog(root.querySelector<HTMLDialogElement>(`#${guide}-guide-dialog`)!, event.currentTarget as HTMLElement));
  }
  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const key = event.key.toLowerCase();
    if (key === 'c') { event.preventDefault(); copyButton.click(); }
    if (key === 'd') { event.preventDefault(); canvasHost.duplicateSelected(); }
    if (key === 'n') { event.preventDefault(); root.querySelector<HTMLButtonElement>('[data-action="new-project"]')?.click(); }
    if (key === 'o') { event.preventDefault(); canvasHost.openImage('replace'); }
    if (key === 's') { event.preventDefault(); root.querySelector<HTMLButtonElement>('[data-action="save-project"]')?.click(); }
    if (key === 'e') { event.preventDefault(); root.querySelector<HTMLButtonElement>('.primary-action[data-action="export"]')?.click(); }
  });

  const frameDialog = root.querySelector<HTMLDialogElement>('#frame-dialog')!;
  const borderWidthInput = frameDialog.querySelector<HTMLInputElement>('[name="borderWidth"]')!;
  const borderColorInput = frameDialog.querySelector<HTMLInputElement>('[name="borderColor"]')!;
  const watermarkTextInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkText"]')!;
  const watermarkBoldInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkBold"]')!;
  const watermarkItalicInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkItalic"]')!;
  const watermarkBoldButton = frameDialog.querySelector<HTMLButtonElement>('[data-action="toggle-watermark-bold"]')!;
  const watermarkItalicButton = frameDialog.querySelector<HTMLButtonElement>('[data-action="toggle-watermark-italic"]')!;
  const watermarkFileInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkImage"]')!;
  const watermarkColorInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkColor"]')!;
  const watermarkSizeInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkSize"]')!;
  const watermarkOpacityInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkOpacity"]')!;
  const watermarkScaleInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkScale"]')!;
  const watermarkAngleInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkAngle"]')!;
  const watermarkTileInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkTile"]')!;
  const watermarkAngleOutput = frameDialog.querySelector<HTMLOutputElement>('[data-value="watermark-angle"]')!;
  const syncWatermarkAngle = () => { watermarkAngleOutput.value = `${watermarkAngleInput.value}°`; };
  const syncWatermarkFormat = () => {
    watermarkBoldButton.setAttribute('aria-pressed', String(watermarkBoldInput.checked));
    watermarkItalicButton.setAttribute('aria-pressed', String(watermarkItalicInput.checked));
  };
  watermarkBoldButton.addEventListener('click', () => { watermarkBoldInput.checked = !watermarkBoldInput.checked; syncWatermarkFormat(); });
  watermarkItalicButton.addEventListener('click', () => { watermarkItalicInput.checked = !watermarkItalicInput.checked; syncWatermarkFormat(); });
  watermarkAngleInput.addEventListener('input', syncWatermarkAngle);
  root.querySelector<HTMLButtonElement>('[data-action="frame"]')!.addEventListener('click', (event) => {
    const scene = store.get();
    const watermark = scene.watermark;
    borderWidthInput.value = String(scene.border?.width ?? 0);
    borderColorInput.value = scene.border?.color ?? '#12161f';
    watermarkTextInput.value = watermark?.kind === 'text' ? watermark.text : '';
    watermarkFont.value = watermark?.kind === 'text' ? watermark.fontFamily ?? 'system-ui' : 'system-ui';
    watermarkBoldInput.checked = watermark?.kind === 'text' && watermark.fontWeight === 'bold';
    watermarkItalicInput.checked = watermark?.kind === 'text' && watermark.fontStyle === 'italic';
    watermarkFileInput.value = '';
    watermarkColorInput.value = watermark?.kind === 'text' ? watermark.color : '#ffffff';
    watermarkSizeInput.value = String(watermark?.kind === 'text' ? watermark.size : 32);
    watermarkOpacityInput.value = String(Math.round((watermark?.opacity ?? .35) * 100));
    watermarkScaleInput.value = String(Math.round((watermark?.kind === 'image' ? watermark.scale : .25) * 100));
    watermarkAngleInput.value = String(watermark?.angle ?? -30);
    watermarkTileInput.checked = watermark?.tile ?? false;
    syncWatermarkAngle();
    syncWatermarkFormat();
    openDialog(frameDialog, event.currentTarget as HTMLElement);
  });
  frameDialog.addEventListener('close', async () => {
    if (frameDialog.returnValue === 'remove-watermark') {
      canvasHost.checkpointScene();
      store.set({ watermark: null });
      statusEl.textContent = 'Watermark removed';
      return;
    }
    if (frameDialog.returnValue !== 'apply') return;
    try {
      const form = new FormData(frameDialog.querySelector('form')!);
      const borderWidth = Math.max(0, Number(form.get('borderWidth')));
      const watermarkText = String(form.get('watermarkText') ?? '').trim();
      const watermarkFile = form.get('watermarkImage');
      const frameScene = store.get();
      const remainingImageData = MAX_PROJECT_IMAGE_DATA_LENGTH - projectImageDataLength({ ...frameScene, watermark: null });
      const watermarkImage = watermarkFile instanceof File && watermarkFile.size ? await decodeImageFile(watermarkFile, remainingImageData) : null;
      if (store.get() !== frameScene) {
        (watermarkImage?.source as ImageBitmap | undefined)?.close?.();
        statusEl.textContent = 'Frame settings cancelled because the canvas changed';
        return;
      }
      if (watermarkImage && projectImageDataLength({ ...store.get(), watermark: { kind: 'image', dataUrl: watermarkImage.dataUrl, opacity: 1, scale: 1, tile: false } }) > MAX_PROJECT_IMAGE_DATA_LENGTH) {
        (watermarkImage.source as ImageBitmap).close?.();
        throw new Error('Project image data is too large');
      }
      const currentWatermark = store.get().watermark;
      const existingImage = currentWatermark?.kind === 'image' ? currentWatermark : null;
      const angle = Math.max(-180, Math.min(180, Number(form.get('watermarkAngle'))));
      const watermarkOpacity = Number(form.get('watermarkOpacity')) / 100;
      const tile = form.get('watermarkTile') === 'on';
      canvasHost.checkpointScene();
      store.set({
        border: borderWidth ? { width: borderWidth, color: String(form.get('borderColor')) } : null,
        watermark: watermarkImage ? {
          kind: 'image', dataUrl: watermarkImage.dataUrl, source: watermarkImage.source,
          scale: Number(form.get('watermarkScale')) / 100, opacity: watermarkOpacity, tile, angle,
        } : watermarkText ? {
          kind: 'text', text: watermarkText, size: Math.max(8, Number(form.get('watermarkSize'))), color: String(form.get('watermarkColor')),
          opacity: watermarkOpacity, tile, angle, fontFamily: String(form.get('watermarkFont')), fontWeight: form.get('watermarkBold') === 'on' ? 'bold' : 'normal',
          fontStyle: form.get('watermarkItalic') === 'on' ? 'italic' : 'normal',
        } : existingImage ? { ...existingImage, scale: Number(form.get('watermarkScale')) / 100, opacity: watermarkOpacity, tile, angle } : null,
      });
      statusEl.textContent = 'Frame settings applied';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not apply frame settings';
    }
  });

  function imageFromCanvas(canvas: HTMLCanvasElement): LoadedImage {
    return { source: canvas, width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
  }

  function applyCrop(): void {
    const scene = store.get();
    const image = scene.image;
    const crop = scene.crop;
    if (!image || !crop || crop.w < 1 || crop.h < 1) { statusEl.textContent = 'Draw a crop area first'; return; }
    if (crop.w * crop.h > 134_000_000) { statusEl.textContent = 'Crop dimensions are too large'; return; }
    canvasHost.cancelGesture();
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
    canvasHost.checkpointScene();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.w);
    canvas.height = Math.round(crop.h);
    canvas.getContext('2d')!.drawImage(image.source, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    store.set({
      image: imageFromCanvas(canvas),
      objects: cropAnnotations(scene.objects, crop),
      crop: null,
      activeTool: 'select',
      selectedId: null,
      selectedIds: [],
      marquee: null,
      viewport: fitViewport(canvas.width, canvas.height, stageHost.clientWidth, stageHost.clientHeight),
    });
    statusEl.textContent = `Cropped to ${canvas.width} x ${canvas.height}`;
  }
  root.querySelector<HTMLButtonElement>('[data-action="apply-crop"]')!.addEventListener('click', applyCrop);
  root.querySelector<HTMLButtonElement>('[data-action="cancel-crop"]')!.addEventListener('click', () => { canvasHost.cancelGesture(); store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [], activeTool: 'select' }); });
  const cropRatioInput = root.querySelector<HTMLSelectElement>('[data-style="crop-ratio"]')!;
  let cropOrientationSwapped = false;
  const updateCropRatio = () => {
    const image = store.get().image;
    const values: Record<string, number> = { '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 };
    const ratio = cropRatioInput.value === 'original' ? image && image.width / image.height : values[cropRatioInput.value];
    canvasHost.setCropRatio(ratio ? cropOrientationSwapped ? 1 / ratio : ratio : undefined);
  };
  cropRatioInput.addEventListener('change', () => { cropOrientationSwapped = false; updateCropRatio(); });
  root.querySelector<HTMLButtonElement>('[data-action="swap-crop-ratio"]')!.addEventListener('click', () => { cropOrientationSwapped = !cropOrientationSwapped; updateCropRatio(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && document.activeElement === stageHost && store.get().activeTool === 'crop') { event.preventDefault(); applyCrop(); }
  });

  function transformedImage(transform: FrameTransform): LoadedImage | null {
    const image = store.get().image;
    if (!image) return null;
    const rotated = transform.startsWith('rotate');
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? image.height : image.width;
    canvas.height = rotated ? image.width : image.height;
    const ctx = canvas.getContext('2d')!;
    if (transform === 'rotate-right') { ctx.translate(image.height, 0); ctx.rotate(Math.PI / 2); }
    if (transform === 'rotate-left') { ctx.translate(0, image.width); ctx.rotate(-Math.PI / 2); }
    if (transform === 'flip-horizontal') { ctx.translate(image.width, 0); ctx.scale(-1, 1); }
    if (transform === 'flip-vertical') { ctx.translate(0, image.height); ctx.scale(1, -1); }
    ctx.drawImage(image.source, 0, 0, image.width, image.height);
    return imageFromCanvas(canvas);
  }

  const transformDialog = root.querySelector<HTMLDialogElement>('#transform-dialog')!;
  const resizeWidthInput = transformDialog.querySelector<HTMLInputElement>('[name="resizeWidth"]')!;
  const resizeHeightInput = transformDialog.querySelector<HTMLInputElement>('[name="resizeHeight"]')!;
  const lockAspectInput = transformDialog.querySelector<HTMLInputElement>('[name="lockAspect"]')!;
  let transformAspectRatio = 1;
  const resizeDimension = (value: number): number => Math.max(1, Math.min(16_384, Math.round(value)));
  const syncResizeDimension = (source: 'width' | 'height') => {
    if (!lockAspectInput.checked) return;
    if (source === 'width') {
      const nextWidth = Number(resizeWidthInput.value);
      if (Number.isFinite(nextWidth) && nextWidth > 0) resizeHeightInput.value = String(resizeDimension(nextWidth / transformAspectRatio));
    } else {
      const height = Number(resizeHeightInput.value);
      if (Number.isFinite(height) && height > 0) resizeWidthInput.value = String(resizeDimension(height * transformAspectRatio));
    }
  };
  resizeWidthInput.addEventListener('change', () => syncResizeDimension('width'));
  resizeHeightInput.addEventListener('change', () => syncResizeDimension('height'));
  lockAspectInput.addEventListener('change', () => syncResizeDimension('width'));
  root.querySelector<HTMLButtonElement>('[data-action="transform"]')!.addEventListener('click', (event) => {
    const image = store.get().image;
    if (!image) { statusEl.textContent = 'Load an image first'; return; }
    transformAspectRatio = image.width / image.height;
    resizeWidthInput.value = String(image.width);
    resizeHeightInput.value = String(image.height);
    transformDialog.returnValue = '';
    openDialog(transformDialog, event.currentTarget as HTMLElement);
  });
  transformDialog.addEventListener('close', () => {
    const action = transformDialog.returnValue;
    if (!['resize', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical'].includes(action) || !store.get().image) return;
    const scene = store.get();
    const image = scene.image!;
    canvasHost.cancelGesture();
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
    canvasHost.checkpointScene();
    if (action === 'resize') {
      const form = new FormData(transformDialog.querySelector('form')!);
      const resizeWidth = Math.max(1, Math.min(16_384, Math.round(Number(form.get('resizeWidth')))));
      const height = Math.max(1, Math.min(16_384, form.get('lockAspect') === 'on' ? Math.round(resizeWidth * image.height / image.width) : Math.round(Number(form.get('resizeHeight')))));
      if (resizeWidth * height > 134_000_000) { statusEl.textContent = 'Resize dimensions are too large'; return; }
      const canvas = document.createElement('canvas');
      canvas.width = resizeWidth; canvas.height = height;
      canvas.getContext('2d')!.drawImage(image.source, 0, 0, resizeWidth, height);
      store.set({ image: imageFromCanvas(canvas), objects: scene.objects.map((object) => scaleAnnotation(object, resizeWidth / image.width, height / image.height)), crop: null, marquee: null, selectedId: null, selectedIds: [], viewport: fitViewport(resizeWidth, height, stageHost.clientWidth, stageHost.clientHeight) });
      return;
    }
    const transform = action as FrameTransform;
    const nextImage = transformedImage(transform)!;
    store.set({ image: nextImage, objects: scene.objects.map((object) => transformAnnotation(object, transform, image.width, image.height)), crop: null, marquee: null, selectedId: null, selectedIds: [], viewport: fitViewport(nextImage.width, nextImage.height, stageHost.clientWidth, stageHost.clientHeight) });
  });
}
