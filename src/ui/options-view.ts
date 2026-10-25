import { annotationBounds } from '../core/annotations';
import { MATERIAL_SYMBOLS } from '../core/material-symbols';
import type { Scene, Tool } from '../core/types';
import type { Store } from '../state/store';
import { mountCanvasHost } from './canvas-host';
import { mountOptionsPreview } from './options-preview';
import { mountPanels } from './panels';
import type { EditorPreferences } from './preferences';
import { selectedLayerIds } from './layers';

export function queryOptionControls(root: HTMLElement) {
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
  return { color, strokeEnabled, fillEnabled, strokeToggle, fillToggle, fill, railColor, railFill, width, opacity, lineCap, lineJoin, arrowStart, arrowEnd, symbol, symbolPoints, symbolInnerRatio, symbolSides, font, watermarkFont, fontSize, letterSpacing, lineHeight, fontSizePreset, fontWeight, fontStyle, textUnderline, boldButton, italicButton, underlineButton, textAlign, redactionMode, redactionStrength, counterShape, counterFormat, counterValue, counterValueLabel, counterNext, counterSize, counterFontSize, counterFont, counterTextColor };
}

export function mountOptionsView(deps: {
  root: HTMLElement; store: Store<Scene>; canvasHost: ReturnType<typeof mountCanvasHost>; panels: ReturnType<typeof mountPanels>;
  controls: ReturnType<typeof queryOptionControls>; stageHost: HTMLElement; toolButtons: HTMLButtonElement[];
  toolList: HTMLElement; zoomValue: HTMLOutputElement; overflowButton: HTMLButtonElement; canvasInstructions: HTMLElement;
  selectionDimensions: HTMLElement; selectionWidth: HTMLInputElement; selectionHeight: HTMLInputElement; selectionAspectButton: HTMLButtonElement;
  getPreferences: () => EditorPreferences; dimensionValue: (pixels: number) => string; formatMeasurement: (pixels: number) => string;
  syncNumericPairs: () => void; renderLayers: (scene: Scene) => void;
}) {
  const { root, store, canvasHost, panels, controls, stageHost, toolButtons, toolList, zoomValue, overflowButton, canvasInstructions, selectionDimensions, selectionWidth, selectionHeight, selectionAspectButton, getPreferences, dimensionValue, formatMeasurement, syncNumericPairs, renderLayers } = deps;
  const { optionsbar, layersPanel, editorEl, mobileOptions, clampMovedPanels, setOptionsContext } = panels;
  const { color, strokeEnabled, fillEnabled, strokeToggle, fillToggle, fill, railColor, railFill, width, opacity, lineCap, lineJoin, arrowStart, arrowEnd, symbol, symbolPoints, symbolInnerRatio, symbolSides, font, fontSize, letterSpacing, lineHeight, fontSizePreset, fontWeight, fontStyle, textUnderline, boldButton, italicButton, underlineButton, textAlign, redactionMode, redactionStrength, counterShape, counterFormat, counterValue, counterValueLabel, counterNext, counterSize, counterFontSize, counterFont, counterTextColor } = controls;
  const fillColors = new Map<string, string>();
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
  const previewTile = optionsbar.querySelector<HTMLElement>('.tool-options-preview')!;
  const requestOptionsPreview = mountOptionsPreview(previewTile, previewTile.querySelector('canvas')!, () => store.get(), () => {
    const scene = store.get();
    return scene.objects.find((object) => object.id === scene.selectedId);
  });
  const applyCropButton = root.querySelector<HTMLButtonElement>('[data-action="apply-crop"]')!;
  const optionMap: Record<string, string[]> = {
    select: [], rect: ['color', 'stroke-toggle', 'fill', 'width', 'opacity', 'line-join'], ellipse: ['color', 'stroke-toggle', 'fill', 'width', 'opacity'],
    line: ['color', 'width', 'opacity', 'line-cap'], arrow: ['color', 'width', 'opacity', 'line-cap', 'arrowheads'], pen: ['color', 'width', 'opacity', 'line-cap'],
    highlighter: ['color', 'width', 'opacity', 'line-cap'], text: ['color', 'opacity', 'text'], counter: ['color', 'opacity', 'counter'],
    redaction: ['redaction'], crop: ['crop'], image: ['opacity'], symbol: ['color', 'stroke-toggle', 'fill', 'width', 'opacity', 'symbol'],
  };
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
      const step = getPreferences().measurementUnit === 'px' ? '1' : '0.01';
      selectionWidth.step = step;
      selectionHeight.step = step;
      selectionWidth.disabled = Boolean(selected.locked);
      selectionHeight.disabled = Boolean(selected.locked);
      selectionAspectButton.disabled = Boolean(selected.locked);
      for (const unit of selectionDimensions.querySelectorAll<HTMLElement>('[data-selection-unit]')) unit.textContent = getPreferences().measurementUnit;
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
    setOptionsContext(context);
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
  return syncUi;
}
