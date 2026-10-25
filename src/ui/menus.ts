import type { Scene } from '../core/types';
import type { Store } from '../state/store';

export function createOpenDialog(syncNumericPairs: () => void): (dialog: HTMLDialogElement, invoker: HTMLElement) => void {
  return (dialog: HTMLDialogElement, invoker: HTMLElement) => {
    const menu = invoker.closest('details.app-menu');
    const returnTo = menu?.querySelector<HTMLElement>('summary') ?? invoker;
    syncNumericPairs();
    dialog.showModal();
    const heading = dialog.querySelector<HTMLElement>('h2')!;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    dialog.addEventListener('close', () => { if (returnTo.isConnected) returnTo.focus({ preventScroll: true }); }, { once: true });
  };
}

export function mountMenus(root: HTMLElement, stageHost: HTMLElement, store: Store<Scene>, openDialog: (dialog: HTMLDialogElement, invoker: HTMLElement) => void) {
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
  const positionMenu = (menu: HTMLDetailsElement) => {
    const summary = menu.querySelector('summary')!.getBoundingClientRect();
    const popover = menu.querySelector<HTMLElement>('.menu-popover')!;
    if (getComputedStyle(popover).position === 'fixed') {
      popover.style.setProperty('--menu-left', `${summary.left}px`);
      popover.style.setProperty('--menu-top', `${summary.bottom}px`);
      popover.style.setProperty('--menu-width', `${popover.offsetWidth}px`);
    } else {
      popover.style.setProperty('--menu-left', `${Math.max(8 - summary.left, Math.min(0, innerWidth - summary.left - popover.offsetWidth - 8))}px`);
    }
  };
  for (const menu of appMenus) {
    // Native <details> do not close their siblings, so a second menu would stack
    // on top of the first. Close the others whenever one opens.
    menu.addEventListener('toggle', () => { if (menu.open) { closeMenus(menu); positionMenu(menu); } });
    // Once any menu is open, hovering a sibling switches to it, like a desktop menu bar.
    menu.querySelector('summary')?.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (!menu.open && appMenus.some((other) => other.open)) menu.open = true;
    });
  }
  const positionOpenMenu = () => { for (const menu of appMenus) if (menu.open) positionMenu(menu); };
  window.addEventListener('resize', positionOpenMenu);
  window.addEventListener('orientationchange', positionOpenMenu);
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

  root.querySelector<HTMLButtonElement>('[data-action="about"]')!.addEventListener('click', (event) => openDialog(root.querySelector<HTMLDialogElement>('#about-dialog')!, event.currentTarget as HTMLElement));
  for (const guide of ['tools', 'editing', 'saving', 'shortcuts']) {
    root.querySelector<HTMLButtonElement>(`[data-action="${guide}-guide"]`)!.addEventListener('click', (event) =>
      openDialog(root.querySelector<HTMLDialogElement>(`#${guide}-guide-dialog`)!, event.currentTarget as HTMLElement));
  }
  return { contextMenu, focusContextMenuInvoker: () => contextMenuInvoker.focus({ preventScroll: true }) };
}
