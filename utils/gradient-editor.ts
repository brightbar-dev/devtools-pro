/**
 * The gradient generator's behaviour, mounted into an element of the inspector's shadow root.
 * State changes that keep an element alive (dragging, arrow keys, typing) update the DOM in place so
 * pointer capture and focus survive; structural changes (add, remove, type) re-render and put focus back.
 */

import {
  addStop, defaultGradient, moveStop, removeStop, setAngle, setShape, setStopColor, setType, stopKey, widestGapMiddle,
  gradientDeclaration, gradientTailwind, type GradientState, type RadialShape,
} from './gradient';
import { barImage, gradientFormHtml, previewImage, stopLabel, stopValueText } from './gradient-form';

export interface GradientHooks {
  /** Recently picked colours, newest first. */
  recent: string[];
  copy(text: string): Promise<boolean>;
  /** Sample a pixel with the eyedropper; null when unavailable or cancelled. */
  pick(): Promise<{ hex: string; recent: string[] } | null>;
}

export function mountGradientEditor(container: HTMLElement, hooks: GradientHooks, initial?: GradientState): { state: () => GradientState } {
  let state = initial ?? defaultGradient(hooks.recent);
  let recent = hooks.recent;
  let selected = state.stops[0]!.id;
  let dragging: { id: number; pointer: number } | null = null;
  let orderChanged = false;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel);
  const $$ = <T extends HTMLElement>(sel: string) => Array.from(container.querySelectorAll<T>(sel));
  const idOf = (el: Element | null, attr: string): number | null => {
    const raw = el?.closest<HTMLElement>(`[${attr}]`)?.getAttribute(attr);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const orderKey = () => state.stops.map(s => s.id).join(',');

  function status(text: string) {
    const el = $('[data-gr-status]');
    if (el) el.textContent = text;
  }

  /** Apply positions, colours and the preview. All through CSSOM. */
  function paint() {
    const preview = $('[data-gr-preview]');
    if (preview) preview.style.backgroundImage = previewImage(state);
    const bar = $('[data-gr-bar]');
    if (bar) bar.style.backgroundImage = barImage(state);
    for (const stop of state.stops) {
      const h = $(`[data-gr-handle="${stop.id}"]`);
      if (!h) continue;
      h.style.left = `${stop.pos}%`;
      h.style.backgroundColor = stop.color;
      h.classList.toggle('selected', stop.id === selected);
      h.setAttribute('aria-label', stopLabel(state, stop));
      h.setAttribute('aria-valuenow', String(stop.pos));
      h.setAttribute('aria-valuetext', stopValueText(stop));
    }
    for (const chip of $$('[data-gr-chip]')) chip.style.backgroundColor = chip.dataset.grChip ?? '';
    for (const row of $$('[data-gr-row]')) row.classList.toggle('selected', Number(row.dataset.grRow) === selected);
    const css = $('[data-gr-css]');
    if (css) css.textContent = gradientDeclaration(state);
    const tw = $('[data-gr-tw]');
    if (tw) tw.textContent = gradientTailwind(state);
  }

  /** In-place update after a change that keeps the elements: refresh inputs that are not being typed in. */
  function sync() {
    paint();
    const active = container.getRootNode() instanceof ShadowRoot ? (container.getRootNode() as ShadowRoot).activeElement : null;
    for (const stop of state.stops) {
      const color = $<HTMLInputElement>(`[data-gr-color="${stop.id}"]`);
      if (color && color !== active) color.value = stop.color;
      const pos = $<HTMLInputElement>(`[data-gr-pos="${stop.id}"]`);
      if (pos && pos !== active) pos.value = String(stop.pos);
    }
    for (const input of $$<HTMLInputElement>('[data-gr-angle]')) if (input !== active) input.value = String(state.angle);
  }

  function render(focus?: string) {
    container.innerHTML = gradientFormHtml(state, recent, selected);
    paint();
    orderChanged = false;
    if (focus) $<HTMLElement>(focus)?.focus();
  }

  function select(id: number) {
    if (selected === id) return;
    selected = id;
    paint();
  }

  function apply(next: GradientState, focus?: string) {
    state = next;
    render(focus);
  }

  function posFromPointer(e: PointerEvent): number {
    const bar = $('[data-gr-bar]');
    const rect = bar?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(((e.clientX - rect.left) / rect.width) * 100);
  }

  function removeAndFocus(id: number) {
    const before = state.stops.findIndex(s => s.id === id);
    const next = removeStop(state, id);
    if (next === state) {
      status('A gradient needs at least two stops.');
      return;
    }
    const neighbour = next.stops[Math.min(before, next.stops.length - 1)]!;
    selected = neighbour.id;
    apply(next, `[data-gr-handle="${neighbour.id}"]`);
    status(`Stop removed. ${next.stops.length} stops.`);
  }

  function addAt(pos: number) {
    const added = addStop(state, pos);
    if (!added) {
      status('That is the most stops this editor adds.');
      return;
    }
    selected = added.id;
    apply(added.state, `[data-gr-handle="${added.id}"]`);
    status(`Stop added at ${pos}%. ${added.state.stops.length} stops.`);
  }

  // ── Pointer: drag a handle, double-click the bar to add ─────────────────

  container.addEventListener('pointerdown', e => {
    const handle = (e.target as Element | null)?.closest<HTMLElement>('[data-gr-handle]');
    if (!handle || e.button !== 0) return;
    const id = Number(handle.dataset.grHandle);
    e.preventDefault(); // no text selection while dragging
    select(id);
    handle.focus();
    handle.setPointerCapture(e.pointerId);
    dragging = { id, pointer: e.pointerId };
  });

  container.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== dragging.pointer) return;
    state = moveStop(state, dragging.id, posFromPointer(e));
    orderChanged ||= orderKey() !== $$('[data-gr-handle]').map(h => h.dataset.grHandle).join(',');
    sync();
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointer) return;
    const { id } = dragging;
    dragging = null;
    render(`[data-gr-handle="${id}"]`); // sort the rows into position order
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  container.addEventListener('dblclick', e => {
    const target = e.target as Element | null;
    if (!target?.closest('[data-gr-bar]') || target.closest('[data-gr-handle]')) return;
    const rect = $('[data-gr-bar]')!.getBoundingClientRect();
    addAt(rect.width ? Math.round(((e.clientX - rect.left) / rect.width) * 100) : 50);
  });

  // ── Keyboard on a stop handle ────────────────────────────────────────────

  container.addEventListener('keydown', e => {
    const handle = (e.target as Element | null)?.closest<HTMLElement>('[data-gr-handle]');
    if (!handle || e.ctrlKey || e.metaKey || e.altKey) return;
    const id = Number(handle.dataset.grHandle);
    const stop = state.stops.find(s => s.id === id);
    const action = stop && stopKey(e.key, e.shiftKey, stop.pos);
    if (!stop || !action) return;
    e.preventDefault();
    e.stopPropagation();
    if ('remove' in action) {
      removeAndFocus(id);
      return;
    }
    const before = orderKey();
    state = moveStop(state, id, action.pos);
    orderChanged ||= orderKey() !== before;
    sync();
  });

  container.addEventListener('keyup', e => {
    if (orderChanged && (e.target as Element | null)?.closest('[data-gr-handle]')) {
      const id = idOf(e.target as Element, 'data-gr-handle');
      render(id === null ? undefined : `[data-gr-handle="${id}"]`);
    }
  });

  // ── Form controls ───────────────────────────────────────────────────────

  container.addEventListener('focusin', e => {
    const id = idOf(e.target as Element, 'data-gr-handle') ?? idOf(e.target as Element, 'data-gr-row');
    if (id !== null) select(id);
  });

  container.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    const colorId = idOf(t, 'data-gr-color');
    const posId = idOf(t, 'data-gr-pos');
    if (colorId !== null && t.matches('[data-gr-color]')) {
      state = setStopColor(state, colorId, t.value);
      sync();
    } else if (posId !== null && t.matches('[data-gr-pos]')) {
      if (t.value.trim() === '' || !Number.isFinite(Number(t.value))) return;
      state = moveStop(state, posId, Number(t.value));
      sync();
    } else if (t.matches('[data-gr-angle]')) {
      state = setAngle(state, Number(t.value));
      sync();
    }
  });

  container.addEventListener('change', e => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const posId = idOf(t, 'data-gr-pos');
    if (posId !== null && t.matches('[data-gr-pos]')) {
      render(`[data-gr-pos="${posId}"]`); // sorted into place, value normalised
    } else if (t.matches('[data-gr-type]')) {
      apply(setType(state, (t as HTMLInputElement).value === 'radial' ? 'radial' : 'linear'), `[data-gr-type][value="${(t as HTMLInputElement).value}"]`);
    } else if (t.matches('[data-gr-shape]')) {
      apply(setShape(state, t.value as RadialShape), '[data-gr-shape]');
    } else if (t.matches('[data-gr-angle]')) {
      sync();
    }
  });

  container.addEventListener('click', e => {
    const t = e.target as Element | null;
    if (!t) return;
    const remove = t.closest<HTMLElement>('[data-gr-remove]');
    if (remove) return removeAndFocus(Number(remove.dataset.grRemove));
    if (t.closest('[data-gr-add]')) return addAt(widestGapMiddle(state.stops));
    const applyBtn = t.closest<HTMLElement>('[data-gr-apply]');
    if (applyBtn?.dataset.grApply) {
      state = setStopColor(state, selected, applyBtn.dataset.grApply);
      sync();
      status(`Stop colour set to ${applyBtn.dataset.grApply}.`);
      return;
    }
    const copyBtn = t.closest<HTMLElement>('[data-gr-copy]');
    if (copyBtn) {
      const css = copyBtn.dataset.grCopy === 'css';
      void hooks.copy(css ? gradientDeclaration(state) : gradientTailwind(state)).then(ok => status(ok ? `Copied ${css ? 'CSS' : 'Tailwind class'}.` : 'Copy blocked by this page.'));
      return;
    }
    if (t.closest('[data-gr-pick]')) {
      void hooks.pick().then(result => {
        if (!result) {
          status('The eyedropper is not available here, or was cancelled.');
          return;
        }
        recent = result.recent;
        state = setStopColor(state, selected, result.hex);
        render(`[data-gr-handle="${selected}"]`);
        status(`Stop colour set to ${result.hex}.`);
      });
    }
  });

  render();
  return { state: () => state };
}
