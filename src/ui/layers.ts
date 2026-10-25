import type { Annotation, Scene } from '../core/types';
import type { Store } from '../state/store';
import { mountCanvasHost } from './canvas-host';
import { icon } from './icons';

export const selectedLayerIds = (scene: Scene): string[] => (scene.selectedIds ?? []).length ? scene.selectedIds : (scene.selectedId ? [scene.selectedId] : []);

export function mountLayers(root: HTMLElement, store: Store<Scene>, canvasHost: ReturnType<typeof mountCanvasHost>, editorEl: HTMLElement) {
  const layersList = root.querySelector<HTMLElement>('[data-layers-list]')!;
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
  return { renderLayers, reorder, reorderOne };
}
