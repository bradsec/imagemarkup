import { createScene, type Annotation, type AnnotationStyle, type ArrowHead, type Scene, type SymbolName, type Tool } from './core/types';
import { Store } from './state/store';
import { mountCanvasHost } from './ui/canvas-host';
import { renderShell } from './ui/shell';
import { mountOptionsPreview } from './ui/options-preview';
import { downloadBlob, exportScene, type ExportFormat } from './render/export';
import { MAX_PROJECT_FILE_BYTES, MAX_PROJECT_IMAGE_DATA_LENGTH, parseScene, projectImageDataLength, serializeScene, type SerializedScene } from './core/serialize';
import { decodeImageDataUrl, decodeImageFile } from './io/load-image';
import { createAutosaveStorage, loadAutosave, startAutosave } from './state/autosave';
import { cropAnnotations, scaleAnnotation, transformAnnotation, type FrameTransform } from './core/transform';
import { fitViewport, zoomAt } from './core/viewport';
import type { LoadedImage } from './core/types';
import { loadUploadedFonts, saveUploadedFont } from './fonts/uploaded';
import { icon } from './ui/icons';
import { DEFAULT_SELECTION_COLOR, setSelectionColor } from './render/renderer';
import { annotationBounds, resizeAnnotationToBounds } from './core/annotations';
import { sceneSources } from './core/history';
import { MATERIAL_SYMBOLS } from './core/material-symbols';

type MeasurementUnit = 'px' | 'in' | 'cm' | 'mm';

interface EditorPreferences {
  measurementUnit: MeasurementUnit;
  measurementPpi: number;
  selectionColor: string;
}

const DEFAULT_PREFERENCES: EditorPreferences = { measurementUnit: 'px', measurementPpi: 96, selectionColor: DEFAULT_SELECTION_COLOR };
const LAYOUT_STORAGE_KEY = 'imagemarkup.panel-layout';

interface PanelPosition { left: number; top: number }
interface PanelLayout { tools: Record<string, PanelPosition>; layers?: PanelPosition }

function readPanelLayout(): PanelLayout {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}') as Partial<PanelLayout>;
    const valid = (position: unknown): position is PanelPosition => Boolean(position)
      && typeof (position as PanelPosition).left === 'number' && Number.isFinite((position as PanelPosition).left)
      && typeof (position as PanelPosition).top === 'number' && Number.isFinite((position as PanelPosition).top);
    return {
      tools: Object.fromEntries(Object.entries(value.tools ?? {}).filter((entry): entry is [string, PanelPosition] => valid(entry[1]))),
      layers: valid(value.layers) ? value.layers : undefined,
    };
  } catch {
    return { tools: {} };
  }
}

function readPreferences(): EditorPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('imagemarkup.preferences') ?? '{}') as Partial<EditorPreferences>;
    return {
      measurementUnit: ['px', 'in', 'cm', 'mm'].includes(String(value.measurementUnit)) ? value.measurementUnit as MeasurementUnit : 'px',
      measurementPpi: Number.isFinite(value.measurementPpi) ? Math.max(36, Math.min(1200, Math.round(value.measurementPpi!))) : 96,
      selectionColor: typeof value.selectionColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.selectionColor) ? value.selectionColor : DEFAULT_SELECTION_COLOR,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

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
  const toolHints: Partial<Record<Tool, string>> = {
    select: 'Click an object to select · Drag empty space for marquee selection',
    pan: 'Drag to pan · Scroll to zoom',
    rect: 'Drag to draw · Shift constrains · Alt/Option draws from center',
    ellipse: 'Drag to draw · Shift constrains · Alt/Option draws from center',
    line: 'Drag to draw · Shift constrains the angle',
    arrow: 'Drag to draw · Shift constrains the angle',
    pen: 'Drag to draw a freehand stroke',
    highlighter: 'Drag to highlight',
    text: 'Click to place or edit text',
    counter: 'Click to place the next step counter',
    redaction: 'Drag over the area to redact',
    crop: 'Drag over the area to keep',
    image: 'Choose an image to place',
    symbol: 'Click or drag to place and size the symbol',
  };
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
  const preferencesDialog = root.querySelector<HTMLDialogElement>('#preferences-dialog')!;
  const measurementUnitInput = preferencesDialog.querySelector<HTMLSelectElement>('[name="measurementUnit"]')!;
  const measurementPpiInput = preferencesDialog.querySelector<HTMLInputElement>('[name="measurementPpi"]')!;
  const measurementResolutionField = preferencesDialog.querySelector<HTMLElement>('[data-preference="measurement-resolution"]')!;
  const selectionColorInput = preferencesDialog.querySelector<HTMLInputElement>('[name="selectionColor"]')!;
  const syncPreferenceInputs = () => {
    const usesPhysicalUnits = measurementUnitInput.value !== 'px';
    measurementPpiInput.disabled = !usesPhysicalUnits;
    measurementResolutionField.hidden = !usesPhysicalUnits;
  };
  measurementUnitInput.addEventListener('change', syncPreferenceInputs);
  root.querySelector<HTMLButtonElement>('[data-action="preferences"]')!.addEventListener('click', (event) => {
    measurementUnitInput.value = preferences.measurementUnit;
    measurementPpiInput.value = String(preferences.measurementPpi);
    selectionColorInput.value = preferences.selectionColor;
    syncPreferenceInputs();
    openDialog(preferencesDialog, event.currentTarget as HTMLElement);
  });
  preferencesDialog.addEventListener('close', () => {
    if (preferencesDialog.returnValue !== 'apply') return;
    preferences = {
      measurementUnit: measurementUnitInput.value as MeasurementUnit,
      measurementPpi: Math.max(36, Math.min(1200, Math.round(Number(measurementPpiInput.value) || 96))),
      selectionColor: selectionColorInput.value,
    };
    setSelectionColor(preferences.selectionColor);
    try { localStorage.setItem('imagemarkup.preferences', JSON.stringify(preferences)); } catch { /* Preferences still apply for this session. */ }
    store.set({});
    statusEl.textContent = 'Preferences saved';
  });
  const defaultToolStyles = () => new Map<Tool, AnnotationStyle>([
    ['highlighter', { color: '#f4df57', width: 22, opacity: .5 }],
    ['pen', { color: '#ff3b30', width: 4, opacity: 1 }],
  ]);
  const toolStyles = defaultToolStyles();
  const fillColors = new Map<string, string>();
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

  const color = root.querySelector<HTMLInputElement>('[data-style="color"]')!;
  const strokeEnabled = root.querySelector<HTMLInputElement>('[data-style="stroke-enabled"]')!;
  const fillEnabled = root.querySelector<HTMLInputElement>('[data-style="fill-enabled"]')!;
  const strokeToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-stroke"]')!;
  const fillToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-fill"]')!;
  const fill = root.querySelector<HTMLInputElement>('[data-style="fill"]')!;
  const railColor = root.querySelector<HTMLInputElement>('[data-rail-color="color"]')!;
  const railFill = root.querySelector<HTMLInputElement>('[data-rail-color="fill"]')!;
  const width = root.querySelector<HTMLInputElement>('[data-style="width"]')!;
  const opacity = root.querySelector<HTMLInputElement>('[data-style="opacity"]')!;
  const lineCap = root.querySelector<HTMLSelectElement>('[data-style="line-cap"]')!;
  const lineJoin = root.querySelector<HTMLSelectElement>('[data-style="line-join"]')!;
  const arrowStart = root.querySelector<HTMLSelectElement>('[data-style="arrow-start"]')!;
  const arrowEnd = root.querySelector<HTMLSelectElement>('[data-style="arrow-end"]')!;
  const symbol = root.querySelector<HTMLSelectElement>('[data-style="symbol"]')!;
  const symbolPoints = root.querySelector<HTMLInputElement>('[data-style="symbol-points"]')!;
  const symbolInnerRatio = root.querySelector<HTMLInputElement>('[data-style="symbol-inner-ratio"]')!;
  const symbolSides = root.querySelector<HTMLInputElement>('[data-style="symbol-sides"]')!;
  const font = root.querySelector<HTMLSelectElement>('[data-style="font"]')!;
  const watermarkFont = root.querySelector<HTMLSelectElement>('[name="watermarkFont"]')!;
  const fontSize = root.querySelector<HTMLInputElement>('[data-style="font-size"]')!;
  const letterSpacing = root.querySelector<HTMLInputElement>('[data-style="letter-spacing"]')!;
  const lineHeight = root.querySelector<HTMLInputElement>('[data-style="line-height"]')!;
  const fontSizePreset = root.querySelector<HTMLSelectElement>('[data-style="font-size-preset"]')!;
  const fontWeight = root.querySelector<HTMLSelectElement>('[data-style="font-weight"]')!;
  const fontStyle = root.querySelector<HTMLSelectElement>('[data-style="font-style"]')!;
  const textUnderline = root.querySelector<HTMLInputElement>('[data-style="text-underline"]')!;
  const boldButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-bold"]')!;
  const italicButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-italic"]')!;
  const underlineButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-underline"]')!;
  const textAlign = root.querySelector<HTMLSelectElement>('[data-style="text-align"]')!;
  const redactionMode = root.querySelector<HTMLSelectElement>('[data-style="redaction-mode"]')!;
  const redactionStrength = root.querySelector<HTMLInputElement>('[data-style="redaction-strength"]')!;
  const counterShape = root.querySelector<HTMLSelectElement>('[data-style="counter-shape"]')!;
  const counterFormat = root.querySelector<HTMLSelectElement>('[data-style="counter-format"]')!;
  const counterValue = root.querySelector<HTMLInputElement>('[data-style="counter-value"]')!;
  const counterValueLabel = root.querySelector<HTMLElement>('[data-counter-selected-value]')!;
  const counterNext = root.querySelector<HTMLInputElement>('[data-style="counter-next"]')!;
  const counterSize = root.querySelector<HTMLInputElement>('[data-style="counter-size"]')!;
  const counterFontSize = root.querySelector<HTMLInputElement>('[data-style="counter-font-size"]')!;
  const counterFont = root.querySelector<HTMLSelectElement>('[data-style="counter-font"]')!;
  const counterTextColor = root.querySelector<HTMLInputElement>('[data-style="counter-text-color"]')!;
  const optionsbar = root.querySelector<HTMLElement>('.optionsbar')!;
  const dimensionsDesktopParent = selectionDimensions.parentElement!;
  const mobileOptions = window.matchMedia('(max-width: 760px)');
  // Phones in either orientation; keep in step with the matching media query in style.css.
  const compactPanels = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 500px)');
  // Crossing the breakpoint hides the old container by CSS, which can blur the field before the
  // change listener runs; remember it so focus survives an orientation change.
  let lastDimensionFocus: HTMLElement | null = null;
  selectionDimensions.addEventListener('focusin', (event) => { lastDimensionFocus = event.target as HTMLElement; });
  selectionDimensions.addEventListener('focusout', (event) => { if (event.relatedTarget) lastDimensionFocus = null; });
  const positionSelectionDimensions = () => {
    const active = document.activeElement;
    const focused = selectionDimensions.contains(active) ? active as HTMLElement : active === document.body ? lastDimensionFocus : null;
    if (mobileOptions.matches) optionsbar.querySelector('.options-heading')!.after(selectionDimensions);
    else dimensionsDesktopParent.prepend(selectionDimensions);
    focused?.focus({ preventScroll: true });
  };
  mobileOptions.addEventListener?.('change', positionSelectionDimensions);
  positionSelectionDimensions();
  const previewTile = optionsbar.querySelector<HTMLElement>('.tool-options-preview')!;
  const requestOptionsPreview = mountOptionsPreview(previewTile, previewTile.querySelector('canvas')!, () => store.get(), () => {
    const scene = store.get();
    return scene.objects.find((object) => object.id === scene.selectedId);
  });
  const applyCropButton = root.querySelector<HTMLButtonElement>('[data-action="apply-crop"]')!;
  const layersPanel = root.querySelector<HTMLElement>('.layers-panel')!;
  const layersList = root.querySelector<HTMLElement>('[data-layers-list]')!;
  const editorEl = root.querySelector<HTMLElement>('.editor')!;
  const optionsDragHandle = root.querySelector<HTMLElement>('[data-options-drag-handle]')!;
  const layersDragHandle = root.querySelector<HTMLElement>('[data-layers-drag-handle]')!;
  let optionsPanelContext = '';
  const savePanelLayout = () => {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout)); } catch { /* Positions still apply for this session. */ }
  };
  const setPanelPosition = (panel: HTMLElement, position?: PanelPosition) => {
    if (!position) {
      delete panel.dataset.moved;
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
      panel.style.removeProperty('right');
      panel.style.removeProperty('bottom');
      return;
    }
    panel.dataset.moved = 'true';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
  };
  function clampFloatingPanel(panel: HTMLElement, left = panel.offsetLeft, top = panel.offsetTop): void {
    if (getComputedStyle(panel).position !== 'absolute') return;
    const inset = 8;
    panel.style.right = 'auto';
    panel.style.left = `${Math.max(inset, Math.min(left, Math.max(inset, editorEl.clientWidth - panel.offsetWidth - inset)))}px`;
    panel.style.top = `${Math.max(inset, Math.min(top, Math.max(inset, editorEl.clientHeight - panel.offsetHeight - inset)))}px`;
  }
  function makePanelDraggable(panel: HTMLElement, handle: HTMLElement, onStop: () => void): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      if (getComputedStyle(panel).position !== 'absolute') return;
      event.preventDefault();
      panel.dataset.moved = 'true';
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      const move = (moveEvent: PointerEvent) => clampFloatingPanel(panel, start.left + moveEvent.clientX - start.x, start.top + moveEvent.clientY - start.y);
      const stop = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', stop);
        onStop();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    });
  }
  makePanelDraggable(optionsbar, optionsDragHandle, () => {
    panelLayout.tools[optionsPanelContext] = { left: optionsbar.offsetLeft, top: optionsbar.offsetTop };
    savePanelLayout();
  });
  makePanelDraggable(layersPanel, layersDragHandle, () => {
    panelLayout.layers = { left: layersPanel.offsetLeft, top: layersPanel.offsetTop };
    savePanelLayout();
  });
  setPanelPosition(layersPanel, panelLayout.layers);
  const layersToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-layers-panel"]')!;
  const optionsToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-options-panel"]')!;
  // A hidden panel reports offsetLeft 0, so clamping it would overwrite its saved position.
  const clampMovedPanels = () => {
    if (!optionsbar.hidden && optionsbar.dataset.moved === 'true') clampFloatingPanel(optionsbar);
    if (!layersPanel.hidden && layersPanel.dataset.moved === 'true') clampFloatingPanel(layersPanel);
  };
  const setOptionsCollapsed = (collapsed: boolean) => {
    optionsbar.dataset.collapsed = String(collapsed);
    optionsToggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Expand Tool options panel' : 'Collapse Tool options panel';
    optionsToggle.setAttribute('aria-label', label);
    optionsToggle.title = label;
    optionsToggle.innerHTML = icon(collapsed ? 'chevron-down' : 'chevron-up', 15);
    if (!collapsed && compactPanels.matches) setLayersCollapsed(true);
    queueMicrotask(clampMovedPanels);
  };
  const setLayersCollapsed = (collapsed: boolean) => {
    layersPanel.dataset.collapsed = String(collapsed);
    layersToggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Expand Layers panel' : 'Collapse Layers panel';
    layersToggle.setAttribute('aria-label', label);
    layersToggle.title = label;
    layersToggle.innerHTML = icon(collapsed ? 'chevron-down' : 'chevron-up', 15);
    if (!collapsed && compactPanels.matches) setOptionsCollapsed(true);
    queueMicrotask(clampMovedPanels);
  };
  setLayersCollapsed(matchMedia('(max-width: 760px), (pointer: coarse)').matches);
  setOptionsCollapsed(false);
  optionsToggle.addEventListener('click', () => setOptionsCollapsed(optionsbar.dataset.collapsed !== 'true'));
  // The panels sit beside the stage, so this only fires for touches on uncovered canvas.
  stageHost.addEventListener('pointerdown', () => {
    if (compactPanels.matches && optionsbar.dataset.collapsed !== 'true') setOptionsCollapsed(true);
  });
  layersToggle.addEventListener('click', () => setLayersCollapsed(layersPanel.dataset.collapsed !== 'true'));
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
    setPanelPosition(optionsbar);
    setPanelPosition(layersPanel);
    optionsPanelContext = '';
    setLayersCollapsed(matchMedia('(max-width: 760px), (pointer: coarse)').matches);
    setOptionsCollapsed(false);
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
  window.addEventListener('resize', clampMovedPanels);
  const optionMap: Record<string, string[]> = {
    select: [], rect: ['color', 'stroke-toggle', 'fill', 'width', 'opacity', 'line-join'], ellipse: ['color', 'stroke-toggle', 'fill', 'width', 'opacity'],
    line: ['color', 'width', 'opacity', 'line-cap'], arrow: ['color', 'width', 'opacity', 'line-cap', 'arrowheads'], pen: ['color', 'width', 'opacity', 'line-cap'],
    highlighter: ['color', 'width', 'opacity', 'line-cap'], text: ['color', 'opacity', 'text'], counter: ['color', 'opacity', 'counter'],
    redaction: ['redaction'], crop: ['crop'], image: ['opacity'], symbol: ['color', 'stroke-toggle', 'fill', 'width', 'opacity', 'symbol'],
  };
  const selectedLayerIds = (scene: Scene): string[] => (scene.selectedIds ?? []).length ? scene.selectedIds : (scene.selectedId ? [scene.selectedId] : []);
  function layerName(object: Annotation): string {
    if (object.layerName?.trim()) return object.layerName.trim();
    if (object.type === 'text') return object.text.trim().split('\n')[0]?.slice(0, 36) || 'Text';
    if (object.type === 'counter') return `Step ${object.n}`;
    if (object.type === 'symbol') return `${object.name.replace('-', ' ')} symbol`;
    if (object.type === 'image') return 'Placed image';
    if (object.type === 'highlighter') return 'Highlight';
    return `${object.type[0].toUpperCase()}${object.type.slice(1)}`;
  }
  function renderLayers(scene: Scene): void {
    const selected = new Set(selectedLayerIds(scene));
    const focused = document.activeElement instanceof HTMLElement && layersList.contains(document.activeElement) ? document.activeElement : null;
    const focusedRow = focused?.closest<HTMLElement>('[data-layer-id]');
    const focusedIndex = focusedRow ? [...layersList.children].indexOf(focusedRow) : -1;
    const focusedId = focusedRow?.dataset.layerId;
    const focusedAction = focused?.dataset.action;
    layersList.replaceChildren(...[...scene.objects].reverse().map((object) => {
      const row = document.createElement('div');
      const name = layerName(object);
      row.className = 'layer-row';
      row.dataset.layerId = object.id;
      row.dataset.layerType = object.type;
      row.setAttribute('role', 'listitem');
      row.dataset.selected = String(selected.has(object.id));
      row.dataset.hidden = String(Boolean(object.hidden));
      row.draggable = !object.locked;
      const visibility = document.createElement('button');
      visibility.type = 'button'; visibility.className = 'layer-visibility'; visibility.dataset.action = 'toggle-layer-visibility'; visibility.setAttribute('aria-pressed', String(!object.hidden)); visibility.setAttribute('aria-label', `${object.hidden ? 'Show' : 'Hide'} ${name}`); visibility.title = object.hidden ? 'Show layer' : 'Hide layer';
      visibility.innerHTML = icon(object.hidden ? 'eye-off' : 'eye', 18);
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'layer-select'; select.dataset.action = 'select-layer'; select.setAttribute('aria-label', `Select ${name}`); select.setAttribute('aria-pressed', String(selected.has(object.id)));
      const kind = document.createElement('span'); kind.className = 'layer-kind'; kind.setAttribute('aria-hidden', 'true'); kind.innerHTML = icon(object.type, 16);
      const label = document.createElement('span'); label.className = 'layer-name'; label.textContent = name;
      select.append(kind, label);
      const lock = document.createElement('button');
      lock.type = 'button'; lock.className = 'layer-lock'; lock.dataset.action = 'toggle-layer-lock'; lock.setAttribute('aria-pressed', String(Boolean(object.locked))); lock.setAttribute('aria-label', `${object.locked ? 'Unlock' : 'Lock'} ${name}`); lock.title = object.locked ? 'Unlock layer' : 'Lock layer';
      lock.innerHTML = icon(object.locked ? 'lock' : 'lock-open', 18);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'layer-delete'; remove.dataset.action = 'delete-layer'; remove.setAttribute('aria-label', `Delete ${name}`); remove.title = object.locked ? 'Unlock layer before deleting' : 'Delete layer'; remove.disabled = Boolean(object.locked); remove.textContent = '×';
      row.append(visibility, lock, select, remove);
      return row;
    }));
    if (focused) {
      const row = [...layersList.querySelectorAll<HTMLElement>('[data-layer-id]')].find((item) => item.dataset.layerId === focusedId)
        ?? layersList.children[Math.min(focusedIndex, layersList.children.length - 1)] as HTMLElement | undefined;
      const target = row?.querySelector<HTMLButtonElement>(`[data-action="${focusedAction}"]`)
        ?? row?.querySelector<HTMLButtonElement>('[data-action="select-layer"]');
      if (target) target.focus({ preventScroll: true });
      else { layersList.tabIndex = -1; layersList.focus({ preventScroll: true }); }
    }
  }
  function syncUi(): void {
    const scene = store.get();
    requestOptionsPreview();
    const multiSymbols = scene.selectedIds.length > 1 && scene.selectedIds.every((id) => scene.objects.some((object) => object.id === id && object.type === 'symbol' && !object.locked));
    const selected = scene.objects.find((object) => object.id === (multiSymbols ? scene.selectedIds[0] : scene.selectedId));
    const style = selected?.style ?? scene.toolStyle;
    const context = selected?.locked ? 'select' : selected?.type ?? scene.activeTool;
    const visible = new Set(optionMap[context] ?? []);
    const solidRedaction = context === 'redaction' && (selected?.type === 'redaction' ? selected.mode : scene.redactionMode) === 'solid';
    if (solidRedaction) visible.add('fill');
    root.querySelector<HTMLElement>('[data-options="fill"] .paint-toggle-wrap')!.hidden = solidRedaction;
    if (multiSymbols) visible.delete('symbol');
    const supportsStrokeToggle = visible.has('stroke-toggle');
    const implicitSymbolFill = selected?.type === 'symbol' && selected.paint !== 'separate'
      && !((selected.name === 'star' && (selected.points !== undefined || selected.innerRatio !== undefined)) || (selected.name === 'hexagon' && selected.sides !== undefined))
      && Boolean(MATERIAL_SYMBOLS[selected.name]);
    const layerSelection = selectedLayerIds(scene);
    if (selected && !selected.locked && !multiSymbols) visible.add('arrange');
    for (const element of root.querySelectorAll<HTMLElement>('[data-options]')) {
      const groups = element.dataset.options!.split(' ');
      element.hidden = !groups.some((group) => visible.has(group) || (group === 'select' && context === 'select'));
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-symbol-param]')) element.hidden = !visible.has('symbol') || element.dataset.symbolParam !== (selected?.type === 'symbol' ? selected.name : scene.symbolName);
    applyCropButton.hidden = context !== 'crop' || !scene.crop || scene.crop.w < 1 || scene.crop.h < 1;
    const activeButton = toolButtons.find((button) => button.dataset.tool === scene.activeTool);
    const multi = layerSelection.length > 1;
    const showSelectionDimensions = Boolean(selected) && !multi;
    selectionDimensions.hidden = !showSelectionDimensions;
    if (selected) {
      const bounds = annotationBounds(selected);
      if (document.activeElement !== selectionWidth) selectionWidth.value = dimensionValue(bounds.w);
      if (document.activeElement !== selectionHeight) selectionHeight.value = dimensionValue(bounds.h);
      const step = preferences.measurementUnit === 'px' ? '1' : '0.01';
      selectionWidth.step = step;
      selectionHeight.step = step;
      selectionWidth.disabled = Boolean(selected.locked);
      selectionHeight.disabled = Boolean(selected.locked);
      selectionAspectButton.disabled = Boolean(selected.locked);
      for (const unit of selectionDimensions.querySelectorAll<HTMLElement>('[data-selection-unit]')) unit.textContent = preferences.measurementUnit;
    }
    canvasInstructions.textContent = !scene.image
      ? ''
      : multi
        ? 'Drag to move the selection · Ctrl+D duplicates · Delete removes'
        : selected?.locked
          ? 'Unlock this object in Layers to edit it'
          : selected
            ? 'Drag to move · Ctrl+D duplicates · Delete removes'
            : toolHints[scene.activeTool] ?? '';
    root.querySelector<HTMLElement>('#active-tool-name')!.textContent = multi ? `${scene.selectedIds.length} selected` : selected ? `${selected.type[0].toUpperCase()}${selected.type.slice(1)} ${selected.locked ? 'locked' : 'selected'}` : (activeButton?.title?.replace(/ \(.+\)$/, '') ?? scene.activeTool);
    const selectHint = root.querySelector<HTMLElement>('[data-options="select"]')!;
    selectHint.textContent = selected?.locked ? 'Unlock this item in Layers to edit it' : 'Select an object to edit its properties';
    // Show the options as a panel anchored to the active tool on the left rail,
    // and hide it for tools and states that have nothing to configure.
    const hasOptions = Boolean(scene.image) && ((optionMap[context]?.length ?? 0) > 0 || Boolean(selected) || multi);
    optionsbar.hidden = !hasOptions;
    layersPanel.hidden = !scene.image;
    if (optionsPanelContext !== context) {
      optionsPanelContext = context;
      setPanelPosition(optionsbar, panelLayout.tools[context]);
      optionsbar.scrollLeft = 0;
      optionsbar.scrollTop = 0;
    }
    if (hasOptions && activeButton && !mobileOptions.matches && getComputedStyle(optionsbar).position === 'absolute' && optionsbar.dataset.moved !== 'true') {
      const button = activeButton.getBoundingClientRect();
      const editorBox = editorEl.getBoundingClientRect();
      optionsbar.style.top = `${Math.max(8, Math.min(button.top - editorBox.top, editorBox.height - optionsbar.offsetHeight - 8))}px`;
      optionsbar.style.left = '8px';
    }
    if (hasOptions || !layersPanel.hidden) queueMicrotask(clampMovedPanels);
    stageHost.dataset.activeTool = scene.activeTool;
    const hasImage = Boolean(scene.image);
    for (const button of toolButtons) { button.setAttribute('aria-pressed', String(button.dataset.tool === scene.activeTool)); button.disabled = !hasImage; }
    // Disabled tools cannot take focus, so the scrollable list must, or keyboard users cannot scroll it.
    if (hasImage) toolList.removeAttribute('tabindex'); else toolList.tabIndex = 0;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-action="fit"], [data-action="actual-size"], [data-action="zoom-in"], [data-action="zoom-out"], [data-action="toggle-overflow"], [data-action="swap-colors"], [data-action="default-colors"]')) control.disabled = !hasImage;
    for (const control of root.querySelectorAll<HTMLInputElement>('[data-rail-color]')) control.disabled = !hasImage;
    zoomValue.value = `${Math.round(scene.viewport.scale * 100)}%`;
    overflowButton.setAttribute('aria-pressed', String(scene.showOverflow));
    overflowButton.querySelector('span')!.textContent = scene.showOverflow ? 'On' : 'Off';
    const hasDeletableSelection = layerSelection.some((id) => !scene.objects.find((object) => object.id === id)?.locked);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="delete"], [data-action="delete-selected-layers"]')) button.disabled = !hasDeletableSelection;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="duplicate"]')) button.disabled = layerSelection.length === 0;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="send-back"], [data-action="bring-front"], [data-action="send-backward"], [data-action="bring-forward"]')) button.disabled = !selected || Boolean(selected.locked);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="undo"]')) button.disabled = !canvasHost.canUndo();
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="redo"]')) button.disabled = !canvasHost.canRedo();
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="copy"], [data-action="export"], [data-action="frame"], [data-action="transform"], [data-action="save-project"]')) button.disabled = !scene.image;
    renderLayers(scene);
    const active = document.activeElement;
    if (!active || !([color, strokeEnabled, fillEnabled, fill, railColor, railFill, width, opacity, lineCap, lineJoin, arrowStart, arrowEnd, symbol, symbolPoints, symbolInnerRatio, symbolSides, font, fontSize, fontSizePreset, letterSpacing, lineHeight, fontWeight, fontStyle, textUnderline, textAlign, redactionMode, redactionStrength, counterShape, counterFormat, counterValue, counterNext, counterSize, counterFontSize, counterFont, counterTextColor] as Element[]).includes(active)) {
      color.value = style.color;
      railColor.value = style.color;
      strokeEnabled.checked = context === 'symbol' && implicitSymbolFill ? false : !supportsStrokeToggle || style.stroke !== false;
      fillEnabled.checked = solidRedaction || Boolean(style.fill) || (context === 'symbol' && implicitSymbolFill);
      if (solidRedaction || style.fill || (context === 'symbol' && implicitSymbolFill)) {
        fill.value = solidRedaction ? style.fill ?? '#000000' : implicitSymbolFill ? style.color : style.fill!;
        fillColors.set(context, fill.value);
      } else if (fillColors.has(context)) {
        // Fill is off: show this tool's last fill color so turning fill back on restores it.
        fill.value = fillColors.get(context)!;
      }
      railFill.value = fill.value;
      fill.disabled = !fillEnabled.checked;
      color.disabled = supportsStrokeToggle && !strokeEnabled.checked;
      root.querySelector<HTMLButtonElement>('[data-color-target="color"]')!.disabled = supportsStrokeToggle && !strokeEnabled.checked;
      root.querySelector<HTMLButtonElement>('[data-color-target="fill"]')!.disabled = !fillEnabled.checked;
      width.value = String(style.width);
      opacity.value = String(Math.round(style.opacity * 100));
      lineCap.value = style.lineCap ?? 'round';
      lineJoin.value = style.lineJoin ?? 'round';
      if (context === 'arrow') {
        arrowStart.value = selected?.type === 'arrow' ? selected.startHead ?? 'none' : scene.arrowStartHead;
        arrowEnd.value = selected?.type === 'arrow' ? selected.endHead ?? 'open' : scene.arrowEndHead;
      }
      root.querySelector<HTMLOutputElement>('[data-value="width"]')!.value = formatMeasurement(Number(width.value));
      root.querySelector<HTMLOutputElement>('[data-value="opacity"]')!.value = `${opacity.value}%`;
      const colorLabel = root.querySelector<HTMLElement>('[data-style-label="color"]')!;
      colorLabel.textContent = context === 'counter' ? 'Shape color' : supportsStrokeToggle || context === 'text' ? 'Color' : 'Stroke';
      symbol.value = selected?.type === 'symbol' ? selected.name : scene.symbolName;
      symbolPoints.value = String(selected?.type === 'symbol' ? selected.points ?? 5 : scene.symbolPoints);
      symbolInnerRatio.value = String(selected?.type === 'symbol' ? selected.innerRatio ?? 0.43 : scene.symbolInnerRatio);
      symbolSides.value = String(selected?.type === 'symbol' ? selected.sides ?? 6 : scene.symbolSides);
      if (context === 'text') {
        font.value = selected?.type === 'text' ? selected.fontFamily : scene.fontFamily;
        fontSize.value = String(Math.ceil(selected?.type === 'text' ? selected.fontSize : scene.fontSize));
        letterSpacing.value = String(selected?.type === 'text' ? selected.letterSpacing ?? 0 : scene.letterSpacing);
        lineHeight.value = String(selected?.type === 'text' ? selected.lineHeight ?? 1.2 : scene.lineHeight);
        fontSizePreset.value = [...fontSizePreset.options].some((option) => option.value === fontSize.value) ? fontSize.value : '';
        fontWeight.value = selected?.type === 'text' ? selected.fontWeight : scene.fontWeight;
        fontStyle.value = selected?.type === 'text' ? selected.fontStyle ?? 'normal' : scene.fontStyle;
        textUnderline.checked = selected?.type === 'text' ? selected.underline ?? false : scene.textUnderline;
        textAlign.value = selected?.type === 'text' ? selected.align : scene.textAlign;
      }
      if (selected?.type === 'redaction') { redactionMode.value = selected.mode; redactionStrength.value = String(selected.strength); }
      const counterSelected = selected?.type === 'counter' ? selected : null;
      const cSize = counterSelected ? counterSelected.radius : scene.counterSize;
      counterValueLabel.hidden = !counterSelected;
      counterValue.value = String(counterSelected?.n ?? 1);
      counterShape.value = counterSelected?.shape ?? scene.counterShape;
      counterFormat.value = counterSelected?.format ?? scene.counterFormat;
      counterNext.value = String(scene.counterNext);
      counterSize.value = String(cSize);
      counterFontSize.value = String(counterSelected?.fontSize ?? scene.counterFontSize);
      counterFont.value = counterSelected?.fontFamily ?? scene.counterFontFamily;
      counterTextColor.value = counterSelected?.textColor ?? (counterSelected && !(counterSelected.filled ?? true) ? counterSelected.style.color : scene.counterTextColor);
      root.querySelector<HTMLOutputElement>('[data-value="counter-size"]')!.value = formatMeasurement(cSize);
      root.querySelector<HTMLOutputElement>('[data-value="counter-font-size"]')!.value = formatMeasurement(Number(counterFontSize.value));
    }
    if (solidRedaction) {
      fillEnabled.checked = true;
      fill.value = style.fill ?? '#000000';
      fill.disabled = false;
      root.querySelector<HTMLButtonElement>('[data-color-target="fill"]')!.disabled = false;
    }
    opacity.value = String(Math.round(style.opacity * 100));
    root.querySelector<HTMLOutputElement>('[data-value="opacity"]')!.value = `${opacity.value}%`;
    syncNumericPairs();
    strokeToggle.setAttribute('aria-pressed', String(strokeEnabled.checked));
    fillToggle.setAttribute('aria-pressed', String(fillEnabled.checked));
    boldButton.setAttribute('aria-pressed', String(fontWeight.value === 'bold'));
    italicButton.setAttribute('aria-pressed', String(fontStyle.value === 'italic'));
    underlineButton.setAttribute('aria-pressed', String(textUnderline.checked));
    for (const group of root.querySelectorAll<HTMLElement>('[data-choice-for]')) {
      const select = root.querySelector<HTMLSelectElement>(`[data-style="${group.dataset.choiceFor}"]`);
      if (!select) continue;
      for (const button of group.querySelectorAll<HTMLButtonElement>('[data-value]')) button.setAttribute('aria-pressed', String(button.dataset.value === select.value));
    }
    for (const group of root.querySelectorAll<HTMLElement>('[data-color-presets]')) {
      const value = group.dataset.colorPresets === 'fill'
        ? fill.value
        : group.dataset.colorPresets === 'counter-text-color' ? counterTextColor.value : color.value;
      for (const button of group.querySelectorAll<HTMLButtonElement>('[data-color]')) button.setAttribute('aria-pressed', String(button.dataset.color === value));
    }
  }
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
  const applyLayerSelection = (ids: string[]) => store.set(ids.length === 1
    ? { selectedId: ids[0], selectedIds: [], marquee: null }
    : { selectedId: null, selectedIds: ids, marquee: null });
  let layerSelectionAnchorId: string | null = null;
  layersList.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action]') : null;
    const row = button?.closest<HTMLElement>('[data-layer-id]');
    if (!button || !row) return;
    const id = row.dataset.layerId!;
    const scene = store.get();
    if (button.dataset.action === 'select-layer') {
      if (event.shiftKey) {
        const visualOrder = [...scene.objects].reverse().map((object) => object.id);
        const current = selectedLayerIds(scene);
        const anchor = layerSelectionAnchorId && visualOrder.includes(layerSelectionAnchorId) && current.includes(layerSelectionAnchorId)
          ? layerSelectionAnchorId
          : current[current.length - 1] ?? id;
        const start = visualOrder.indexOf(anchor);
        const end = visualOrder.indexOf(id);
        applyLayerSelection(visualOrder.slice(Math.min(start, end), Math.max(start, end) + 1));
      } else if (event.metaKey || event.ctrlKey) {
        const current = selectedLayerIds(scene);
        applyLayerSelection(current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
      } else {
        applyLayerSelection([id]);
      }
      if (!event.shiftKey) layerSelectionAnchorId = id;
      return;
    }
    if (button.dataset.action === 'toggle-layer-lock') {
      canvasHost.checkpointScene();
      store.set({ objects: scene.objects.map((object) => object.id === id ? { ...object, locked: !object.locked } : object) });
      return;
    }
    if (button.dataset.action === 'toggle-layer-visibility') {
      canvasHost.checkpointScene();
      const object = scene.objects.find((item) => item.id === id);
      if (!object) return;
      const remainingSelection = object.hidden
        ? selectedLayerIds(scene)
        : selectedLayerIds(scene).filter((selectedId) => selectedId !== id);
      store.set({
        objects: scene.objects.map((item) => item.id === id ? { ...item, hidden: !item.hidden } : item),
        selectedId: remainingSelection.length === 1 ? remainingSelection[0] : null,
        selectedIds: remainingSelection.length > 1 ? remainingSelection : [],
      });
      return;
    }
    if (button.dataset.action === 'delete-layer') {
      const object = scene.objects.find((item) => item.id === id);
      if (!object || object.locked) return;
      canvasHost.checkpointScene();
      const remainingSelection = selectedLayerIds(scene).filter((selectedId) => selectedId !== id);
      store.set({
        objects: scene.objects.filter((item) => item.id !== id),
        selectedId: remainingSelection.length === 1 ? remainingSelection[0] : null,
        selectedIds: remainingSelection.length > 1 ? remainingSelection : [],
      });
    }
  });
  layersList.addEventListener('keydown', (event) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null;
    if (!row) return;
    event.preventDefault();
    reorderOne(row.dataset.layerId!, event.key === 'ArrowUp' ? 1 : -1);
  });
  const layerContextMenu = root.querySelector<HTMLElement>('#layer-context-menu')!;
  let layerContextId: string | null = null;
  let layerContextInvoker: HTMLElement | null = null;
  layersList.addEventListener('contextmenu', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null;
    if (!row) return;
    event.preventDefault();
    layerContextId = row.dataset.layerId!;
    layerContextInvoker = document.activeElement instanceof HTMLElement && row.contains(document.activeElement)
      ? document.activeElement
      : row.querySelector<HTMLButtonElement>('[data-action="select-layer"]');
    layerSelectionAnchorId = layerContextId;
    applyLayerSelection([layerContextId]);
    const object = store.get().objects.find((item) => item.id === layerContextId);
    layerContextMenu.querySelector<HTMLButtonElement>('[data-layer-context-action="delete"]')!.disabled = Boolean(object?.locked);
    const editorBounds = editorEl.getBoundingClientRect();
    layerContextMenu.hidden = false;
    layerContextMenu.style.left = `${Math.max(6, Math.min(event.clientX - editorBounds.left, editorBounds.width - layerContextMenu.offsetWidth - 6))}px`;
    layerContextMenu.style.top = `${Math.max(6, Math.min(event.clientY - editorBounds.top, window.innerHeight - editorBounds.top - layerContextMenu.offsetHeight - 6))}px`;
    layerContextMenu.querySelector<HTMLButtonElement>('button')?.focus();
  });
  const beginLayerRename = (id: string) => {
    const object = store.get().objects.find((item) => item.id === id);
    const row = [...layersList.querySelectorAll<HTMLElement>('[data-layer-id]')].find((item) => item.dataset.layerId === id);
    const label = row?.querySelector<HTMLElement>('.layer-name');
    if (!object || !label) return;
    const input = document.createElement('input');
    input.className = 'layer-name-input';
    input.maxLength = 80;
    input.value = layerName(object);
    label.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (save && name !== layerName(object)) {
        canvasHost.checkpointScene();
        store.set({ objects: store.get().objects.map((item) => item.id === id ? { ...item, layerName: name || undefined } : item) });
      } else {
        renderLayers(store.get());
      }
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
  };
  layerContextMenu.querySelector<HTMLButtonElement>('[data-layer-context-action="rename"]')!.addEventListener('click', () => {
    layerContextMenu.hidden = true;
    if (layerContextId) beginLayerRename(layerContextId);
  });
  layerContextMenu.querySelector<HTMLButtonElement>('[data-layer-context-action="duplicate"]')!.addEventListener('click', () => {
    layerContextMenu.hidden = true;
    canvasHost.duplicateSelected();
  });
  for (const [action, direction] of [['bring-forward', 1], ['send-backward', -1]] as const) {
    layerContextMenu.querySelector<HTMLButtonElement>(`[data-layer-context-action="${action}"]`)!.addEventListener('click', () => {
      layerContextMenu.hidden = true;
      if (layerContextId) reorderOne(layerContextId, direction);
      [...layersList.querySelectorAll<HTMLElement>('[data-layer-id]')].find((row) => row.dataset.layerId === layerContextId)
        ?.querySelector<HTMLButtonElement>('[data-action="select-layer"]')?.focus({ preventScroll: true });
    });
  }
  layerContextMenu.querySelector<HTMLButtonElement>('[data-layer-context-action="delete"]')!.addEventListener('click', () => {
    layerContextMenu.hidden = true;
    canvasHost.deleteSelected();
  });
  window.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('#layer-context-menu')) layerContextMenu.hidden = true;
  }, { capture: true });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.target instanceof HTMLInputElement || layerContextMenu.hidden) return;
    layerContextMenu.hidden = true;
    layerContextInvoker?.focus({ preventScroll: true });
  });
  layerContextMenu.addEventListener('keydown', (event) => {
    if (event.key !== 'Home' && event.key !== 'End' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    layerContextMenu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  });
  root.querySelector<HTMLButtonElement>('[data-action="delete-selected-layers"]')!.addEventListener('click', canvasHost.deleteSelected);
  let draggedLayerId: string | null = null;
  const clearLayerDropMarkers = () => {
    for (const row of layersList.querySelectorAll<HTMLElement>('[data-drop-position]')) delete row.dataset.dropPosition;
  };
  layersList.addEventListener('dragstart', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null;
    if (!row?.draggable) { event.preventDefault(); return; }
    draggedLayerId = row.dataset.layerId!;
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedLayerId); }
  });
  layersList.addEventListener('dragover', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null;
    if (!row || !draggedLayerId || row.dataset.layerId === draggedLayerId) return;
    event.preventDefault();
    clearLayerDropMarkers();
    const box = row.getBoundingClientRect();
    row.dataset.dropPosition = event.clientY < box.top + box.height / 2 ? 'above' : 'below';
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  layersList.addEventListener('drop', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null;
    const sourceId = draggedLayerId ?? event.dataTransfer?.getData('text/plain');
    if (!target || !sourceId || target.dataset.layerId === sourceId) return;
    event.preventDefault();
    const scene = store.get();
    const source = scene.objects.find((object) => object.id === sourceId);
    if (!source || source.locked) return;
    const objects = scene.objects.filter((object) => object.id !== sourceId);
    const targetIndex = objects.findIndex((object) => object.id === target.dataset.layerId);
    if (targetIndex < 0) return;
    const insertIndex = targetIndex + (target.dataset.dropPosition === 'above' ? 1 : 0);
    objects.splice(insertIndex, 0, source);
    canvasHost.checkpointScene();
    store.set({ objects });
    draggedLayerId = null;
    clearLayerDropMarkers();
  });
  layersList.addEventListener('dragend', () => { draggedLayerId = null; clearLayerDropMarkers(); });
  for (const input of [color, strokeEnabled, fillEnabled, fill, railColor, railFill, width, opacity, lineCap, lineJoin, arrowStart, arrowEnd, symbol, font, fontSize, fontWeight, fontStyle, textUnderline, textAlign, redactionMode, redactionStrength, counterShape, counterFormat, counterNext, counterSize, counterFontSize, counterFont, counterTextColor]) input.addEventListener('pointerdown', canvasHost.checkpoint);

  for (const group of root.querySelectorAll<HTMLElement>('[data-choice-for]')) {
    const select = root.querySelector<HTMLSelectElement>(`[data-style="${group.dataset.choiceFor}"]`);
    if (!select) continue;
    group.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-value]') : null;
      if (!button) return;
      canvasHost.checkpoint();
      select.value = button.dataset.value!;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function updateCounter(): void {
    const shape = counterShape.value as Scene['counterShape'];
    const format = counterFormat.value as Scene['counterFormat'];
    const size = Math.max(8, Number(counterSize.value));
    const labelSize = Math.max(6, Number(counterFontSize.value));
    const family = counterFont.value;
    const textColor = counterTextColor.value;
    store.update((scene) => ({
      ...scene,
      counterShape: shape,
      counterFormat: format,
      counterFilled: true,
      counterSize: size,
      counterFontSize: labelSize,
      counterFontFamily: family,
      counterTextColor: textColor,
      objects: scene.objects.map((object) => object.id === scene.selectedId && object.type === 'counter'
        ? { ...object, shape, format, filled: true, radius: size, fontFamily: family, fontSize: labelSize, textColor }
        : object),
    }));
    root.querySelector<HTMLOutputElement>('[data-value="counter-size"]')!.value = formatMeasurement(Number(counterSize.value));
    root.querySelector<HTMLOutputElement>('[data-value="counter-font-size"]')!.value = formatMeasurement(Number(counterFontSize.value));
  }
  counterShape.addEventListener('change', updateCounter);
  counterFormat.addEventListener('change', updateCounter);
  counterValue.addEventListener('change', () => {
    const value = Math.max(1, Math.min(9_999, Math.round(Number(counterValue.value) || 1)));
    counterValue.value = String(value);
    const scene = store.get();
    const selected = scene.objects.find((object) => object.id === scene.selectedId);
    if (!selected || selected.type !== 'counter' || selected.n === value) return;
    canvasHost.checkpointScene();
    store.set({ objects: scene.objects.map((object) => object.id === selected.id && object.type === 'counter' ? { ...object, n: value } : object) });
  });
  let counterNextEdited = false;
  counterNext.addEventListener('input', () => {
    const next = Number(counterNext.value);
    if (Number.isInteger(next) && next >= 1 && next <= 9_999) {
      counterNextEdited = true;
      store.set({ counterNext: next });
    }
  });
  counterNext.addEventListener('change', () => {
    if (counterNextEdited) {
      counterNextEdited = false;
      counterNext.value = String(store.get().counterNext);
      return;
    }
    const next = Math.max(1, Math.min(9_999, Math.round(Number(counterNext.value) || 1)));
    counterNext.value = String(next);
    store.set({ counterNext: next });
  });
  root.querySelector<HTMLButtonElement>('[data-action="reset-counter"]')!.addEventListener('click', () => {
    counterNext.value = '1';
    store.set({ counterNext: 1 });
  });
  counterSize.addEventListener('input', updateCounter);
  counterFontSize.addEventListener('input', updateCounter);
  counterFont.addEventListener('change', updateCounter);
  counterTextColor.addEventListener('input', updateCounter);

  function updateStyle(): void {
    store.update((scene) => {
      const multiSymbols = scene.selectedIds.length > 1 && scene.selectedIds.every((id) => scene.objects.some((object) => object.id === id && object.type === 'symbol' && !object.locked));
      const selected = scene.objects.find((object) => object.id === (multiSymbols ? scene.selectedIds[0] : scene.selectedId));
      const context = selected?.type ?? scene.activeTool;
      const canDisableStroke = context === 'rect' || context === 'ellipse' || context === 'symbol';
      const style = { color: color.value, width: Number(width.value), opacity: Number(opacity.value) / 100, fill: context === 'redaction' && (selected?.type === 'redaction' ? selected.mode : scene.redactionMode) === 'solid' ? fill.value : fillEnabled.checked ? fill.value : context === 'symbol' ? null : undefined, stroke: canDisableStroke ? strokeEnabled.checked : true, lineCap: lineCap.value as CanvasLineCap, lineJoin: lineJoin.value as CanvasLineJoin };
      return {
        ...scene,
        toolStyle: style,
        objects: scene.objects.map((object) => (object.id === scene.selectedId || (multiSymbols && scene.selectedIds.includes(object.id))) ? { ...object, ...(object.type === 'symbol' ? { paint: 'separate' as const } : {}), style } : object),
      };
    });
    root.querySelector<HTMLOutputElement>('[data-value="width"]')!.value = formatMeasurement(Number(width.value));
    root.querySelector<HTMLOutputElement>('[data-value="opacity"]')!.value = `${opacity.value}%`;
    railColor.value = color.value;
    railFill.value = fill.value;
    fill.disabled = !fillEnabled.checked;
    color.disabled = !strokeEnabled.checked;
    root.querySelector<HTMLButtonElement>('[data-color-target="color"]')!.disabled = !strokeEnabled.checked;
    root.querySelector<HTMLButtonElement>('[data-color-target="fill"]')!.disabled = !fillEnabled.checked;
  }
  color.addEventListener('input', updateStyle);
  for (const input of [color, fill, width]) input.addEventListener('focus', () => canvasHost.checkpoint());
  strokeToggle.addEventListener('click', () => { canvasHost.checkpoint(); strokeEnabled.checked = !strokeEnabled.checked; updateStyle(); });
  fillToggle.addEventListener('click', () => { canvasHost.checkpoint(); fillEnabled.checked = !fillEnabled.checked; updateStyle(); });
  strokeEnabled.addEventListener('change', updateStyle);
  fillEnabled.addEventListener('change', updateStyle);
  fill.addEventListener('input', updateStyle);
  width.addEventListener('input', updateStyle);
  opacity.addEventListener('input', updateStyle);
  lineCap.addEventListener('change', updateStyle);
  lineJoin.addEventListener('change', updateStyle);
  function updateArrowHeads(): void {
    const startHead = arrowStart.value as ArrowHead;
    const endHead = arrowEnd.value as ArrowHead;
    store.update((scene) => ({
      ...scene,
      arrowStartHead: startHead,
      arrowEndHead: endHead,
      objects: scene.objects.map((object) => object.id === scene.selectedId && object.type === 'arrow' ? { ...object, startHead, endHead } : object),
    }));
  }
  arrowStart.addEventListener('change', updateArrowHeads);
  arrowEnd.addEventListener('change', updateArrowHeads);
  railColor.addEventListener('input', () => { color.value = railColor.value; strokeEnabled.checked = true; updateStyle(); });
  railFill.addEventListener('input', () => { fill.value = railFill.value; fillEnabled.checked = true; updateStyle(); });
  root.querySelector<HTMLButtonElement>('[data-action="swap-colors"]')!.addEventListener('click', () => {
    canvasHost.checkpoint();
    [color.value, fill.value] = [fill.value, color.value];
    updateStyle();
  });
  root.querySelector<HTMLButtonElement>('[data-action="default-colors"]')!.addEventListener('click', () => {
    canvasHost.checkpoint();
    color.value = '#000000';
    fill.value = '#ffffff';
    updateStyle();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="eyedropper"][data-color-target]')) button.addEventListener('click', () => canvasHost.pickColor((picked) => {
    const targetName = button.dataset.colorTarget;
    const target = targetName === 'fill' ? fill : targetName === 'counter-text-color' ? counterTextColor : color;
    target.value = picked;
    if (target === counterTextColor) {
      updateCounter();
      return;
    }
    if (target === fill) fillEnabled.checked = true;
    else strokeEnabled.checked = true;
    updateStyle();
  }));
  for (const palette of root.querySelectorAll<HTMLElement>('[data-color-presets]')) palette.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-color]') : null;
    if (!button) return;
    const targetName = palette.dataset.colorPresets!;
    if (targetName === 'counter-text-color') {
      canvasHost.checkpoint();
      counterTextColor.value = button.dataset.color!;
      updateCounter();
      return;
    }
    if (targetName === 'color' || targetName === 'fill') {
      canvasHost.checkpoint();
      const target = targetName === 'fill' ? fill : color;
      target.value = button.dataset.color!;
      if (target === fill) fillEnabled.checked = true;
      else strokeEnabled.checked = true;
      updateStyle();
      return;
    }
    const target = root.querySelector<HTMLInputElement>(`[name="${targetName}"]`);
    if (target) target.value = button.dataset.color!;
  });
  root.querySelector<HTMLElement>('[data-size-presets="width"]')!.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-value]') : null;
    if (!button) return;
    canvasHost.checkpoint();
    width.value = button.dataset.value!;
    updateStyle();
  });
  root.querySelector<HTMLElement>('[data-dialog-size-target="borderWidth"]')!.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-value]') : null;
    if (button) { borderWidthInput.value = button.dataset.value!; borderWidthInput.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  function reorder(front: boolean): void {
    const scene = store.get();
    const index = scene.objects.findIndex((object) => object.id === scene.selectedId);
    if (index < 0 || scene.objects[index].locked) return;
    canvasHost.checkpointScene();
    const objects = [...scene.objects];
    const [object] = objects.splice(index, 1);
    if (front) objects.push(object); else objects.unshift(object);
    store.set({ objects });
  }
  function reorderOne(id: string, direction: 1 | -1): void {
    const scene = store.get();
    const index = scene.objects.findIndex((object) => object.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= scene.objects.length || scene.objects[index].locked) return;
    canvasHost.checkpointScene();
    const objects = [...scene.objects];
    [objects[index], objects[next]] = [objects[next], objects[index]];
    store.set({ objects, selectedId: id, selectedIds: [] });
  }
  root.querySelector<HTMLButtonElement>('[data-action="send-back"]')!.addEventListener('click', () => reorder(false));
  root.querySelector<HTMLButtonElement>('[data-action="bring-front"]')!.addEventListener('click', () => reorder(true));
  root.querySelector<HTMLButtonElement>('[data-action="send-backward"]')!.addEventListener('click', () => { if (store.get().selectedId) reorderOne(store.get().selectedId!, -1); });
  root.querySelector<HTMLButtonElement>('[data-action="bring-forward"]')!.addEventListener('click', () => { if (store.get().selectedId) reorderOne(store.get().selectedId!, 1); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="send-back"]')!.addEventListener('click', () => { reorder(false); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="bring-front"]')!.addEventListener('click', () => { reorder(true); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  contextMenu.querySelector<HTMLButtonElement>('[data-context-action="delete"]')!.addEventListener('click', () => { canvasHost.deleteSelected(); contextMenu.hidden = true; contextMenuInvoker.focus({ preventScroll: true }); });
  symbol.addEventListener('change', () => {
    const symbolName = symbol.value as SymbolName;
    store.update((scene) => ({
      ...scene,
      symbolName,
      objects: scene.objects.map((object) => selectedLayerIds(scene).includes(object.id) && object.type === 'symbol' ? { ...object, name: symbolName, points: scene.symbolPoints, innerRatio: scene.symbolInnerRatio, sides: scene.symbolSides } : object),
    }));
  });
  const symbolSearch = root.querySelector<HTMLInputElement>('[data-symbol-search]')!;
  const symbolChoices = root.querySelector<HTMLElement>('[data-choice-for="symbol"]')!;
  const visibleSymbols = () => [...symbolChoices.querySelectorAll<HTMLButtonElement>('[data-value]')]
    .filter((button) => !button.hidden && !button.closest<HTMLElement>('[data-symbol-group]')?.hidden);
  symbolSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    visibleSymbols()[0]?.focus();
  });
  symbolChoices.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = visibleSymbols();
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)));
    buttons[next]?.focus();
  });
  symbolSearch.addEventListener('input', (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
    for (const group of root.querySelectorAll<HTMLElement>('[data-symbol-group]')) {
      let shown = 0;
      for (const button of group.querySelectorAll<HTMLButtonElement>('[data-value]')) {
        button.hidden = !button.getAttribute('aria-label')?.toLowerCase().includes(query);
        if (!button.hidden) shown++;
      }
      group.hidden = shown === 0;
    }
  });
  for (const input of [symbolPoints, symbolInnerRatio, symbolSides]) input.addEventListener('change', () => {
    canvasHost.checkpoint();
    const points = Math.max(3, Math.min(24, Math.round(Number(symbolPoints.value) || 5)));
    const innerRatio = Math.max(0.2, Math.min(0.9, Number(symbolInnerRatio.value) || 0.43));
    const sides = Math.max(3, Math.min(12, Math.round(Number(symbolSides.value) || 6)));
    store.update((scene) => ({ ...scene, symbolPoints: points, symbolInnerRatio: innerRatio, symbolSides: sides,
      objects: scene.objects.map((object) => selectedLayerIds(scene).includes(object.id) && object.type === 'symbol' ? { ...object, points, innerRatio, sides } : object) }));
  });

  function zoom(factor: number): void {
    const scene = store.get();
    store.set({ viewport: zoomAt(scene.viewport, { x: stageHost.clientWidth / 2, y: stageHost.clientHeight / 2 }, factor) });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="zoom-in"]')) button.addEventListener('click', () => zoom(1.2));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="zoom-out"]')) button.addEventListener('click', () => zoom(1 / 1.2));
  root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.addEventListener('click', () => {
    const image = store.get().image;
    if (image) store.set({ viewport: fitViewport(image.width, image.height, stageHost.clientWidth, stageHost.clientHeight) });
  });
  root.querySelector<HTMLButtonElement>('[data-action="actual-size"]')!.addEventListener('click', () => {
    const image = store.get().image;
    if (image) store.set({ viewport: { scale: 1, tx: (stageHost.clientWidth - image.width) / 2, ty: (stageHost.clientHeight - image.height) / 2 } });
  });
  function updateTextStyle(): void {
    const family = font.value;
    const size = Math.max(8, Math.ceil(Number(fontSize.value) || 8));
    const tracking = Math.max(-200, Math.min(1000, Math.round(Number(letterSpacing.value) || 0)));
    const leading = Math.max(0.5, Math.min(3, Number(lineHeight.value) || 1.2));
    letterSpacing.value = String(tracking);
    lineHeight.value = String(leading);
    const currentScene = store.get();
    const selected = new Set(selectedLayerIds(currentScene));
    if (currentScene.objects.some((object) => selected.has(object.id) && object.type === 'text'
      && (object.fontFamily !== family || object.fontSize !== size || (object.letterSpacing ?? 0) !== tracking
        || (object.lineHeight ?? 1.2) !== leading || object.fontWeight !== fontWeight.value
        || (object.fontStyle ?? 'normal') !== fontStyle.value || Boolean(object.underline) !== textUnderline.checked
        || object.align !== textAlign.value))) canvasHost.checkpoint();
    store.update((scene) => ({
      ...scene,
      fontFamily: family,
      fontSize: size,
      letterSpacing: tracking,
      lineHeight: leading,
      fontWeight: fontWeight.value as Scene['fontWeight'],
      fontStyle: fontStyle.value as Scene['fontStyle'],
      textUnderline: textUnderline.checked,
      textAlign: textAlign.value as Scene['textAlign'],
      objects: scene.objects.map((object) => selectedLayerIds(scene).includes(object.id) && object.type === 'text' ? { ...object, fontFamily: family, fontSize: size, letterSpacing: tracking, lineHeight: leading, fontWeight: fontWeight.value as Scene['fontWeight'], fontStyle: fontStyle.value as Scene['fontStyle'], underline: textUnderline.checked, align: textAlign.value as Scene['textAlign'] } : object),
    }));
    boldButton.setAttribute('aria-pressed', String(fontWeight.value === 'bold'));
    italicButton.setAttribute('aria-pressed', String(fontStyle.value === 'italic'));
    underlineButton.setAttribute('aria-pressed', String(textUnderline.checked));
  }
  font.addEventListener('change', updateTextStyle);
  fontSize.addEventListener('input', () => { fontSizePreset.value = [...fontSizePreset.options].some((option) => option.value === fontSize.value) ? fontSize.value : ''; updateTextStyle(); });
  fontSize.addEventListener('change', () => { fontSize.value = String(Math.max(8, Math.ceil(Number(fontSize.value) || 8))); fontSizePreset.value = [...fontSizePreset.options].some((option) => option.value === fontSize.value) ? fontSize.value : ''; updateTextStyle(); });
  for (const input of [letterSpacing, lineHeight]) input.addEventListener('change', updateTextStyle);
  fontWeight.addEventListener('change', updateTextStyle);
  fontStyle.addEventListener('change', updateTextStyle);
  textUnderline.addEventListener('change', updateTextStyle);
  textAlign.addEventListener('change', updateTextStyle);
  boldButton.addEventListener('click', () => { fontWeight.value = fontWeight.value === 'bold' ? 'normal' : 'bold'; updateTextStyle(); });
  italicButton.addEventListener('click', () => { fontStyle.value = fontStyle.value === 'italic' ? 'normal' : 'italic'; updateTextStyle(); });
  underlineButton.addEventListener('click', () => { textUnderline.checked = !textUnderline.checked; updateTextStyle(); });
  fontSizePreset.addEventListener('change', () => {
    if (!fontSizePreset.value) return;
    fontSize.value = fontSizePreset.value;
    fontSize.dispatchEvent(new Event('change', { bubbles: true }));
  });
  function updateRedaction(): void {
    if (store.get().objects.some((object) => object.id === store.get().selectedId && object.type === 'redaction')) canvasHost.checkpoint();
    if (redactionMode.value === 'solid') {
      const scene = store.get();
      const selected = scene.objects.find((object) => object.id === scene.selectedId);
      fill.value = selected?.style.fill ?? scene.toolStyle.fill ?? '#000000';
      fillEnabled.checked = true;
    }
    store.update((scene) => ({
      ...scene,
      redactionMode: redactionMode.value as Scene['redactionMode'],
      redactionStrength: Number(redactionStrength.value),
      toolStyle: redactionMode.value === 'solid' ? { ...scene.toolStyle, fill: fill.value } : scene.toolStyle,
      objects: scene.objects.map((object) => object.id === scene.selectedId && object.type === 'redaction'
        ? { ...object, mode: redactionMode.value as Scene['redactionMode'], strength: Number(redactionStrength.value), style: redactionMode.value === 'solid' ? { ...object.style, fill: fill.value } : object.style }
        : object),
    }));
  }
  redactionMode.addEventListener('change', updateRedaction);
  redactionStrength.addEventListener('input', updateRedaction);

  function addFontOption(select: HTMLSelectElement, family: string): void {
    if ([...select.options].some((option) => option.value === family)) return;
    select.querySelector<HTMLOptGroupElement>('[data-uploaded-fonts]')?.append(new Option(family, family));
  }
  const uploadedFontsReady = loadUploadedFonts().then((families) => {
    for (const family of families) { addFontOption(font, family); addFontOption(counterFont, family); addFontOption(watermarkFont, family); }
    syncUi();
  }).catch(() => { statusEl.textContent = 'Uploaded fonts unavailable'; });
  const fontInput = document.createElement('input');
  fontInput.type = 'file'; fontInput.accept = '.ttf,.otf,.woff,.woff2'; fontInput.hidden = true;
  fontInput.dataset.fontUpload = 'true';
  root.appendChild(fontInput);
  root.querySelector<HTMLButtonElement>('[data-action="upload-font"]')!.addEventListener('click', () => fontInput.click());
  fontInput.addEventListener('change', async () => {
    const file = fontInput.files?.[0];
    if (!file) return;
    try {
      const family = await saveUploadedFont(file);
      addFontOption(font, family); addFontOption(counterFont, family); addFontOption(watermarkFont, family); font.value = family; updateTextStyle();
      statusEl.textContent = 'Font added';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not add font';
    }
  });

  function closeSource(source: CanvasImageSource | undefined): void {
    (source as ImageBitmap | undefined)?.close?.();
  }

  async function restore(dto: SerializedScene, canApply: () => boolean = () => true, undoable = false): Promise<boolean> {
    await uploadedFontsReady;
    const decoded: CanvasImageSource[] = [];
    const decode = async (dataUrl: string): Promise<CanvasImageSource> => {
      const source = (await decodeImageDataUrl(dataUrl)).source;
      decoded.push(source);
      return source;
    };
    try {
      const image = dto.image ? { ...dto.image, source: await decode(dto.image.dataUrl) } : null;
      const objects: Scene['objects'] = [];
      for (const object of dto.objects) objects.push(object.type === 'image'
        ? { ...object, source: await decode(object.dataUrl) }
        : object);
      const watermark = dto.watermark?.kind === 'image'
        ? { ...dto.watermark, source: await decode(dto.watermark.dataUrl) }
        : dto.watermark;
      if (!canApply()) return false;
      canvasHost.setScene({ ...dto, image, objects, watermark, showOverflow: dto.showOverflow ?? false, arrowStartHead: dto.arrowStartHead ?? 'none', arrowEndHead: dto.arrowEndHead ?? 'open', fontStyle: dto.fontStyle ?? 'normal', textUnderline: dto.textUnderline ?? false, letterSpacing: dto.letterSpacing ?? 0, lineHeight: dto.lineHeight ?? 1.2, symbolPoints: dto.symbolPoints ?? 5, symbolInnerRatio: dto.symbolInnerRatio ?? 0.43, symbolSides: dto.symbolSides ?? 6, counterFormat: dto.counterFormat ?? 'numeric', counterNext: dto.counterNext ?? Math.max(1, ...dto.objects.filter((object) => object.type === 'counter').map((object) => object.n + 1)), counterFontSize: dto.counterFontSize ?? dto.counterSize ?? 18, counterFontFamily: dto.counterFontFamily ?? 'system-ui', counterTextColor: dto.counterTextColor ?? '#ffffff', selectedId: null, selectedIds: [], marquee: null }, undoable);
      return true;
    } finally {
      const retained = new Set(sceneSources(store.get()));
      for (const source of decoded) if (!retained.has(source)) closeSource(source);
    }
  }

  try {
    const autosave = createAutosaveStorage(indexedDB);
    startAutosave(store, autosave, { onError: autosaveUnavailable, onSuccess: autosaveAvailable });
    void (async () => {
      const startupScene = store.get();
      try {
        const saved = await loadAutosave(autosave);
        if (saved && store.get() === startupScene) await restore(saved, () => store.get() === startupScene);
      } catch (error) {
        statusEl.textContent = `Autosave restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    })().catch(autosaveUnavailable);
  } catch {
    autosaveUnavailable();
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="save-project"]')) button.addEventListener('click', () => {
    try {
      downloadBlob(new Blob([serializeScene(store.get())], { type: 'application/json' }), 'imagemarkup.imgmarkup');
      statusEl.textContent = 'Project saved';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not save project';
    }
  });
  const projectInput = document.createElement('input');
  projectInput.type = 'file';
  projectInput.accept = '.imgmarkup,application/json';
  projectInput.hidden = true;
  root.appendChild(projectInput);
  root.querySelector<HTMLButtonElement>('[data-action="open-project"]')!.addEventListener('click', () => { projectInput.value = ''; projectInput.click(); });
  projectInput.addEventListener('change', async () => {
    const file = projectInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('Project file is too large');
      const project = parseScene(await file.text());
      const scene = store.get();
      if ((scene.image || scene.objects.length) && !window.confirm('Open a project? This replaces the current image and markup.')) return;
      statusEl.textContent = await restore(project, () => store.get() === scene, true) ? 'Project opened' : 'Project open cancelled because the canvas changed';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not open project';
    }
  });

  const dialog = root.querySelector<HTMLDialogElement>('#export-dialog')!;
  const formatSelect = dialog.querySelector<HTMLSelectElement>('[name="format"]')!;
  const qualityInput = dialog.querySelector<HTMLInputElement>('[name="quality"]')!;
  const qualityOutput = dialog.querySelector<HTMLOutputElement>('[data-value="jpg-quality"]')!;
  const overflowNote = dialog.querySelector<HTMLElement>('[data-export-overflow-note]')!;
  const qualityLabel = qualityInput.closest('label')!;
  const syncQuality = () => { qualityOutput.value = `${qualityInput.value}%`; };
  const syncExportOptions = () => {
    const isJpeg = formatSelect.value === 'jpeg';
    qualityLabel.hidden = !isJpeg;
    qualityInput.disabled = !isJpeg;
    overflowNote.hidden = !store.get().showOverflow;
    overflowNote.textContent = isJpeg
      ? 'Overflow expands the export; JPG fills transparent areas with white.'
      : 'Overflow expands the export with a transparent background.';
  };
  formatSelect.addEventListener('change', syncExportOptions);
  qualityInput.addEventListener('input', syncQuality);
  syncQuality();
  syncExportOptions();
  overflowButton.addEventListener('click', () => {
    const showOverflow = !store.get().showOverflow;
    store.set({ showOverflow });
    statusEl.textContent = showOverflow ? 'Overflow visible and included in export' : 'Overflow hidden';
  });
  root.querySelector<HTMLButtonElement>('[data-action="about"]')!.addEventListener('click', (event) => openDialog(root.querySelector<HTMLDialogElement>('#about-dialog')!, event.currentTarget as HTMLElement));
  for (const guide of ['tools', 'editing', 'saving', 'shortcuts']) {
    root.querySelector<HTMLButtonElement>(`[data-action="${guide}-guide"]`)!.addEventListener('click', (event) =>
      openDialog(root.querySelector<HTMLDialogElement>(`#${guide}-guide-dialog`)!, event.currentTarget as HTMLElement));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="export"]')) button.addEventListener('click', (event) => {
    if (store.get().image) { syncExportOptions(); openDialog(dialog, event.currentTarget as HTMLElement); }
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'download') return;
    const form = new FormData(dialog.querySelector('form')!);
    const format = form.get('format') as ExportFormat;
    try {
      const quality = format === 'jpeg' ? Number(form.get('quality')) / 100 : undefined;
      const blob = await exportScene(store.get(), format, Number(form.get('scale')), quality);
      downloadBlob(blob, `imagemarkup.${format === 'jpeg' ? 'jpg' : 'png'}`);
      statusEl.textContent = 'Image exported';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Export failed';
    }
  });

  const copyButton = root.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  copyButton.addEventListener('click', async () => {
    try {
      const blob = await exportScene(store.get(), 'png');
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        downloadBlob(blob, 'imagemarkup.png');
        statusEl.textContent = 'Clipboard unavailable, downloaded PNG';
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      statusEl.textContent = 'Image copied';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Copy failed';
    }
  });
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
