import { createScene, type AnnotationStyle, type Scene, type Tool } from './core/types';
import { Store } from './state/store';
import { mountCanvasHost } from './ui/canvas-host';
import { renderShell } from './ui/shell';
import { mountOptionsView, queryOptionControls } from './ui/options-view';
import { mountOptionEvents } from './ui/options-events';
import { mountExportActions } from './ui/export-actions';
import { mountFrameControls } from './ui/frame-controls';
import { mountImageTransforms } from './ui/image-transforms';
import { createOpenDialog, mountMenus } from './ui/menus';
import { mountProjectIo } from './io/project';
import { icon } from './ui/icons';
import { LAYOUT_STORAGE_KEY, mountPanels, readPanelLayout } from './ui/panels';
import { setSelectionColor } from './render/renderer';
import { DEFAULT_PREFERENCES, mountPreferences, readPreferences, writePreferences } from './ui/preferences';
import { mountRulers } from './ui/rulers';
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
  const openDialog = createOpenDialog(syncNumericPairs);
  const rulers = mountRulers({ stageHost, store, getPreferences: () => preferences });
  const rulersButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-rulers"]')!;
  const syncRulersButton = () => {
    rulersButton.setAttribute('aria-pressed', String(preferences.showRulers));
    rulersButton.querySelector('span')!.textContent = preferences.showRulers ? 'On' : 'Off';
  };
  rulersButton.addEventListener('click', () => {
    preferences = { ...preferences, showRulers: !preferences.showRulers };
    writePreferences(preferences);
    syncRulersButton();
    rulers.refresh();
  });
  syncRulersButton();
  mountPreferences(root, store, statusEl, openDialog, (value) => { preferences = value; setSelectionColor(value.selectionColor); syncRulersButton(); rulers.refresh(); }, () => preferences);
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
    // A first visit carries over color; each tool starts with its own fill and outline defaults.
    const toolStyle = toolStyles.get(scene.activeTool) ?? (scene.activeTool === 'symbol'
      ? { ...previousStyle, width: 3, fill: null, stroke: true, opacity: 1 }
      : scene.activeTool === 'counter'
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
    // A new project is a clean start: history is cleared so Undo cannot bring back the previous image.
    canvasHost.setScene(createScene(), false);
    statusEl.textContent = 'New project';
  });
  root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.addEventListener('click', canvasHost.deleteSelected);
  root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.addEventListener('click', canvasHost.duplicateSelected);

  const { contextMenu, focusContextMenuInvoker } = mountMenus(root, stageHost, store, openDialog);

  const controls = queryOptionControls(root);
  const { fill, railFill, watermarkFont } = controls;
  const panels = mountPanels(root, stageHost, selectionDimensions, () => panelLayout);
  const { optionsbar, editorEl, compactPanels, setOptionsCollapsed, resetPanels } = panels;
  root.querySelector<HTMLButtonElement>('[data-action="reset-settings"]')!.addEventListener('click', () => {
    if (!window.confirm('Reset panel positions, colors, and editor preferences to app defaults? Your artwork will not be changed.')) return;
    preferences = { ...DEFAULT_PREFERENCES };
    setSelectionColor(preferences.selectionColor);
    syncRulersButton();
    rulers.refresh();
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
  const syncUi = mountOptionsView({ root, store, canvasHost, panels, controls, stageHost, toolButtons, toolList, zoomValue, overflowButton, canvasInstructions, selectionDimensions, selectionWidth, selectionHeight, selectionAspectButton, getPreferences: () => preferences, dimensionValue, formatMeasurement, syncNumericPairs, renderLayers });
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
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="send-back"]')!.addEventListener('click', () => { reorder(false); contextMenu.hidden = true; focusContextMenuInvoker(); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="bring-front"]')!.addEventListener('click', () => { reorder(true); contextMenu.hidden = true; focusContextMenuInvoker(); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="delete"]')!.addEventListener('click', () => { canvasHost.deleteSelected(); contextMenu.hidden = true; focusContextMenuInvoker(); });
  mountProjectIo({ root, store, canvasHost, statusEl, uploadedFontsReady, autosaveAvailable, autosaveUnavailable });

  const copyButton = mountExportActions(root, store, statusEl, overflowButton, openDialog);
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

  mountFrameControls(root, store, canvasHost, statusEl, openDialog, watermarkFont);

  const updateCropRatio = mountImageTransforms(root, store, canvasHost, statusEl, stageHost, openDialog);
}
