/** The gradient generator's model: stops, CSS and Tailwind output, and the edits the editor makes. */

import { parseColor, toHex } from './colors';
import { arbitrary } from './tailwind';

export type GradientType = 'linear' | 'radial';
export type RadialShape = 'circle' | 'ellipse';

export interface GradientStop {
  /** Stable identity, so a stop keeps its focus and selection while it is dragged past another. */
  id: number;
  /** `#rrggbb`. */
  color: string;
  /** Position along the gradient line, 0–100 (%). */
  pos: number;
}

export interface GradientState {
  type: GradientType;
  /** Degrees, 0–359 (0 = to top, 90 = to right), for linear gradients. */
  angle: number;
  shape: RadialShape;
  /** Always sorted by position. */
  stops: GradientStop[];
  nextId: number;
}

export const MIN_STOPS = 2;
export const MAX_STOPS = 12;
const FALLBACK_COLORS = ['#4f46e5', '#06b6d4'] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampPos = (n: number) => (Number.isFinite(n) ? round1(Math.min(100, Math.max(0, n))) : 0);

/** A colour as `#rrggbb`, or null when it is not one the editor can use (alpha is dropped). */
export function normalizeHex(value: string): string | null {
  const c = parseColor(value);
  return c ? toHex({ ...c, a: 1 }) : null;
}

/** Stable sort by position (equal positions keep their order, so hard stops stay put). */
function sorted(stops: GradientStop[]): GradientStop[] {
  return stops.map((s, i) => ({ s, i })).sort((a, b) => a.s.pos - b.s.pos || a.i - b.i).map(x => x.s);
}

/** A two-stop gradient from the most recent picks, or from a pleasant default. */
export function defaultGradient(recent: readonly string[] = []): GradientState {
  const colors = recent.map(normalizeHex).filter((c): c is string => c !== null);
  const [a, b] = [colors[0] ?? FALLBACK_COLORS[0], colors[1] ?? FALLBACK_COLORS[1]];
  return {
    type: 'linear',
    angle: 90,
    shape: 'circle',
    stops: [{ id: 1, color: a, pos: 0 }, { id: 2, color: b, pos: 100 }],
    nextId: 3,
  };
}

/** The colour the gradient shows at `pos`, blended in sRGB the way CSS does between two stops. */
export function colorAt(stops: readonly GradientStop[], pos: number): string {
  const list = sorted([...stops]);
  const first = list[0];
  const last = list.at(-1);
  if (!first || !last) return FALLBACK_COLORS[0];
  if (pos <= first.pos) return first.color;
  if (pos >= last.pos) return last.color;
  const hi = list.findIndex(s => s.pos >= pos);
  const a = list[hi - 1]!;
  const b = list[hi]!;
  const t = b.pos === a.pos ? 0 : (pos - a.pos) / (b.pos - a.pos);
  const ca = parseColor(a.color)!;
  const cb = parseColor(b.color)!;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return toHex({ r: mix(ca.r, cb.r), g: mix(ca.g, cb.g), b: mix(ca.b, cb.b), a: 1 });
}

/** The middle of the widest gap between stops (or between the ends and the edges), for "Add stop". */
export function widestGapMiddle(stops: readonly GradientStop[]): number {
  const edges = [0, ...sorted([...stops]).map(s => s.pos), 100];
  let best = { size: -1, mid: 50 };
  for (let i = 1; i < edges.length; i++) {
    const size = edges[i]! - edges[i - 1]!;
    if (size > best.size) best = { size, mid: (edges[i]! + edges[i - 1]!) / 2 };
  }
  return clampPos(best.mid);
}

/** Add a stop at `pos` with the colour the gradient already shows there; null when full. */
export function addStop(state: GradientState, pos: number, color?: string): { state: GradientState; id: number } | null {
  if (state.stops.length >= MAX_STOPS) return null;
  const at = clampPos(pos);
  const stop: GradientStop = { id: state.nextId, color: normalizeHex(color ?? '') ?? colorAt(state.stops, at), pos: at };
  return { state: { ...state, stops: sorted([...state.stops, stop]), nextId: state.nextId + 1 }, id: stop.id };
}

/** Remove a stop; a gradient keeps at least two. */
export function removeStop(state: GradientState, id: number): GradientState {
  if (state.stops.length <= MIN_STOPS || !state.stops.some(s => s.id === id)) return state;
  return { ...state, stops: state.stops.filter(s => s.id !== id) };
}

export function moveStop(state: GradientState, id: number, pos: number): GradientState {
  const at = clampPos(pos);
  return { ...state, stops: sorted(state.stops.map(s => (s.id === id ? { ...s, pos: at } : s))) };
}

export function setStopColor(state: GradientState, id: number, color: string): GradientState {
  const hex = normalizeHex(color);
  if (!hex) return state;
  return { ...state, stops: state.stops.map(s => (s.id === id ? { ...s, color: hex } : s)) };
}

export function setAngle(state: GradientState, angle: number): GradientState {
  const a = Number.isFinite(angle) ? Math.round(angle) : state.angle;
  return { ...state, angle: ((a % 360) + 360) % 360 };
}

export function setType(state: GradientState, type: GradientType): GradientState {
  return { ...state, type };
}

export function setShape(state: GradientState, shape: RadialShape): GradientState {
  return { ...state, shape };
}

/** What a stop-handle key does: a new position, or a removal. Null for keys it ignores. */
export function stopKey(key: string, shift: boolean, pos: number): { pos: number } | { remove: true } | null {
  const step = shift ? 10 : 1;
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return { pos: clampPos(pos + step) };
    case 'ArrowLeft': case 'ArrowDown': return { pos: clampPos(pos - step) };
    case 'PageUp': return { pos: clampPos(pos + 10) };
    case 'PageDown': return { pos: clampPos(pos - 10) };
    case 'Home': return { pos: 0 };
    case 'End': return { pos: 100 };
    case 'Delete': case 'Backspace': return { remove: true };
    default: return null;
  }
}

const stopList = (state: GradientState) => sorted(state.stops).map(s => `${s.color} ${s.pos}%`).join(', ');

/** The gradient as a CSS `<image>`: `linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%)`. */
export function gradientCss(state: GradientState): string {
  const head = state.type === 'linear' ? `${state.angle}deg` : state.shape;
  return `${state.type}-gradient(${head}, ${stopList(state)})`;
}

/** The declaration to paste into a rule. */
export function gradientDeclaration(state: GradientState): string {
  return `background-image: ${gradientCss(state)};`;
}

/** A Tailwind arbitrary value: `bg-[linear-gradient(90deg,#4f46e5_0%,#06b6d4_100%)]`. */
export function gradientTailwind(state: GradientState): string {
  return `bg-[${arbitrary(gradientCss(state))}]`;
}
