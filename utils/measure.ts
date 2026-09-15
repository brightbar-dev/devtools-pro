/** Measurement geometry: distance guides between two boxes and a dragged ruler. */

import type { Point, Rect } from './geometry';

export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  axis: 'x' | 'y';
  /** Length in CSS pixels. */
  length: number;
}

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

/** A length for a label: whole pixels, or one decimal when the value is fractional. */
export function formatLength(px: number): string {
  return `${Number(Math.abs(px).toFixed(1))}px`;
}

function horizontal(xa: number, xb: number, y: number): Guide {
  const [x1, x2] = xa <= xb ? [xa, xb] : [xb, xa];
  return { x1, y1: y, x2, y2: y, axis: 'x', length: x2 - x1 };
}

function vertical(ya: number, yb: number, x: number): Guide {
  const [y1, y2] = ya <= yb ? [ya, yb] : [yb, ya];
  return { x1: x, y1, x2: x, y2, axis: 'y', length: y2 - y1 };
}

/** Middle of the span two ranges share, or the middle of `b` when they share none. */
function sharedMiddle(a1: number, a2: number, b1: number, b2: number): number {
  const lo = Math.max(a1, b1);
  const hi = Math.min(a2, b2);
  return hi > lo ? (lo + hi) / 2 : (b1 + b2) / 2;
}

/**
 * Distance guides from an anchor box to a target box, drawn the way design tools do: the gap
 * between facing edges when the boxes are apart on an axis, and the inset between matching
 * edges when they overlap on it (including one inside the other). Zero-length guides are dropped.
 */
export function distanceGuides(anchor: Rect, target: Rect): Guide[] {
  const guides: Guide[] = [];
  const y = sharedMiddle(anchor.top, bottom(anchor), target.top, bottom(target));
  const x = sharedMiddle(anchor.left, right(anchor), target.left, right(target));

  if (right(target) <= anchor.left) guides.push(horizontal(right(target), anchor.left, y));
  else if (target.left >= right(anchor)) guides.push(horizontal(right(anchor), target.left, y));
  else {
    guides.push(horizontal(anchor.left, target.left, y));
    guides.push(horizontal(right(anchor), right(target), y));
  }

  if (bottom(target) <= anchor.top) guides.push(vertical(bottom(target), anchor.top, x));
  else if (target.top >= bottom(anchor)) guides.push(vertical(bottom(anchor), target.top, x));
  else {
    guides.push(vertical(anchor.top, target.top, x));
    guides.push(vertical(bottom(anchor), bottom(target), x));
  }

  return guides.filter(g => g.length >= 0.5);
}

/** The rectangle spanned by a drag, whichever direction it went. */
export function rulerRect(start: Point, end: Point): Rect {
  return {
    left: Math.min(start.left, end.left),
    top: Math.min(start.top, end.top),
    width: Math.abs(end.left - start.left),
    height: Math.abs(end.top - start.top),
  };
}

/** A drag counts as a measurement once it has moved this far; shorter is a click. */
export const DRAG_THRESHOLD = 4;

export function isDrag(start: Point, end: Point): boolean {
  return Math.abs(end.left - start.left) >= DRAG_THRESHOLD || Math.abs(end.top - start.top) >= DRAG_THRESHOLD;
}
