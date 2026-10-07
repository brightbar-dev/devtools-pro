/** The gradient generator's escaped markup. Positions and colours are painted afterwards through CSSOM (a page's CSP can block `style` attributes). */

import { escapeHtml } from './dom';
import { gradientCss, gradientDeclaration, gradientTailwind, MAX_STOPS, MIN_STOPS, type GradientState, type GradientStop } from './gradient';

/** How a stop reads to a screen reader: "Stop 2 of 3, #ff0000 at 40%". */
export function stopLabel(state: GradientState, stop: GradientStop): string {
  const index = state.stops.findIndex(s => s.id === stop.id);
  return `Stop ${index + 1} of ${state.stops.length}`;
}

export function stopValueText(stop: GradientStop): string {
  return `${stop.color} at ${stop.pos}%`;
}

function handle(state: GradientState, stop: GradientStop): string {
  return `<div class="gr-handle" role="slider" tabindex="0" data-gr-handle="${stop.id}"`
    + ` aria-label="${escapeHtml(stopLabel(state, stop))}" aria-orientation="horizontal"`
    + ` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stop.pos}" aria-valuetext="${escapeHtml(stopValueText(stop))}"></div>`;
}

function row(state: GradientState, stop: GradientStop, selected: boolean): string {
  const label = stopLabel(state, stop);
  return `<div class="gr-stop${selected ? ' selected' : ''}" data-gr-row="${stop.id}" role="group" aria-label="${escapeHtml(label)}">`
    + `<input type="color" data-gr-color="${stop.id}" value="${escapeHtml(stop.color)}" aria-label="${escapeHtml(`${label} colour`)}">`
    + `<input type="number" min="0" max="100" step="1" data-gr-pos="${stop.id}" value="${stop.pos}" aria-label="${escapeHtml(`${label} position, percent`)}"><span class="gr-unit" aria-hidden="true">%</span>`
    + `<button type="button" data-gr-remove="${stop.id}" aria-label="${escapeHtml(`Remove ${label.toLowerCase()}`)}"`
    + `${state.stops.length <= MIN_STOPS ? ' disabled' : ''}>✕</button></div>`;
}

export function gradientFormHtml(state: GradientState, recent: readonly string[], selectedId: number): string {
  const linear = state.type === 'linear';
  const radio = (value: string, text: string) => `<label class="gr-radio"><input type="radio" name="gr-type" data-gr-type value="${value}"`
    + `${state.type === value ? ' checked' : ''}><span>${text}</span></label>`;
  const swatches = recent.length > 0
    ? '<div class="gr-recent" role="group" aria-label="Recent colours: apply to the selected stop">'
      + recent.map(hex => `<button type="button" class="gr-sw" data-gr-apply="${escapeHtml(hex)}" data-gr-chip="${escapeHtml(hex)}"`
        + ` title="${escapeHtml(`Use ${hex} for the selected stop`)}" aria-label="${escapeHtml(`Use ${hex} for the selected stop`)}"></button>`).join('')
      + '</div>'
    : '<p class="gr-note">Colours you pick with the eyedropper appear here.</p>';
  return '<div class="gradient-editor">'
    + '<div class="gr-preview" data-gr-preview role="img" aria-label="Gradient preview"></div>'
    + '<div class="gr-controls">'
    + `<fieldset class="gr-type"><legend>Type</legend>${radio('linear', 'Linear')}${radio('radial', 'Radial')}</fieldset>`
    + (linear
      ? '<div class="gr-angle"><label for="gr-angle-num">Angle</label>'
        + `<input id="gr-angle-num" type="number" min="0" max="360" step="1" data-gr-angle value="${state.angle}"><span class="gr-unit" aria-hidden="true">°</span>`
        + `<input type="range" min="0" max="360" step="1" data-gr-angle value="${state.angle}" aria-label="Angle slider, degrees"></div>`
      : '<div class="gr-angle"><label for="gr-shape">Shape</label>'
        + `<select id="gr-shape" data-gr-shape><option value="circle"${state.shape === 'circle' ? ' selected' : ''}>Circle</option>`
        + `<option value="ellipse"${state.shape === 'ellipse' ? ' selected' : ''}>Ellipse</option></select></div>`)
    + '</div>'
    + `<div class="gr-bar" data-gr-bar role="group" aria-label="Gradient stops">${state.stops.map(s => handle(state, s)).join('')}</div>`
    + '<p class="gr-note">Drag a handle or focus it and use ←/→ (Shift ×10), Home, End. Delete removes it. Double-click the bar to add a stop.</p>'
    + `<div class="gr-stops">${state.stops.map(s => row(state, s, s.id === selectedId)).join('')}</div>`
    + '<div class="gr-actions">'
    + `<button type="button" data-gr-add${state.stops.length >= MAX_STOPS ? ' disabled' : ''}>Add stop</button>`
    + '<button type="button" data-gr-pick>Pick from screen</button></div>'
    + swatches
    + `<pre class="code gr-code" data-gr-css>${escapeHtml(gradientDeclaration(state))}</pre>`
    + `<pre class="code gr-code" data-gr-tw>${escapeHtml(gradientTailwind(state))}</pre>`
    + '<div class="gr-actions">'
    + '<button type="button" data-gr-copy="css">Copy CSS</button><button type="button" data-gr-copy="tailwind">Copy Tailwind</button></div>'
    + '<div class="gr-status" data-gr-status role="status" aria-live="polite"></div>'
    + '</div>';
}

/** The `<image>` value for painting the preview (no `url(`, so safe to set through CSSOM). */
export function previewImage(state: GradientState): string {
  return gradientCss(state);
}

/** The stop bar always draws left to right, whatever the gradient's own geometry. */
export function barImage(state: GradientState): string {
  return gradientCss({ ...state, type: 'linear', angle: 90 });
}
