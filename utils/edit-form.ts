/** The Live Edit form: what it shows for an element, and its escaped markup. */

import { parseColor, toHex } from './colors';
import { escapeHtml } from './dom';
import { TEXT_PROP } from './edits';

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export interface EditFormState {
  selector: string;
  /** Text content, or null when the element holds other elements (text editing would destroy them). */
  text: string | null;
  margin: number[];
  padding: number[];
  color: string;
  background: string;
  backgroundTransparent: boolean;
  fontSize: number;
  canUndo: boolean;
  canRedo: boolean;
  changes: number;
}

/** A computed colour as `#rrggbb` for `<input type="color">`, which has no alpha. */
export function toColorInput(value: string): string {
  const c = parseColor(value);
  return c ? toHex({ ...c, a: 1 }) : '#000000';
}

/** The CSS value an input's raw value stands for. Numbers are pixels; empty clears the edit. */
export function editValue(prop: string, raw: string): string {
  if (prop === TEXT_PROP) return raw;
  if (prop === 'color' || prop === 'background-color') return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : '';
  const n = parseFloat(raw);
  return raw.trim() === '' || !Number.isFinite(n) ? '' : `${Math.round(n * 100) / 100}px`;
}

const round = (n: number) => String(Math.round(n * 100) / 100);

function sideInputs(prefix: 'margin' | 'padding', values: number[]): string {
  return SIDES.map((side, i) => `<label class="ef-side"><span>${side[0]!.toUpperCase()}</span>`
    + `<input type="number" step="1" data-edit="${prefix}-${side}" value="${round(values[i] ?? 0)}" aria-label="${prefix} ${side}"${prefix === 'padding' ? ' min="0"' : ''}></label>`).join('');
}

export function editFormHtml(s: EditFormState): string {
  const text = s.text === null
    ? '<p class="ef-note">This element contains other elements, so its text is not editable here.</p>'
    : `<label class="ef-row ef-text"><span>Text</span><textarea data-edit="${TEXT_PROP}" rows="2" aria-label="Text">${escapeHtml(s.text)}</textarea></label>`;
  return '<div class="edit-form">'
    + text
    + `<div class="ef-row"><span>Margin</span><div class="ef-sides">${sideInputs('margin', s.margin)}</div></div>`
    + `<div class="ef-row"><span>Padding</span><div class="ef-sides">${sideInputs('padding', s.padding)}</div></div>`
    + '<div class="ef-row ef-colors">'
    + `<label><span>Text colour</span><input type="color" data-edit="color" value="${escapeHtml(s.color)}"></label>`
    + `<label><span>Background${s.backgroundTransparent ? ' (none)' : ''}</span><input type="color" data-edit="background-color" value="${escapeHtml(s.background)}"></label>`
    + `<label><span>Font size</span><input type="number" min="1" step="1" data-edit="font-size" value="${round(s.fontSize)}" aria-label="Font size in pixels"></label>`
    + '</div>'
    + '<div class="ef-actions">'
    + `<button type="button" data-edit-action="undo"${s.canUndo ? '' : ' disabled'} title="Undo (⌘Z / Ctrl+Z)">Undo</button>`
    + `<button type="button" data-edit-action="redo"${s.canRedo ? '' : ' disabled'} title="Redo (⇧⌘Z / Ctrl+Y)">Redo</button>`
    + '<button type="button" data-edit-action="reset-element">Reset element</button>'
    + `<button type="button" data-edit-action="reset-all"${s.changes > 0 ? '' : ' disabled'}>Reset all</button>`
    + `<button type="button" data-edit-action="copy"${s.changes > 0 ? '' : ' disabled'}>Copy changes as CSS</button>`
    + '<button type="button" data-edit-action="done">Done</button>'
    + '</div>'
    + `<p class="ef-note">${s.changes} change${s.changes === 1 ? '' : 's'} on this page · edits stay until you reload</p>`
    + '</div>';
}
