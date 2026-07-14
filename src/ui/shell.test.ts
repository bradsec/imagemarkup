// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderShell } from './shell';

describe('renderShell', () => {
  it('renders the version and repository link in the footer', () => {
    const root = document.createElement('div');
    renderShell(root);
    expect(root.querySelector('.app-version')?.textContent).toContain('v');
    const repoLink = root.querySelector<HTMLAnchorElement>('footer .repo-link');
    expect(repoLink?.href).toBe('https://github.com/bradsec/imagemarkup');
    expect(repoLink?.textContent).toBe('github.com/bradsec/imagemarkup');
    expect(repoLink?.getAttribute('aria-label')).toBe('imagemarkup on GitHub');
  });

  it('returns a stage host and status element', () => {
    const root = document.createElement('div');
    const { stageHost, statusEl } = renderShell(root);
    expect(stageHost).toBeTruthy();
    expect(statusEl).toBeTruthy();
    expect(stageHost.tabIndex).toBe(0);
    expect(stageHost.getAttribute('aria-describedby')).toBe('canvas-instructions');
  });

  it('keeps repository access in About and offers settings reset in File', () => {
    const root = document.createElement('div');
    renderShell(root);
    expect(root.querySelector('[data-action="reset-settings"]')).toBeTruthy();
    expect([...root.querySelectorAll('.app-menu')].find((menu) => menu.querySelector('summary')?.textContent === 'Help')?.textContent).not.toContain('GitHub repository');
    expect(root.querySelector('#about-dialog a[href="https://github.com/bradsec/imagemarkup"]')).toBeTruthy();
    expect(root.querySelector('.about-support-copy')?.textContent).toBe('Found imagemarkup useful? Support the creator.');
  });

  it('uses native disclosure and list semantics for composite controls', () => {
    const root = document.createElement('div');
    renderShell(root);
    expect(root.querySelectorAll('.menu-popover[role], .menu-popover [role]')).toHaveLength(0);
    expect(root.querySelector('[data-layers-list]')?.getAttribute('role')).toBe('list');
    expect(root.querySelector('[data-action="toggle-overflow"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('[data-choice-for="line-cap"] [data-value="square"] .preview-stroke')?.getAttribute('stroke-linecap')).toBe('square');
    expect(root.querySelector('[data-choice-for="line-cap"] [data-value="butt"] .preview-stroke')?.getAttribute('stroke-linecap')).toBe('butt');
    expect(root.querySelector('[data-choice-for="line-join"] [data-value="bevel"] .preview-stroke')?.getAttribute('stroke-linejoin')).toBe('bevel');
    expect([...root.querySelectorAll('[data-choice-for="line-cap"] .choice-caption')].map((caption) => caption.textContent)).toEqual(['Square', 'Round', 'Butt']);
    expect([...root.querySelectorAll('[data-choice-for="line-join"] .choice-caption')].map((caption) => caption.textContent)).toEqual(['Miter', 'Round', 'Bevel']);
  });

  it('renders the annotation tools', () => {
    const root = document.createElement('div');
    renderShell(root);
    expect([...root.querySelectorAll<HTMLButtonElement>('[data-tool]')].map((button) => button.dataset.tool))
      .toEqual(['select', 'pan', 'rect', 'ellipse', 'line', 'arrow', 'pen', 'highlighter', 'text', 'counter', 'symbol', 'redaction', 'crop', 'image']);
  });

  it('uses one consistent Material SVG treatment for every symbol choice', () => {
    const root = document.createElement('div');
    renderShell(root);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-choice-for="symbol"] button')];
    expect(buttons).toHaveLength(21);
    expect(buttons.map((button) => button.dataset.value)).not.toContain('hand-stop');
    expect(buttons.every((button) => button.children.length === 1 && button.firstElementChild?.matches('svg.symbol-preview'))).toBe(true);
    expect(buttons.every((button) => ['0 -960 960 960', '0 0 512 512'].includes(button.firstElementChild?.getAttribute('viewBox') ?? ''))).toBe(true);
  });

  it('shows the three corner-join shapes with a thick actual join', () => {
    const root = document.createElement('div');
    renderShell(root);
    const previews = [...root.querySelectorAll<SVGPathElement>('[data-choice-for="line-join"] .preview-stroke')];
    expect(previews.map((preview) => preview.getAttribute('stroke-linejoin'))).toEqual(['miter', 'round', 'bevel']);
    expect(new Set(previews.map((preview) => preview.getAttribute('d')))).toEqual(new Set(['M7 31 22 8l15 23']));
  });

  it('renders undo and redo controls', () => {
    const root = document.createElement('div');
    renderShell(root);
    expect(root.querySelector('[data-action="undo"]')).toBeTruthy();
    expect(root.querySelector('[data-action="redo"]')).toBeTruthy();
    expect(root.querySelector('[data-selection-size="width"]')).toBeTruthy();
    expect(root.querySelector('[data-selection-size="height"]')).toBeTruthy();
    expect(root.querySelector('[data-action="toggle-selection-aspect"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-action="copy"]')).toBeTruthy();
    expect(root.querySelector('[data-action="export"]')).toBeTruthy();
    expect(root.querySelector('[data-action="open-project"]')).toBeTruthy();
    expect(root.querySelector('[data-action="save-project"]')).toBeTruthy();
    expect(root.querySelector('#frame-dialog')).toBeTruthy();
    expect(root.querySelector('#transform-dialog')).toBeTruthy();
    expect(root.querySelector('#transform-dialog button[value="apply-crop"]')).toBeNull();
    expect(root.querySelector('#export-dialog')).toBeTruthy();
    expect(root.querySelector('#about-dialog')).toBeTruthy();
    expect(root.querySelector('[data-action="about"]')).toBeTruthy();
    expect(root.querySelector('[data-action="toggle-overflow"]')).toBeTruthy();
    expect(root.querySelector('#about-dialog a[href="https://github.com/bradsec/imagemarkup"]')).toBeTruthy();
    expect(root.querySelector('[data-value="jpg-quality"]')?.textContent).toBe('90%');
  });

  it('renders live style controls', () => {
    const root = document.createElement('div');
    renderShell(root);
    for (const control of ['color', 'fill', 'width', 'opacity', 'line-cap', 'line-join', 'symbol', 'font', 'font-size', 'counter-shape', 'counter-format', 'counter-next', 'counter-size', 'counter-font-size']) {
      expect(root.querySelector(`[data-style="${control}"]`), control).toBeTruthy();
    }
    expect([...root.querySelectorAll<HTMLOptionElement>('[data-style="arrow-start"] option')].map((option) => option.value)).toEqual(['none', 'open', 'triangle', 'stealth', 'circle']);
    expect([...root.querySelectorAll<HTMLOptionElement>('[data-style="arrow-end"] option')].map((option) => option.value)).toEqual(['none', 'open', 'triangle', 'stealth', 'circle']);
    expect(root.querySelector('[data-options-drag-handle]')).toBeTruthy();
    expect(root.querySelector('[data-layers-drag-handle]')).toBeTruthy();
    expect(root.querySelector('[data-action="toggle-layers-panel"]')).toBeTruthy();
    expect(root.querySelector('.optionsbar .layers-panel')).toBeNull();
    expect(root.querySelector('.editor > .layers-panel')).toBeTruthy();
    expect(root.querySelector('[data-rail-color="color"]')).toBeTruthy();
    expect(root.querySelector('[data-rail-color="fill"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Pick stroke color from image"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Pick fill color from image"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Toggle stroke"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Toggle fill"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Reset counter to one"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="Selected counter value"]')).toBeTruthy();
    const thicknessPresets = root.querySelectorAll('[data-size-presets="width"] [data-value]');
    expect(thicknessPresets).toHaveLength(5);
    expect([...thicknessPresets].map((element) => element.getAttribute('data-value'))).toEqual(['2', '6', '12', '24', '40']);
    const standardColors = root.querySelectorAll('[data-color-presets="color"] [data-color]');
    expect(standardColors).toHaveLength(12);
    expect([...standardColors].map((element) => element.getAttribute('data-color'))).toEqual([
      '#000000', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00',
      '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
    ]);
    expect(root.querySelectorAll('[data-color-presets="counter-text-color"] [data-color]')).toHaveLength(12);
    expect(root.querySelector('[data-color-target="counter-text-color"]')).toBeTruthy();
    expect(root.querySelector('[data-style="counter-fill"]')).toBeNull();
    expect(root.querySelector('[data-style="font"] option[value="Kalam"]')).toBeTruthy();
    expect(root.querySelectorAll('[data-style="font"] optgroup[label="Sans serif"] option')).toHaveLength(6);
    expect(root.querySelectorAll('[data-style="font-size-preset"] option')).toHaveLength(16);
    for (const label of ['Bold', 'Italic', 'Underline', 'Align left', 'Align center', 'Align right', 'Justify text']) expect(root.querySelector(`[aria-label="${label}"]`), label).toBeTruthy();
    expect(root.querySelector('#frame-dialog [name="watermarkColor"]')).toBeTruthy();
    expect(root.querySelector('#frame-dialog [name="watermarkAngle"]')).toBeTruthy();
    expect(root.querySelector('#frame-dialog [name="watermarkFont"] option[value="Poppins"]')).toBeTruthy();
    expect(root.querySelector('#frame-dialog [aria-label="Bold watermark"]')).toBeTruthy();
    expect(root.querySelector('#frame-dialog [aria-label="Italic watermark"]')).toBeTruthy();
    expect(root.querySelector('[data-action="preferences"]')).toBeTruthy();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1.brand')?.textContent).toContain('imagemarkup');
    expect(root.querySelector('#about-dialog a[href="https://buymeacoffee.com/markbradley"]')).toBeTruthy();
    expect(root.querySelector('.app-menu a[href="https://buymeacoffee.com/markbradley"]')).toBeNull();
    expect(root.querySelector('#preferences-dialog [name="measurementUnit"]')).toBeTruthy();
    expect(root.querySelector('#preferences-dialog [data-preference="measurement-resolution"]')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#preferences-dialog [name="selectionColor"]')).toBeTruthy();
    expect(root.querySelectorAll('[data-choice-for="symbol"] [data-value]')).toHaveLength(21);
    expect(root.querySelector('[data-choice-for="symbol"] [data-value="pin"][aria-label="Map marker symbol"]')).toBeTruthy();
    expect(root.querySelector('[data-choice-for="symbol"] [data-value="target"][aria-label="Target reticle symbol"]')).toBeTruthy();
    expect(root.querySelector('[data-choice-for="symbol"] [data-value="eye"] .symbol-preview')).toBeTruthy();
    expect(root.querySelector('[data-choice-for="symbol"] [data-value^="hand-"]')).toBeNull();
  });
});
