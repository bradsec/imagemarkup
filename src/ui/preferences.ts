import { DEFAULT_SELECTION_COLOR } from '../render/renderer';
import type { Scene } from '../core/types';
import type { Store } from '../state/store';

export type MeasurementUnit = 'px' | 'in' | 'cm' | 'mm';

export interface EditorPreferences {
  measurementUnit: MeasurementUnit;
  measurementPpi: number;
  selectionColor: string;
  showRulers: boolean;
}

export const DEFAULT_PREFERENCES: EditorPreferences = { measurementUnit: 'px', measurementPpi: 96, selectionColor: DEFAULT_SELECTION_COLOR, showRulers: false };

export function readPreferences(): EditorPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('imagemarkup.preferences') ?? '{}') as Partial<EditorPreferences>;
    return {
      measurementUnit: ['px', 'in', 'cm', 'mm'].includes(String(value.measurementUnit)) ? value.measurementUnit as MeasurementUnit : 'px',
      measurementPpi: Number.isFinite(value.measurementPpi) ? Math.max(36, Math.min(1200, Math.round(value.measurementPpi!))) : 96,
      selectionColor: typeof value.selectionColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.selectionColor) ? value.selectionColor : DEFAULT_SELECTION_COLOR,
      showRulers: value.showRulers === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(preferences: EditorPreferences): void {
  try { localStorage.setItem('imagemarkup.preferences', JSON.stringify(preferences)); } catch { /* Preferences still apply for this session. */ }
}

export function mountPreferences(root: HTMLElement, store: Store<Scene>, statusEl: HTMLElement, openDialog: (dialog: HTMLDialogElement, invoker: HTMLElement) => void, setPreferences: (value: EditorPreferences) => void, getPreferences: () => EditorPreferences): void {
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
    const preferences = getPreferences();
    measurementUnitInput.value = preferences.measurementUnit;
    measurementPpiInput.value = String(preferences.measurementPpi);
    selectionColorInput.value = preferences.selectionColor;
    syncPreferenceInputs();
    openDialog(preferencesDialog, event.currentTarget as HTMLElement);
  });
  preferencesDialog.addEventListener('close', () => {
    if (preferencesDialog.returnValue !== 'apply') return;
    const preferences = {
      ...getPreferences(),
      measurementUnit: measurementUnitInput.value as MeasurementUnit,
      measurementPpi: Math.max(36, Math.min(1200, Math.round(Number(measurementPpiInput.value) || 96))),
      selectionColor: selectionColorInput.value,
    };
    setPreferences(preferences);
    writePreferences(preferences);
    store.set({});
    statusEl.textContent = 'Preferences saved';
  });
}
