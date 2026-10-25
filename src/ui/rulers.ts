import type { Scene } from '../core/types';
import type { Store } from '../state/store';
import type { EditorPreferences, MeasurementUnit } from './preferences';

const THICKNESS = 20;
const MIN_MAJOR_SPACING = 50;
const MIN_MINOR_SPACING = 6;

export interface RulerTick {
  /** Screen position along the ruler, in CSS pixels from the stage edge. */
  position: number;
  major: boolean;
  label: string | null;
}

/** Image pixels per one preference unit. */
export function unitPixels(unit: MeasurementUnit, ppi: number): number {
  if (unit === 'px') return 1;
  return unit === 'in' ? ppi : ppi / (unit === 'cm' ? 2.54 : 25.4);
}

/**
 * Tick marks for one ruler axis. `offset` is the screen position of the image origin and
 * `scale` the viewport zoom, so labels read in preference units measured from the image's
 * top-left. Major spacing is the smallest 1, 2 or 5 x 10^n step at least 50 px apart.
 */
export function rulerTicks({ start, length, offset, scale, unitPixels: pixelsPerUnit }: { start: number; length: number; offset: number; scale: number; unitPixels: number }): RulerTick[] {
  const screenPerUnit = scale * pixelsPerUnit;
  if (!(screenPerUnit > 0) || length <= 0) return [];
  const magnitude = 10 ** Math.floor(Math.log10(MIN_MAJOR_SPACING / screenPerUnit));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value * screenPerUnit >= MIN_MAJOR_SPACING)!;
  const divisions = [10, 5, 2, 1].find((count) => step * screenPerUnit / count >= MIN_MINOR_SPACING)!;
  const minor = step / divisions;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks: RulerTick[] = [];
  const first = Math.ceil((start - offset) / screenPerUnit / minor);
  const last = Math.floor((start + length - offset) / screenPerUnit / minor);
  for (let index = first; index <= last; index++) {
    const value = index * minor;
    const major = index % divisions === 0;
    const label = major ? (Object.is(Number(value.toFixed(decimals)), -0) ? 0 : Number(value.toFixed(decimals))).toString() : null;
    ticks.push({ position: offset + value * screenPerUnit, major, label });
  }
  return ticks;
}

export interface RulersOptions {
  stageHost: HTMLElement;
  store: Store<Scene>;
  getPreferences: () => EditorPreferences;
}

/** Draws horizontal and vertical rulers along the stage edges in the preferred measurement unit. */
export function mountRulers({ stageHost, store, getPreferences }: RulersOptions): { refresh(): void } {
  const container = document.createElement('div');
  container.className = 'rulers';
  // Rulers are a visual aid; exact sizes are available to assistive technology through the dimension controls.
  container.setAttribute('aria-hidden', 'true');
  container.hidden = true;
  const horizontal = document.createElement('canvas');
  horizontal.className = 'ruler ruler-x';
  const vertical = document.createElement('canvas');
  vertical.className = 'ruler ruler-y';
  const corner = document.createElement('div');
  corner.className = 'ruler-corner';
  container.append(horizontal, vertical, corner);
  stageHost.appendChild(container);

  let pointer: { x: number; y: number } | null = null;
  let frame = 0;

  function drawAxis(canvas: HTMLCanvasElement, along: number, axis: 'x' | 'y', scene: Scene, preferences: EditorPreferences): void {
    const dpr = window.devicePixelRatio || 1;
    const width = axis === 'x' ? along : THICKNESS;
    const height = axis === 'x' ? THICKNESS : along;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const styles = getComputedStyle(container);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = styles.getPropertyValue('--ruler-bg').trim() || '#1b1e22';
    ctx.fillRect(0, 0, width, height);
    // Positions are measured from the stage edge; the strip starts after the corner square.
    const ticks = rulerTicks({
      start: THICKNESS,
      length: along,
      offset: axis === 'x' ? scene.viewport.tx : scene.viewport.ty,
      scale: scene.viewport.scale,
      unitPixels: unitPixels(preferences.measurementUnit, preferences.measurementPpi),
    });
    const tickColor = styles.getPropertyValue('--ruler-tick').trim() || '#7d8590';
    ctx.strokeStyle = tickColor;
    ctx.fillStyle = styles.getPropertyValue('--ruler-text').trim() || '#c9d1d9';
    ctx.lineWidth = 1;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    for (const tick of ticks) {
      const at = Math.round(tick.position - THICKNESS) + 0.5;
      const size = tick.major ? THICKNESS : THICKNESS * 0.3;
      if (axis === 'x') { ctx.moveTo(at, THICKNESS); ctx.lineTo(at, THICKNESS - size); } else { ctx.moveTo(THICKNESS, at); ctx.lineTo(THICKNESS - size, at); }
    }
    ctx.stroke();
    for (const tick of ticks) {
      if (tick.label === null) continue;
      const at = Math.round(tick.position - THICKNESS);
      if (axis === 'x') ctx.fillText(tick.label, at + 3, 2);
      else { ctx.save(); ctx.translate(2, at - 3); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(tick.label, 0, 0); ctx.restore(); }
    }
    ctx.strokeStyle = tickColor;
    ctx.beginPath();
    if (axis === 'x') { ctx.moveTo(0, THICKNESS - 0.5); ctx.lineTo(width, THICKNESS - 0.5); } else { ctx.moveTo(THICKNESS - 0.5, 0); ctx.lineTo(THICKNESS - 0.5, height); }
    ctx.stroke();
    if (pointer) {
      const at = Math.round((axis === 'x' ? pointer.x : pointer.y) - THICKNESS) + 0.5;
      ctx.strokeStyle = styles.getPropertyValue('--ruler-marker').trim() || '#4aa3df';
      ctx.beginPath();
      if (axis === 'x') { ctx.moveTo(at, 0); ctx.lineTo(at, THICKNESS); } else { ctx.moveTo(0, at); ctx.lineTo(THICKNESS, at); }
      ctx.stroke();
    }
  }

  function draw(): void {
    frame = 0;
    const scene = store.get();
    const preferences = getPreferences();
    container.hidden = !preferences.showRulers || !scene.image;
    if (container.hidden) return;
    const { clientWidth, clientHeight } = stageHost;
    drawAxis(horizontal, Math.max(0, clientWidth - THICKNESS), 'x', scene, preferences);
    drawAxis(vertical, Math.max(0, clientHeight - THICKNESS), 'y', scene, preferences);
  }

  const refresh = () => { if (!frame) frame = requestAnimationFrame(draw); };
  stageHost.addEventListener('pointermove', (event) => {
    if (container.hidden) return;
    const rect = stageHost.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    refresh();
  }, { passive: true });
  stageHost.addEventListener('pointerleave', () => { pointer = null; refresh(); });
  // Stage resizes update the viewport in the store, so the store subscription also covers layout changes.
  store.subscribe(refresh);
  window.addEventListener('resize', refresh);
  refresh();
  return { refresh };
}
