import { icon } from './icons';

export const LAYOUT_STORAGE_KEY = 'imagemarkup.panel-layout';

export interface PanelPosition { left: number; top: number }
export interface PanelLayout { tools: Record<string, PanelPosition>; layers?: PanelPosition }

export function readPanelLayout(): PanelLayout {
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

export function mountPanels(root: HTMLElement, stageHost: HTMLElement, selectionDimensions: HTMLElement, getPanelLayout: () => PanelLayout) {
  const optionsbar = root.querySelector<HTMLElement>('.optionsbar')!;
  const dimensionsDesktopParent = selectionDimensions.parentElement!;
  const mobileOptions = window.matchMedia('(max-width: 760px)');
  // Phones in either orientation; keep in step with the matching media query in styles/responsive.css.
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
  const layersPanel = root.querySelector<HTMLElement>('.layers-panel')!;
  const editorEl = root.querySelector<HTMLElement>('.editor')!;
  const optionsDragHandle = root.querySelector<HTMLElement>('[data-options-drag-handle]')!;
  const layersDragHandle = root.querySelector<HTMLElement>('[data-layers-drag-handle]')!;
  let optionsPanelContext = '';
  const savePanelLayout = () => {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(getPanelLayout())); } catch { /* Positions still apply for this session. */ }
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
    getPanelLayout().tools[optionsPanelContext] = { left: optionsbar.offsetLeft, top: optionsbar.offsetTop };
    savePanelLayout();
  });
  makePanelDraggable(layersPanel, layersDragHandle, () => {
    getPanelLayout().layers = { left: layersPanel.offsetLeft, top: layersPanel.offsetTop };
    savePanelLayout();
  });
  setPanelPosition(layersPanel, getPanelLayout().layers);
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
  window.addEventListener('resize', clampMovedPanels);
  const setOptionsContext = (context: string) => {
    if (optionsPanelContext === context) return;
    optionsPanelContext = context;
    setPanelPosition(optionsbar, getPanelLayout().tools[context]);
    optionsbar.scrollLeft = 0;
    optionsbar.scrollTop = 0;
  };
  const resetPanels = () => {
    setPanelPosition(optionsbar);
    setPanelPosition(layersPanel);
    optionsPanelContext = '';
    setLayersCollapsed(matchMedia('(max-width: 760px), (pointer: coarse)').matches);
    setOptionsCollapsed(false);
  };
  return { optionsbar, layersPanel, editorEl, mobileOptions, compactPanels, clampMovedPanels, setOptionsCollapsed, setLayersCollapsed, setOptionsContext, resetPanels };
}
