/** Geometry for drawn overlays: box-model regions, grid tracks, gaps and areas, flex gaps. */

import type { Rect } from './geometry';
import type { BoxSides } from './spacing';

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

function inset(r: Rect, s: BoxSides): Rect {
  return { left: r.left + s.left, top: r.top + s.top, width: Math.max(0, r.width - s.left - s.right), height: Math.max(0, r.height - s.top - s.bottom) };
}

function outset(r: Rect, s: BoxSides): Rect {
  return { left: r.left - s.left, top: r.top - s.top, width: r.width + s.left + s.right, height: r.height + s.top + s.bottom };
}

/** The four bands between an outer and an inner rect: top and bottom full width, left and right between them. */
export function ringBands(outer: Rect, inner: Rect): Rect[] {
  const bands: Rect[] = [
    { left: outer.left, top: outer.top, width: outer.width, height: inner.top - outer.top },
    { left: outer.left, top: bottom(inner), width: outer.width, height: bottom(outer) - bottom(inner) },
    { left: outer.left, top: inner.top, width: inner.left - outer.left, height: inner.height },
    { left: right(inner), top: inner.top, width: right(outer) - right(inner), height: inner.height },
  ];
  return bands.filter(b => b.width > 0 && b.height > 0);
}

export interface BoxRegions {
  margin: Rect[];
  padding: Rect[];
  content: Rect;
}

/** Margin and padding bands and the content box, as Chrome DevTools tints them. Negative margins draw nothing. */
export function boxRegions(borderBox: Rect, box: { margin: BoxSides; border: BoxSides; padding: BoxSides }): BoxRegions {
  const positive = (s: BoxSides): BoxSides => ({ top: Math.max(0, s.top), right: Math.max(0, s.right), bottom: Math.max(0, s.bottom), left: Math.max(0, s.left) });
  const paddingBox = inset(borderBox, box.border);
  const content = inset(paddingBox, box.padding);
  return {
    margin: ringBands(outset(borderBox, positive(box.margin)), borderBox),
    padding: ringBands(paddingBox, content),
    content,
  };
}

/** Track sizes from a computed `grid-template-columns`/`-rows` value, e.g. `"[full] 200px 1fr"` resolves to px in Chrome. */
export function parseTrackList(value: string): number[] {
  if (!value || value === 'none') return [];
  const tracks: number[] = [];
  for (const token of value.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/)) {
    const n = parseFloat(token);
    if (token.endsWith('px') && Number.isFinite(n)) tracks.push(n);
  }
  return tracks;
}

/** Rows of area names from a computed `grid-template-areas` value such as `"a a b" "c c b"`. */
export function parseAreas(value: string): string[][] {
  if (!value || value === 'none') return [];
  return [...value.matchAll(/"([^"]*)"/g)].map(m => m[1]!.trim().split(/\s+/));
}

/** Where the first track starts and how much extra space follows each gap, for a content-distribution keyword. */
export function distribute(free: number, count: number, mode: string): { offset: number; extraGap: number } {
  const space = Math.max(0, free);
  switch (mode) {
    case 'end':
    case 'flex-end':
    case 'right':
      return { offset: free, extraGap: 0 };
    case 'center':
      return { offset: free / 2, extraGap: 0 };
    case 'space-between':
      return { offset: 0, extraGap: count > 1 ? space / (count - 1) : 0 };
    case 'space-around':
      return { offset: count > 0 ? space / count / 2 : 0, extraGap: count > 0 ? space / count : 0 };
    case 'space-evenly':
      return { offset: space / (count + 1), extraGap: space / (count + 1) };
    default:
      return { offset: 0, extraGap: 0 };
  }
}

export interface GridInput {
  content: Rect;
  columns: number[];
  rows: number[];
  columnGap: number;
  rowGap: number;
  justifyContent: string;
  alignContent: string;
  areas: string;
}

export interface GridOverlay {
  columns: Rect[];
  rows: Rect[];
  columnGaps: Rect[];
  rowGaps: Rect[];
  areas: Array<Rect & { name: string }>;
}

function trackStarts(start: number, sizes: number[], gap: number, extraGap: number): number[] {
  const starts: number[] = [];
  let pos = start;
  for (const size of sizes) {
    starts.push(pos);
    pos += size + gap + extraGap;
  }
  return starts;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Column and row tracks, the gaps between them, and named areas, in viewport coordinates. */
export function gridOverlay(input: GridInput): GridOverlay {
  const { content, columns, rows } = input;
  const usedWidth = sum(columns) + input.columnGap * Math.max(0, columns.length - 1);
  const usedHeight = sum(rows) + input.rowGap * Math.max(0, rows.length - 1);
  const h = distribute(content.width - usedWidth, columns.length, input.justifyContent);
  const v = distribute(content.height - usedHeight, rows.length, input.alignContent);
  const colStarts = trackStarts(content.left + h.offset, columns, input.columnGap, h.extraGap);
  const rowStarts = trackStarts(content.top + v.offset, rows, input.rowGap, v.extraGap);
  const gridTop = rowStarts[0] ?? content.top;
  const gridLeft = colStarts[0] ?? content.left;
  const gridHeight = rows.length ? rowStarts[rows.length - 1]! + rows[rows.length - 1]! - gridTop : content.height;
  const gridWidth = columns.length ? colStarts[columns.length - 1]! + columns[columns.length - 1]! - gridLeft : content.width;

  const overlay: GridOverlay = { columns: [], rows: [], columnGaps: [], rowGaps: [], areas: [] };
  columns.forEach((size, i) => {
    overlay.columns.push({ left: colStarts[i]!, top: gridTop, width: size, height: gridHeight });
    const next = colStarts[i + 1];
    if (next !== undefined && next > colStarts[i]! + size) overlay.columnGaps.push({ left: colStarts[i]! + size, top: gridTop, width: next - colStarts[i]! - size, height: gridHeight });
  });
  rows.forEach((size, i) => {
    overlay.rows.push({ left: gridLeft, top: rowStarts[i]!, width: gridWidth, height: size });
    const next = rowStarts[i + 1];
    if (next !== undefined && next > rowStarts[i]! + size) overlay.rowGaps.push({ left: gridLeft, top: rowStarts[i]! + size, width: gridWidth, height: next - rowStarts[i]! - size });
  });

  const bounds = new Map<string, { c1: number; c2: number; r1: number; r2: number }>();
  parseAreas(input.areas).forEach((cells, r) => cells.forEach((name, c) => {
    if (name === '.' || /^\.+$/.test(name)) return;
    const b = bounds.get(name);
    bounds.set(name, b ? { c1: Math.min(b.c1, c), c2: Math.max(b.c2, c), r1: Math.min(b.r1, r), r2: Math.max(b.r2, r) } : { c1: c, c2: c, r1: r, r2: r });
  }));
  for (const [name, b] of bounds) {
    const left = colStarts[b.c1];
    const top = rowStarts[b.r1];
    const endCol = colStarts[b.c2];
    const endRow = rowStarts[b.r2];
    if (left === undefined || top === undefined || endCol === undefined || endRow === undefined) continue;
    overlay.areas.push({ name, left, top, width: endCol + columns[b.c2]! - left, height: endRow + rows[b.r2]! - top });
  }
  return overlay;
}

/** Bands between consecutive flex items along the main axis, spanning both items across it. */
export function flexGaps(items: Rect[], direction: string): Rect[] {
  const column = direction.startsWith('column');
  const sorted = [...items].sort((a, b) => (column ? a.top - b.top : a.left - b.left));
  const gaps: Rect[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (column) {
      const top = bottom(a);
      const height = b.top - top;
      const left = Math.min(a.left, b.left);
      if (height > 0) gaps.push({ left, top, width: Math.max(right(a), right(b)) - left, height });
    } else {
      const left = right(a);
      const width = b.left - left;
      const top = Math.min(a.top, b.top);
      if (width > 0) gaps.push({ left, top, width, height: Math.max(bottom(a), bottom(b)) - top });
    }
  }
  return gaps;
}
