import type { ArrowHead, Scene, SymbolName } from '../core/types';
import type { Store } from '../state/store';
import { fitViewport, zoomAt } from '../core/viewport';
import { loadUploadedFonts, saveUploadedFont } from '../fonts/uploaded';
import { mountCanvasHost } from './canvas-host';
import { selectedLayerIds } from './layers';
import { queryOptionControls } from './options-view';

export function mountOptionEvents(deps: { root: HTMLElement; store: Store<Scene>; canvasHost: ReturnType<typeof mountCanvasHost>; controls: ReturnType<typeof queryOptionControls>; stageHost: HTMLElement; statusEl: HTMLElement; formatMeasurement: (pixels: number) => string; syncUi: () => void }): Promise<void> {
  const { root, store, canvasHost, controls, stageHost, statusEl, formatMeasurement, syncUi } = deps;
  const { color, strokeEnabled, fillEnabled, strokeToggle, fillToggle, fill, railColor, railFill, width, opacity, lineCap, lineJoin, arrowStart, arrowEnd, symbol, symbolPoints, symbolInnerRatio, symbolSides, font, watermarkFont, fontSize, letterSpacing, lineHeight, fontSizePreset, fontWeight, fontStyle, textUnderline, boldButton, italicButton, underlineButton, textAlign, redactionMode, redactionStrength, counterShape, counterFormat, counterValue, counterNext, counterSize, counterFontSize, counterFont, counterTextColor } = controls;
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
    if (button) { root.querySelector<HTMLInputElement>('#frame-dialog [name="borderWidth"]')!.value = button.dataset.value!; root.querySelector<HTMLInputElement>('#frame-dialog [name="borderWidth"]')!.dispatchEvent(new Event('input', { bubbles: true })); }
  });

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
  root.querySelector<HTMLButtonElement>('[data-action="upload-font"]')!.addEventListener('click', () => { fontInput.value = ''; fontInput.click(); });
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

  return uploadedFontsReady;
}
