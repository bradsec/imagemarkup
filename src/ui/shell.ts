import { icon, type IconName } from './icons';
import { MATERIAL_SYMBOLS, SYMBOL_GROUPS } from '../core/material-symbols';
import type { SymbolName } from '../core/types';

const OCTOCAT =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
const COMMON_COLORS = [
  ['Black', '#000000'], ['White', '#ffffff'],
  ['Dark red', '#c00000'], ['Red', '#ff0000'], ['Orange', '#ffc000'], ['Yellow', '#ffff00'],
  ['Light green', '#92d050'], ['Green', '#00b050'], ['Cyan', '#00b0f0'], ['Blue', '#0070c0'],
  ['Dark blue', '#002060'], ['Purple', '#7030a0'],
] as const;
const FONT_OPTIONS = `<optgroup label="Handwritten"><option value="Kalam">Kalam</option></optgroup><optgroup label="Sans serif"><option value="Inter">Inter</option><option value="Roboto">Roboto</option><option value="Open Sans">Open Sans</option><option value="Lato">Lato</option><option value="Montserrat">Montserrat</option><option value="Poppins">Poppins</option></optgroup><optgroup label="Serif"><option value="Merriweather">Merriweather</option><option value="Libre Baskerville">Libre Baskerville</option></optgroup><optgroup label="Display"><option value="Oswald">Oswald</option></optgroup><optgroup label="System"><option value="system-ui">System UI</option><option value="sans-serif">Generic Sans</option><option value="monospace">Generic Mono</option></optgroup><optgroup label="Uploaded fonts" data-uploaded-fonts></optgroup>`;

function colorPresets(target: string): string {
  return `<div class="color-presets" data-color-presets="${target}" aria-label="Standard colors">${COMMON_COLORS.map(([name, color]) => `<button type="button" data-color="${color}" aria-label="${name}" title="${name}" style="--swatch:${color}"></button>`).join('')}</div>`;
}

function numericCompanion(root: HTMLElement, selector: string, label: string, kind: 'presets' | 'slider' | 'value', values: string[] = [], factor = 1): void {
  const input = root.querySelector<HTMLInputElement>(selector)!;
  const pair = document.createElement('span');
  pair.className = 'numeric-pair';
  input.replaceWith(pair);
  pair.append(input);
  let companion: HTMLInputElement | HTMLSelectElement;
  if (kind === 'presets') {
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Custom</option>${values.map((value) => `<option value="${value}">${value}</option>`).join('')}`;
    select.setAttribute('aria-label', `${label} presets`);
    companion = select;
  } else {
    const field = document.createElement('input');
    field.type = kind === 'slider' ? 'range' : 'number';
    field.min = String(Number(input.min) * factor);
    field.max = String(Number(input.max) * factor);
    field.step = String(Number(input.step || 1) * factor);
    field.dataset.factor = String(factor);
    field.setAttribute('aria-label', `${label} ${kind === 'slider' ? 'slider' : 'value'}`);
    companion = field;
  }
  companion.dataset.numericCompanion = '';
  pair.append(companion);
}

function materialSymbolPreview(name: SymbolName): string {
  const symbol = MATERIAL_SYMBOLS[name];
  const transform = symbol.rotation ? ` transform="rotate(${symbol.rotation} 480 -480)"` : '';
  return `<svg class="symbol-preview" viewBox="${symbol.viewBox ?? '0 -960 960 960'}" aria-hidden="true" focusable="false"><path d="${symbol.path}"${transform}/></svg>`;
}

function symbolOptions(): string {
  return `<fieldset class="visual-options symbol-options" data-options="symbol"><legend>Symbol</legend><select data-style="symbol" aria-label="Symbol">${SYMBOL_GROUPS.map((group) => `<optgroup label="${group.label}">${group.names.map((name) => `<option value="${name}">${MATERIAL_SYMBOLS[name].label}</option>`).join('')}</optgroup>`).join('')}</select><label>Search symbols <input type="search" data-symbol-search aria-label="Search symbols"></label><div class="symbol-groups" data-choice-for="symbol">${SYMBOL_GROUPS.map((group) => `<section role="group" aria-label="${group.label}" data-symbol-group><strong>${group.label}</strong><div class="choice-grid">${group.names.map((name) => `<button type="button" data-value="${name}"></button>`).join('')}</div></section>`).join('')}</div></fieldset>`;
}

interface ToolDefinition {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string;
  group: number;
}

const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Move', icon: 'select', shortcut: 'V', group: 0 },
  { id: 'pan', label: 'Hand', icon: 'pan', group: 0 },
  { id: 'rect', label: 'Rectangle', icon: 'rect', shortcut: 'R', group: 1 },
  { id: 'ellipse', label: 'Ellipse', icon: 'ellipse', shortcut: 'O', group: 1 },
  { id: 'line', label: 'Line', icon: 'line', shortcut: 'L', group: 1 },
  { id: 'arrow', label: 'Arrow', icon: 'arrow', shortcut: 'A', group: 1 },
  { id: 'pen', label: 'Pen', icon: 'pen', shortcut: 'P', group: 2 },
  { id: 'highlighter', label: 'Highlighter', icon: 'highlighter', shortcut: 'H', group: 2 },
  { id: 'text', label: 'Text', icon: 'text', shortcut: 'T', group: 3 },
  { id: 'counter', label: 'Step counter', icon: 'counter', shortcut: 'C', group: 3 },
  { id: 'symbol', label: 'Symbol', icon: 'symbol', group: 3 },
  { id: 'redaction', label: 'Redact', icon: 'redaction', shortcut: 'B', group: 4 },
  { id: 'crop', label: 'Crop', icon: 'crop', group: 5 },
  { id: 'image', label: 'Place image', icon: 'image', group: 5 },
];

function toolButton(tool: ToolDefinition): string {
  const shortcut = tool.shortcut ? ` (${tool.shortcut})` : '';
  return `<button type="button" data-tool="${tool.id}" aria-pressed="${tool.id === 'select'}" aria-label="${tool.label}${shortcut}" title="${tool.label}${shortcut}">
    ${icon(tool.icon)}<span class="tool-label">${tool.label}</span>
  </button>`;
}

function toolRail(): string {
  return TOOLS.map((tool, index) => {
    const divider = index > 0 && tool.group !== TOOLS[index - 1].group ? '<span class="tool-sep" aria-hidden="true"></span>' : '';
    return divider + toolButton(tool);
  }).join('');
}

export interface Shell {
  stageHost: HTMLElement;
  statusEl: HTMLElement;
}

export function renderShell(root: HTMLElement): Shell {
  root.innerHTML = `
    <div class="layout">
      <header class="app-header">
        <div class="menubar">
          <h1 class="brand" aria-label="imagemarkup home"><span class="brand-mark">im</span><span>imagemarkup</span></h1>
          <details class="app-menu"><summary>File</summary><div class="menu-popover">
            <button type="button" data-action="new-project">New project<span>Ctrl+N</span></button>
            <hr>
            <button type="button" data-action="open-image">Open image<span>Ctrl+O</span></button>
            <button type="button" data-action="open-project">Open project</button>
            <button type="button" data-action="save-project">Save project<span>Ctrl+S</span></button>
            <hr>
            <button type="button" data-action="preferences">Preferences</button>
            <button type="button" data-action="reset-settings">Reset settings</button>
            <hr>
            <button type="button" data-action="copy">Copy PNG<span>Ctrl+C</span></button>
            <button type="button" data-action="export">Export image<span>Ctrl+E</span></button>
          </div></details>
          <details class="app-menu"><summary>Edit</summary><div class="menu-popover">
            <button type="button" data-action="undo">Undo<span>Ctrl+Z</span></button>
            <button type="button" data-action="redo">Redo<span>Ctrl+Shift+Z</span></button>
            <hr>
            <button type="button" data-action="duplicate">Duplicate selection<span>Ctrl+D</span></button>
            <button type="button" data-action="delete">Delete selection<span>Delete</span></button>
          </div></details>
          <details class="app-menu"><summary>Image</summary><div class="menu-popover">
            <button type="button" data-action="transform">Rotate, flip, resize</button>
            <button type="button" data-action="frame">Frame and watermark</button>
          </div></details>
          <details class="app-menu"><summary>View</summary><div class="menu-popover">
            <button type="button" data-action="fit">Fit image<span>0</span></button>
            <button type="button" data-action="actual-size">Actual size<span>1</span></button>
            <button type="button" data-action="zoom-in">Zoom in<span>+</span></button>
            <button type="button" data-action="zoom-out">Zoom out<span>-</span></button>
            <hr>
            <button type="button" data-action="toggle-overflow" aria-pressed="false">Show overflow<span>Off</span></button>
            <button type="button" data-action="toggle-rulers" aria-pressed="false">Rulers<span>Off</span></button>
          </div></details>
          <details class="app-menu"><summary>Help</summary><div class="menu-popover">
            <button type="button" data-action="tools-guide">Tools and drawing</button>
            <button type="button" data-action="editing-guide">Editing and layers</button>
            <button type="button" data-action="saving-guide">Saving and exporting</button>
            <button type="button" data-action="shortcuts-guide">Keyboard shortcuts</button>
            <hr>
            <button type="button" data-action="about">About imagemarkup</button>
          </div></details>
        </div>
        <div class="topbar-actions" role="group" aria-label="Quick actions">
          <div class="selection-dimensions" data-selection-dimensions aria-label="Selected object dimensions" hidden>
            <input type="number" min="0.01" step="1" inputmode="decimal" data-selection-size="width" aria-label="Selected object width">
            <span class="dimension-separator" aria-hidden="true">×</span>
            <input type="number" min="0.01" step="1" inputmode="decimal" data-selection-size="height" aria-label="Selected object height">
            <span class="selection-unit" data-selection-unit>px</span>
            <button class="icon-button" type="button" data-action="toggle-selection-aspect" aria-pressed="true" aria-label="Preserve aspect ratio" title="Preserve aspect ratio">${icon('link', 16)}</button>
          </div>
          <button class="icon-button" type="button" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)">${icon('undo', 18)}</button>
          <button class="icon-button" type="button" data-action="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${icon('redo', 18)}</button>
          <span class="toolbar-divider"></span>
          <button class="icon-button" type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('zoom-out', 18)}</button>
          <output id="zoom-value" aria-label="Zoom level">100%</output>
          <button class="icon-button" type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('zoom-in', 18)}</button>
          <span class="toolbar-divider"></span>
          <button class="icon-button" type="button" data-action="save-project" aria-label="Save project" title="Save project (Ctrl+S)">${icon('save', 18)}</button>
          <button class="primary-action" type="button" data-action="export" title="Export image (Ctrl+E)">${icon('download', 18)}<span>Export</span></button>
        </div>
      </header>
      <div class="workspace">
        <nav class="toolrail" aria-label="Markup tools">
          <div class="tool-list">${toolRail()}</div>
          <div class="tool-colors" aria-label="Stroke and fill colors">
            <input type="color" data-rail-color="fill" value="#17c0b8" aria-label="Fill color" title="Fill color">
            <input type="color" data-rail-color="color" value="#ff3b30" aria-label="Stroke color" title="Stroke color">
            <button type="button" data-action="swap-colors" aria-label="Swap stroke and fill colors" title="Swap stroke and fill colors"><span aria-hidden="true">⇄</span></button>
            <button type="button" data-action="default-colors" aria-label="Reset stroke and fill colors" title="Reset stroke and fill colors"><span class="default-swatches" aria-hidden="true"></span></button>
          </div>
        </nav>
        <div class="editor">
          <div class="optionsbar" aria-label="Tool options">
            <div class="options-heading" data-options-drag-handle>
              <strong id="active-tool-name">Move</strong>
              <span class="drag-grip" aria-hidden="true"></span>
              <button class="compact-button" type="button" data-action="toggle-options-panel" aria-label="Collapse Tool options panel" aria-expanded="true" title="Collapse Tool options panel">${icon('chevron-up', 15)}</button>
            </div>
            <div class="tool-options-preview" aria-hidden="true" hidden><canvas></canvas></div>
            <span class="option-hint" data-options="select">Select an object to edit its properties</span>
            <span class="option-hint" data-options="crop">Drag over the area to keep, then apply the crop</span>
            <label data-options="crop">Aspect ratio <select data-style="crop-ratio" aria-label="Crop aspect ratio"><option value="free">Free</option><option value="original">Original</option><option value="1:1">1:1</option><option value="4:3">4:3</option><option value="3:2">3:2</option><option value="16:9">16:9</option></select></label>
            <button type="button" data-options="crop" data-action="swap-crop-ratio" aria-label="Swap crop orientation" title="Swap crop orientation">Swap orientation</button>
            <div class="option-actions" data-options="crop"><button type="button" data-action="apply-crop">Apply crop</button><button type="button" data-action="cancel-crop">Cancel</button></div>
            <div class="color-row" data-options="color">
              <span class="paint-toggle-wrap" data-options="stroke-toggle"><input type="checkbox" data-style="stroke-enabled" checked hidden><button class="paint-toggle" type="button" data-action="toggle-stroke" aria-label="Toggle stroke" aria-pressed="true" title="Toggle stroke"><span class="paint-toggle-icon"></span></button><span>Stroke</span></span>
              <label><span data-style-label="color">Stroke</span><input type="color" data-style="color" value="#ff3b30" aria-label="Stroke color"></label>
              <button class="compact-button" type="button" data-action="eyedropper" data-color-target="color" aria-label="Pick stroke color from image" title="Pick stroke color from image">${icon('eyedropper', 16)}</button>
            </div>
            <div data-options="color">${colorPresets('color')}</div>
            <div class="color-row" data-options="fill">
              <span class="paint-toggle-wrap"><input type="checkbox" data-style="fill-enabled" hidden><button class="paint-toggle" type="button" data-action="toggle-fill" aria-label="Toggle fill" aria-pressed="false" title="Toggle fill"><span class="paint-toggle-icon"></span></button><span>Fill</span></span>
              <input type="color" data-style="fill" value="#17c0b8" aria-label="Fill color">
              <button class="compact-button" type="button" data-action="eyedropper" data-color-target="fill" aria-label="Pick fill color from image" title="Pick fill color from image">${icon('eyedropper', 16)}</button>
            </div>
            <div data-options="fill">${colorPresets('fill')}</div>
            <fieldset class="visual-options" data-options="width"><legend>Thickness</legend><div class="size-presets stroke-presets" data-size-presets="width"><button type="button" data-value="2" aria-label="Fine stroke"><span style="--preview-width:2px"></span></button><button type="button" data-value="6" aria-label="Medium stroke"><span style="--preview-width:4px"></span></button><button type="button" data-value="12" aria-label="Thick stroke"><span style="--preview-width:7px"></span></button><button type="button" data-value="24" aria-label="Heavy stroke"><span style="--preview-width:11px"></span></button><button type="button" data-value="40" aria-label="Extra heavy stroke"><span style="--preview-width:16px"></span></button></div></fieldset>
            <label data-options="width">Custom width <input type="range" data-style="width" min="1" max="40" value="6"><output data-value="width">6 px</output></label>
            <label data-options="opacity">Opacity <input type="range" data-style="opacity" min="10" max="100" value="100"><output data-value="opacity">100%</output></label>
            <fieldset class="visual-options" data-options="line-cap"><legend>Line cap</legend><select data-style="line-cap" hidden><option value="square">Square</option><option value="round">Round</option><option value="butt">Butt</option></select><div class="choice-row" data-choice-for="line-cap"><button type="button" data-value="square" aria-label="Square line cap" title="Square extends past the endpoint"><svg class="cap-preview" viewBox="0 0 32 20" aria-hidden="true"><path class="preview-guide" d="M24 2v16"/><path class="preview-stroke" d="M5 10h19" stroke-linecap="square"/></svg></button><button type="button" data-value="round" aria-label="Round line cap" title="Round extends past the endpoint"><svg class="cap-preview" viewBox="0 0 32 20" aria-hidden="true"><path class="preview-guide" d="M24 2v16"/><path class="preview-stroke" d="M5 10h19" stroke-linecap="round"/></svg></button><button type="button" data-value="butt" aria-label="Butt line cap" title="Butt stops at the endpoint"><svg class="cap-preview" viewBox="0 0 32 20" aria-hidden="true"><path class="preview-guide" d="M24 2v16"/><path class="preview-stroke" d="M5 10h19" stroke-linecap="butt"/></svg></button></div></fieldset>
            <fieldset class="visual-options" data-options="line-join"><legend>Corner join</legend><select data-style="line-join" hidden><option value="miter">Miter Join</option><option value="round">Round Join</option><option value="bevel">Bevel Join</option></select><div class="choice-row" data-choice-for="line-join"><button type="button" data-value="miter" aria-label="Miter join" title="Miter creates a pointed corner"><svg class="join-preview" viewBox="0 0 44 36" aria-hidden="true"><path class="preview-stroke" d="M7 31 22 8l15 23" stroke-linejoin="miter"/></svg></button><button type="button" data-value="round" aria-label="Round join" title="Round creates a curved corner"><svg class="join-preview" viewBox="0 0 44 36" aria-hidden="true"><path class="preview-stroke" d="M7 31 22 8l15 23" stroke-linejoin="round"/></svg></button><button type="button" data-value="bevel" aria-label="Bevel join" title="Bevel creates a flat corner"><svg class="join-preview" viewBox="0 0 44 36" aria-hidden="true"><path class="preview-stroke" d="M7 31 22 8l15 23" stroke-linejoin="bevel"/></svg></button></div></fieldset>
            ${symbolOptions()}
            <label data-options="symbol" data-symbol-param="star">Points <input type="number" data-style="symbol-points" aria-label="Points" min="3" max="24" step="1" value="5"></label>
            <label data-options="symbol" data-symbol-param="star">Inner radius <input type="number" data-style="symbol-inner-ratio" aria-label="Inner radius" min="0.2" max="0.9" step="0.01" value="0.43"></label>
            <label data-options="symbol" data-symbol-param="hexagon">Sides <input type="number" data-style="symbol-sides" aria-label="Sides" min="3" max="12" step="1" value="6"></label>
            <label data-options="text">Font <select data-style="font">${FONT_OPTIONS}</select></label>
            <label data-options="text">Font size <select data-style="font-size-preset" aria-label="Font size presets"><option value="">Custom</option><option value="8">8</option><option value="9">9</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="14">14</option><option value="18">18</option><option value="24">24</option><option value="30">30</option><option value="32">32</option><option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="96">96</option><option value="120">120</option></select></label>
            <label data-options="text">Font size <input data-style="font-size" aria-label="Font size" type="number" min="8" max="300" step="1" value="32"></label>
            <label data-options="text">Letter spacing <input data-style="letter-spacing" aria-label="Letter spacing" type="number" min="-200" max="1000" step="1" value="0"></label>
            <label data-options="text">Line spacing <input data-style="line-height" aria-label="Line spacing" type="number" min="0.5" max="3" step="0.05" value="1.2"></label>
            <div class="text-format-options" data-options="text" aria-label="Text formatting"><select data-style="font-weight" hidden><option value="normal">Regular</option><option value="bold">Bold</option></select><select data-style="font-style" hidden><option value="normal">Regular</option><option value="italic">Italic</option></select><input type="checkbox" data-style="text-underline" hidden><button type="button" data-action="toggle-bold" aria-label="Bold" aria-pressed="false"><strong>B</strong></button><button type="button" data-action="toggle-italic" aria-label="Italic" aria-pressed="false"><em>I</em></button><button type="button" data-action="toggle-underline" aria-label="Underline" aria-pressed="false"><span class="underline-label">U</span></button></div>
            <fieldset class="visual-options" data-options="text"><legend>Alignment</legend><select data-style="text-align" hidden><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><div class="choice-row text-align-options" data-choice-for="text-align"><button type="button" data-value="left" aria-label="Align left"><span class="align-preview align-left"></span></button><button type="button" data-value="center" aria-label="Align center"><span class="align-preview align-center"></span></button><button type="button" data-value="right" aria-label="Align right"><span class="align-preview align-right"></span></button><button type="button" data-value="justify" aria-label="Justify text"><span class="align-preview align-justify"></span></button></div></fieldset>
            <fieldset class="visual-options" data-options="counter"><legend>Shape</legend><select data-style="counter-shape" hidden><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option></select><div class="choice-row" data-choice-for="counter-shape"><button type="button" data-value="circle" aria-label="Circle counter"><span class="shape-preview shape-circle"></span></button><button type="button" data-value="square" aria-label="Square counter"><span class="shape-preview shape-square"></span></button><button type="button" data-value="diamond" aria-label="Diamond counter"><span class="shape-preview shape-diamond"></span></button></div></fieldset>
            <fieldset class="visual-options" data-options="counter"><legend>Sequence</legend><select data-style="counter-format" hidden><option value="numeric">1, 2, 3</option><option value="alpha">A, B, C</option><option value="roman">I, II, III</option></select><div class="choice-row counter-format-options" data-choice-for="counter-format"><button type="button" data-value="numeric" aria-label="Numeric counters">1</button><button type="button" data-value="alpha" aria-label="Letter counters">A</button><button type="button" data-value="roman" aria-label="Roman numeral counters">I</button></div></fieldset>
            <label data-options="counter" data-counter-selected-value hidden>Selected value <input type="number" data-style="counter-value" min="1" max="9999" step="1" value="1" aria-label="Selected counter value"></label>
            <div class="counter-sequence-control" data-options="counter"><label>Next value <input type="number" data-style="counter-next" min="1" max="9999" value="1" aria-label="Next counter value"></label><button class="compact-button" type="button" data-action="reset-counter" aria-label="Reset counter to one" title="Reset counter to 1">${icon('undo', 16)}</button></div>
            <div class="color-row" data-options="counter">
              <label>Text color <input type="color" data-style="counter-text-color" value="#ffffff" aria-label="Counter text color"></label>
              <button class="compact-button" type="button" data-action="eyedropper" data-color-target="counter-text-color" aria-label="Pick counter text color from image" title="Pick counter text color from image">${icon('eyedropper', 16)}</button>
            </div>
            <div data-options="counter">${colorPresets('counter-text-color')}</div>
            <label data-options="counter">Shape size <input type="range" data-style="counter-size" min="8" max="64" value="18"><output data-value="counter-size">18 px</output></label>
            <label data-options="counter">Font size <input type="range" data-style="counter-font-size" min="6" max="96" value="18"><output data-value="counter-font-size">18 px</output></label>
            <label data-options="counter">Font <select data-style="counter-font">${FONT_OPTIONS}</select></label>
            <div class="text-format-options" data-options="counter" aria-label="Counter text formatting"><button type="button" data-action="counter-bold" aria-label="Bold counter text" aria-pressed="true"><strong>B</strong></button><button type="button" data-action="counter-italic" aria-label="Italic counter text" aria-pressed="false"><em>I</em></button><button type="button" data-action="counter-underline" aria-label="Underline counter text" aria-pressed="false"><span class="underline-label">U</span></button></div>
            <label data-options="redaction">Mode <select data-style="redaction-mode"><option value="pixelate">Pixelate</option><option value="blur">Blur</option><option value="solid">Solid</option></select></label>
            <label data-options="redaction">Strength <input data-style="redaction-strength" type="range" min="2" max="40" value="10"></label>
            <button type="button" data-action="upload-font" data-options="text" aria-label="Add font">${icon('upload', 16)}<span>Add font</span></button>
            <span class="option-spacer"></span>
            <div class="option-actions arrange-actions" data-options="arrange"><button type="button" data-action="send-back">${icon('layer-back', 16)}<span>Send to back</span></button><button type="button" data-action="send-backward">Send backward</button><button type="button" data-action="bring-forward">Bring forward</button><button type="button" data-action="bring-front">${icon('layer-front', 16)}<span>Bring to front</span></button></div>
          </div>
          <section class="layers-panel" aria-label="Layers" hidden>
            <div class="layers-heading" data-layers-drag-handle><strong>Layers</strong><span class="drag-grip" aria-hidden="true"></span><button class="compact-button" type="button" data-action="toggle-layers-panel" aria-label="Collapse Layers panel" aria-expanded="true" title="Collapse Layers panel">${icon('chevron-up', 15)}</button><button class="compact-button" type="button" data-action="delete-selected-layers" aria-label="Delete selected layers" title="Delete selected layers">${icon('trash', 15)}</button></div>
            <div class="layers-list" data-layers-list role="list" aria-label="Canvas layers"></div>
          </section>
          <div class="context-menu" id="layer-context-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-layer-context-action="rename">Rename layer</button>
            <button type="button" role="menuitem" data-layer-context-action="duplicate">Duplicate layer <span>Ctrl+D</span></button>
            <button type="button" role="menuitem" data-layer-context-action="bring-forward">Bring forward</button>
            <button type="button" role="menuitem" data-layer-context-action="send-backward">Send backward</button>
            <hr>
            <button type="button" role="menuitem" data-layer-context-action="delete">Delete layer <span>Delete</span></button>
          </div>
          <main class="stage-host" id="stage" data-active-tool="select" aria-label="Image editing canvas" aria-describedby="canvas-instructions" tabindex="0">
            <div class="load-error" hidden><p role="alert"></p><button type="button">Dismiss</button></div>
            <div class="empty-state">
              <span class="empty-icon" aria-hidden="true">${icon('image-plus', 28)}</span>
              <strong>Open an image to start</strong>
              <button type="button" class="empty-open-button" data-action="open-image">${icon('image-plus', 18)}<span>Load image</span></button>
              <span>Choose a file, drop it here, or paste from the clipboard</span>
            </div>
            <div class="context-menu" id="canvas-context-menu" role="menu" hidden>
              <button type="button" role="menuitem" data-context-action="bring-front">Bring to front</button>
              <button type="button" role="menuitem" data-context-action="send-back">Send to back</button>
              <hr>
              <button type="button" role="menuitem" data-context-action="delete">Delete <span>Delete</span></button>
            </div>
          </main>
        </div>
      </div>
      <footer class="statusbar">
        <span id="status" aria-live="polite">Ready</span>
        <span data-autosave-status aria-live="polite" hidden></span>
        <span class="status-tip" id="canvas-instructions"></span>
        <span class="spacer"></span>
        <a class="repo-link" href="https://github.com/bradsec/imagemarkup" target="_blank" rel="noopener noreferrer">${OCTOCAT}<span>imagemarkup</span><span class="visually-hidden"> on GitHub</span><span class="app-version">v${__APP_VERSION__}</span></a>
      </footer>
      <dialog id="export-dialog" aria-labelledby="export-title">
        <form method="dialog" class="dialog-form">
          <div class="dialog-heading"><h2 id="export-title">Export image</h2><p>Save a flattened copy of your work.</p></div>
          <label>Format <select name="format"><option value="png">PNG</option><option value="jpeg">JPG</option></select></label>
          <label>Scale <select name="scale"><option value="1">1x</option><option value="2">2x</option></select></label>
          <label>JPG quality <span class="range-with-value"><input name="quality" type="range" min="10" max="100" value="90" aria-describedby="jpg-quality-value"><output id="jpg-quality-value" data-value="jpg-quality">90%</output></span></label>
          <p class="export-overflow-note" data-export-overflow-note hidden></p>
          <div class="dialog-actions"><button value="cancel">Cancel</button><button value="download" data-action="download">Export</button></div>
        </form>
      </dialog>
      <dialog id="about-dialog" aria-labelledby="about-title">
        <form method="dialog" class="dialog-form">
          <div class="dialog-heading"><h2 id="about-title" tabindex="-1">About imagemarkup</h2><p>Version ${__APP_VERSION__}</p></div>
          <p>A private, browser-based image annotation editor. Images and projects remain on your device unless you choose to share them.</p>
          <p>Created by Mark Bradley (<a href="https://github.com/bradsec" target="_blank" rel="noopener noreferrer">BRADSEC</a>).</p>
          <p>Bundled assets include Lucide interface icons, Google Material Symbols for annotation symbols, fonts under the SIL Open Font License, the Primer Octicons GitHub mark, and legacy Font Awesome hand gestures. <a href="./THIRD-PARTY-LICENSES.txt" target="_blank" rel="noopener noreferrer">View third-party licenses</a>.</p>
          <a class="about-repo-link" href="https://github.com/bradsec/imagemarkup" target="_blank" rel="noopener noreferrer">View imagemarkup on GitHub</a>
          <p class="about-support-copy">If you find this useful, please consider starring the repository. It helps others discover the project. You can also support me on <a href="https://ko-fi.com/bradsec" target="_blank" rel="noopener noreferrer">Ko-fi</a>.</p>
          <div class="dialog-actions"><button value="close">Close</button></div>
        </form>
      </dialog>
      <dialog id="tools-guide-dialog" class="guide-dialog" aria-labelledby="tools-guide-title">
        <form method="dialog" class="dialog-form guide-dialog-content">
          <div class="dialog-heading"><h2 id="tools-guide-title" tabindex="-1">Tools and drawing</h2><p>Choose a tool, then mark up the image.</p></div>
          <dl class="help-settings">
            <div><dt>Move and Hand</dt><dd>Move selects and transforms objects. Hand pans the canvas. Hold Space and drag to pan while using another tool.</dd></div>
            <div><dt>Shapes and strokes</dt><dd>Rectangle, Ellipse, Line, and Arrow draw geometric marks. Pen draws freehand strokes; Highlighter adds translucent marks. Click to place a default-size shape, or drag to size it. A finished shape returns to Move with it selected; Pen and Highlighter stay active.</dd></div>
            <div><dt>Text, Step counter, and Symbol</dt><dd>Text adds editable text; placing it opens the editor and returns to Move. Step counter places numbered, lettered, or Roman markers with their own fill, border, and bold, italic, or underlined text, and stays active for the next number. Symbol places a shape from the searchable library and returns to Move with it selected. Click or drag to place and size them.</dd></div>
            <div><dt>Redact</dt><dd>Drag over an area to cover it with pixelation, blur, or an opaque solid color, then adjust it under Move. Choose the mode in Tool options.</dd></div>
            <div><dt>Place image and Crop</dt><dd>Place image adds a file as an editable layer. Crop selects the area to keep; drag or click for a default area, then Apply crop or Cancel. Choosing an aspect ratio or Swap orientation reshapes the current crop straight away.</dd></div>
            <div><dt>Canvas placement</dt><dd>With the canvas focused, press Enter or Space to place a default-size shape, text, counter, symbol, redaction, or crop at the viewport center.</dd></div>
            <div><dt>Stroke and fill</dt><dd>Use the rail swatches or Tool options to set colors. Swap exchanges stroke and fill; Reset restores their defaults. Tool options also controls thickness, opacity, and settings for the active tool.</dd></div>
            <div><dt>Drawing modifiers</dt><dd>Hold Shift to constrain proportions when drawing or resizing, or to snap rotation to 45-degree steps. Hold Alt or Option to draw or resize from the center.</dd></div>
          </dl>
          <div class="dialog-actions"><button value="close">Close</button></div>
        </form>
      </dialog>
      <dialog id="editing-guide-dialog" class="guide-dialog" aria-labelledby="editing-guide-title">
        <form method="dialog" class="dialog-form guide-dialog-content">
          <div class="dialog-heading"><h2 id="editing-guide-title" tabindex="-1">Editing and layers</h2><p>Adjust objects and the base image.</p></div>
          <dl class="help-settings">
            <div><dt>Select objects</dt><dd>Use Move to click an object, or drag empty canvas for a marquee. Shift selects a range in Layers; Ctrl or Cmd adds separate items. Drag a selection to move it.</dd></div>
            <div><dt>Resize and rotate</dt><dd>Drag selection handles to resize or rotate. Enter exact width and height in the dimensions controls, choose units in Preferences, and toggle the aspect lock as needed.</dd></div>
            <div><dt>Layers</dt><dd>Each object has a row. Show or hide it, lock it, rename it, or drag to reorder. Right-click a row for duplicate, delete, and one-step ordering; focus a row and use Alt+ArrowUp or Alt+ArrowDown to reorder.</dd></div>
            <div><dt>Duplicate, delete, undo</dt><dd>Use Edit or Ctrl/Cmd+D to duplicate a selection. Delete or Backspace removes it. Undo and Redo restore or repeat changes.</dd></div>
            <div><dt>Image transforms</dt><dd>Image > Rotate, flip, resize changes the base image and annotations; press Enter in a size field to resize. Crop keeps the chosen area; it clips crossing layers and removes layers outside it.</dd></div>
            <div><dt>Frame and watermark</dt><dd>Image > Frame and watermark adds a border or a text or image watermark to exported work.</dd></div>
          </dl>
          <div class="dialog-actions"><button value="close">Close</button></div>
        </form>
      </dialog>
      <dialog id="saving-guide-dialog" class="guide-dialog" aria-labelledby="saving-guide-title">
        <form method="dialog" class="dialog-form guide-dialog-content">
          <div class="dialog-heading"><h2 id="saving-guide-title" tabindex="-1">Saving and exporting</h2><p>Keep an editable project or share a flat image.</p></div>
          <dl class="help-settings">
            <div><dt>Open image</dt><dd>Choose File > Open image, paste, or drop a file on the editor. Opening another image asks before replacing current work; Undo can restore it. File > New project starts clean and clears undo history. Markup tools appear once an image is loaded.</dd></div>
            <div><dt>Autosave</dt><dd>The browser saves work locally and restores it on return. If saving fails, Autosave unavailable stays in the status bar until a save succeeds.</dd></div>
            <div><dt>Editable projects</dt><dd>File > Save project downloads a .imgmarkup file. Open project restores its image and layers after confirmation if work is already open.</dd></div>
            <div><dt>Project size</dt><dd>Project files have a 110 MB limit, with a 100 MB encoded image-data budget across the base image, placed images, and image watermark. An oversized image or project reports an error.</dd></div>
            <div><dt>Copy and export</dt><dd>Copy PNG sends a flattened image to the clipboard. Export image downloads PNG or JPG at 1x or 2x; JPG offers a quality control.</dd></div>
            <div><dt>Overflow and transparency</dt><dd>View > Show overflow reveals off-canvas marks and expands exports. PNG keeps transparent areas; JPG fills them white.</dd></div>
            <div><dt>Preferences</dt><dd>File > Preferences stores measurement units, conversion resolution, and selection color in this browser; rulers and size fields use these units. Reset settings restores editor defaults without changing artwork.</dd></div>
          </dl>
          <div class="dialog-actions"><button value="close">Close</button></div>
        </form>
      </dialog>
      <dialog id="shortcuts-guide-dialog" class="guide-dialog" aria-labelledby="shortcuts-guide-title">
        <form method="dialog" class="dialog-form guide-dialog-content">
          <div class="dialog-heading"><h2 id="shortcuts-guide-title" tabindex="-1">Keyboard shortcuts</h2><p>Single-key tool shortcuts work only when the canvas has focus.</p></div>
          <dl class="help-settings">
            <div><dt>Tools</dt><dd>V Move, R Rectangle, O Ellipse, L Line, A Arrow, P Pen, H Highlighter, T Text, C Step counter, B Redact.</dd></div>
            <div><dt>Place and pan</dt><dd>On the focused canvas, Enter or Space places the active placement tool at the viewport center. Hold Space and drag to pan.</dd></div>
            <div><dt>Nudge and crop</dt><dd>Arrow keys move a selection or crop by 1 pixel; Shift+Arrow moves it by 10. Enter applies a crop; Escape cancels it or returns to Move.</dd></div>
            <div><dt>Layers and selection</dt><dd>Alt+ArrowUp or Alt+ArrowDown reorders a focused layer row. Ctrl/Cmd+D duplicates a selection; Delete or Backspace removes it.</dd></div>
            <div><dt>File and edit</dt><dd>Ctrl/Cmd+N new project, Ctrl/Cmd+O open image, Ctrl/Cmd+S save project, Ctrl/Cmd+E export, Ctrl/Cmd+C copy PNG, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo.</dd></div>
            <div><dt>View</dt><dd>Use the View menu to fit the image, show actual size, or turn Rulers on in the units chosen in Preferences. + and - zoom the focused canvas. The mouse wheel zooms at the pointer.</dd></div>
          </dl>
          <div class="dialog-actions"><button value="close">Close</button></div>
        </form>
      </dialog>
      <dialog id="preferences-dialog" aria-labelledby="preferences-title">
        <form method="dialog" class="dialog-form">
          <div class="dialog-heading"><h2 id="preferences-title">Preferences</h2><p>Customize measurements and canvas controls.</p></div>
          <label>Measurement units <select name="measurementUnit"><option value="px">Pixels</option><option value="in">Inches</option><option value="cm">Centimetres</option><option value="mm">Millimetres</option></select></label>
          <label data-preference="measurement-resolution" hidden>Conversion resolution <span class="input-with-unit"><input name="measurementPpi" type="number" min="36" max="1200" step="1" value="96"><span>ppi</span></span><small>Used to convert image pixels into physical measurements.</small></label>
          <label>Selection color <input name="selectionColor" type="color" value="#17c0b8"></label>
          ${colorPresets('selectionColor')}
          <div class="dialog-actions"><button value="cancel">Cancel</button><button value="apply">Save preferences</button></div>
        </form>
      </dialog>
      <dialog id="frame-dialog" aria-labelledby="frame-title">
        <form method="dialog" class="dialog-form">
          <div class="dialog-heading"><h2 id="frame-title">Frame and watermark</h2><p>Add a border or ownership mark to the export.</p></div>
          <label>Border width <input name="borderWidth" type="number" min="0" max="200" value="0"></label>
          <div class="size-presets" data-dialog-size-target="borderWidth" aria-label="Common border widths"><button type="button" data-value="0">None</button><button type="button" data-value="4">4</button><button type="button" data-value="8">8</button><button type="button" data-value="16">16</button><button type="button" data-value="32">32</button></div>
          <label>Border color <input name="borderColor" type="color" value="#12161f"></label>
          ${colorPresets('borderColor')}
          <label>Watermark text <input name="watermarkText" type="text" maxlength="1000"></label>
          <label>Watermark image <input name="watermarkImage" type="file" accept="image/*"></label>
          <label>Watermark font <select name="watermarkFont">${FONT_OPTIONS}</select></label>
          <div class="text-format-options watermark-format-options" aria-label="Watermark text formatting"><input name="watermarkBold" type="checkbox" hidden><input name="watermarkItalic" type="checkbox" hidden><button type="button" data-action="toggle-watermark-bold" aria-label="Bold watermark" aria-pressed="false"><strong>B</strong></button><button type="button" data-action="toggle-watermark-italic" aria-label="Italic watermark" aria-pressed="false"><em>I</em></button></div>
          <label>Watermark color <input name="watermarkColor" type="color" value="#ffffff"></label>
          ${colorPresets('watermarkColor')}
          <label>Watermark size <input name="watermarkSize" type="number" min="8" max="300" value="32"></label>
          <label>Watermark opacity <input name="watermarkOpacity" type="range" min="5" max="100" value="35"></label>
          <label>Image scale <input name="watermarkScale" type="range" min="5" max="100" value="25"></label>
          <label>Angle <span class="range-with-value"><input name="watermarkAngle" type="range" min="-180" max="180" value="-30"><output data-value="watermark-angle">-30°</output></span></label>
          <label class="check-label"><input name="watermarkTile" type="checkbox"> Tile watermark</label>
          <div class="dialog-actions split-actions"><button value="remove-watermark">Remove watermark</button><span></span><button value="cancel">Cancel</button><button value="apply">Apply</button></div>
        </form>
      </dialog>
      <dialog id="transform-dialog" aria-labelledby="transform-title">
        <form method="dialog" class="dialog-form">
          <div class="dialog-heading"><h2 id="transform-title">Image size and rotation</h2><p>Changes apply to the base image and all annotations.</p></div>
          <div class="transform-grid">
            <button value="rotate-left">Rotate left</button><button value="rotate-right">Rotate right</button>
            <button value="flip-horizontal">Flip horizontal</button><button value="flip-vertical">Flip vertical</button>
          </div>
          <label>Width <input name="resizeWidth" type="number" min="1" max="16384"></label>
          <label>Height <input name="resizeHeight" type="number" min="1" max="16384"></label>
          <label class="check-label"><input name="lockAspect" type="checkbox" checked> Lock aspect ratio</label>
          <div class="dialog-actions"><button value="cancel">Cancel</button><button value="resize">Resize</button></div>
        </form>
      </dialog>
    </div>`;

  const arrowHeadOptions = '<option value="none">None</option><option value="open">Open</option><option value="triangle">Triangle</option><option value="stealth">Stealth</option><option value="circle">Circle</option>';
  root.querySelector<HTMLElement>('[data-options="line-cap"]')!.insertAdjacentHTML('afterend', `<fieldset class="visual-options arrowhead-options" data-options="arrowheads"><legend>Arrowheads</legend><label>Start <select data-style="arrow-start">${arrowHeadOptions}</select></label><label>End <select data-style="arrow-end">${arrowHeadOptions}</select></label></fieldset>`);

  numericCompanion(root, '[data-style="letter-spacing"]', 'Letter spacing', 'presets', ['-50', '-25', '0', '25', '50', '100', '200']);
  numericCompanion(root, '[data-style="line-height"]', 'Line spacing', 'presets', ['0.8', '1', '1.2', '1.5', '2']);
  numericCompanion(root, '[data-style="counter-next"]', 'Next value', 'presets', ['1', '2', '3', '5', '10', '25', '50', '100']);
  numericCompanion(root, '[data-style="counter-value"]', 'Selected value', 'presets', ['1', '2', '3', '5', '10', '25', '50', '100']);
  const fontSizeInput = root.querySelector<HTMLInputElement>('[data-style="font-size"]')!;
  const fontSizeSelect = root.querySelector<HTMLSelectElement>('[data-style="font-size-preset"]')!;
  const fontSizeLabel = fontSizeSelect.closest('label')!;
  const fontSizePair = document.createElement('span');
  fontSizePair.className = 'numeric-pair';
  fontSizeInput.replaceWith(fontSizePair);
  fontSizePair.append(fontSizeInput, fontSizeSelect);
  fontSizeLabel.remove();
  for (const [key, label] of [['symbol-points', 'Points'], ['symbol-inner-ratio', 'Inner radius'], ['symbol-sides', 'Sides']] as const) {
    numericCompanion(root, `[data-style="${key}"]`, label, 'slider', [], key === 'symbol-inner-ratio' ? 100 : 1);
  }
  for (const [key, label] of [['width', 'Custom width'], ['opacity', 'Opacity'], ['counter-size', 'Shape size'], ['counter-font-size', 'Font size'], ['redaction-strength', 'Strength']] as const) {
    numericCompanion(root, `[data-style="${key}"]`, label, 'value');
  }
  numericCompanion(root, '[name="borderWidth"]', 'Border width', 'presets', ['0', '4', '8', '16', '32']);
  numericCompanion(root, '[name="watermarkSize"]', 'Watermark size', 'presets', ['16', '24', '32', '48', '72', '96']);
  numericCompanion(root, '[name="measurementPpi"]', 'Conversion resolution', 'presets', ['72', '96', '150', '300']);
  for (const [key, label] of [['watermarkOpacity', 'Watermark opacity'], ['watermarkScale', 'Image scale'], ['watermarkAngle', 'Angle'], ['quality', 'JPG quality']] as const) {
    numericCompanion(root, `[name="${key}"]`, label, 'value');
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-choice-for="symbol"] [data-value]')) {
    const name = button.dataset.value as SymbolName;
    const symbol = MATERIAL_SYMBOLS[name];
    if (!symbol) continue;
    button.innerHTML = materialSymbolPreview(name);
    button.setAttribute('aria-label', `${symbol.label} symbol`);
  }
  for (const group of ['line-cap', 'line-join']) {
    for (const button of root.querySelectorAll<HTMLButtonElement>(`[data-choice-for="${group}"] [data-value]`)) {
      const caption = document.createElement('span');
      caption.className = 'choice-caption';
      caption.textContent = button.dataset.value === 'butt'
        ? 'Butt'
        : `${button.dataset.value?.[0].toUpperCase()}${button.dataset.value?.slice(1)}`;
      button.classList.add('preview-choice');
      button.append(caption);
    }
  }

  return {
    stageHost: root.querySelector<HTMLElement>('#stage')!,
    statusEl: root.querySelector<HTMLElement>('#status')!,
  };
}
