/** Viewport geometry: rectangles, frame offsets, and floating-panel placement. */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  left: number;
  top: number;
}

export function toRect(r: Rect): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height };
}

/**
 * Where a frame's viewport starts inside its parent's viewport: the frame element's
 * border-box position plus its border and padding.
 */
export function frameContentOffset(
  frameRect: Point,
  border: Point,
  padding: Point,
): { dx: number; dy: number } {
  return { dx: frameRect.left + border.left + padding.left, dy: frameRect.top + border.top + padding.top };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export function sameRect(a: Rect | null, b: Rect | null, epsilon = 0.5): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) <= epsilon && Math.abs(a.top - b.top) <= epsilon
    && Math.abs(a.width - b.width) <= epsilon && Math.abs(a.height - b.height) <= epsilon;
}

/**
 * Place a floating panel near a target without covering it (or anything in `avoid`, such as the
 * tool bar). Tries below, above, right and
 * left of the target (kept inside the viewport) and takes the first spot that fits and does
 * not overlap the target; when none does, takes the viewport corner that covers it least.
 */
export function placePanel(target: Rect, panel: Size, viewport: Size, gap = 8, margin = 8, avoid: Rect[] = []): Point {
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
  const maxTop = Math.max(margin, viewport.height - panel.height - margin);
  const clampLeft = (x: number) => Math.min(Math.max(x, margin), maxLeft);
  const clampTop = (y: number) => Math.min(Math.max(y, margin), maxTop);

  const beside: Point[] = [
    { left: clampLeft(target.left), top: target.top + target.height + gap },
    { left: clampLeft(target.left), top: target.top - panel.height - gap },
    { left: target.left + target.width + gap, top: clampTop(target.top) },
    { left: target.left - panel.width - gap, top: clampTop(target.top) },
  ];
  const fits = (p: Point) => p.left >= margin && p.top >= margin
    && p.left + panel.width <= viewport.width - margin && p.top + panel.height <= viewport.height - margin;
  const clear = (p: Point) => overlapArea({ ...p, ...panel }, target) === 0 && avoid.every(a => overlapArea({ ...p, ...panel }, a) === 0);
  for (const p of beside) {
    if (fits(p) && clear(p)) return p;
  }

  const corners: Point[] = [
    { left: maxLeft, top: maxTop },
    { left: margin, top: maxTop },
    { left: maxLeft, top: margin },
    { left: margin, top: margin },
  ];
  let best = corners[0]!;
  let bestArea = Infinity;
  for (const p of corners) {
    const area = overlapArea({ ...p, ...panel }, target) + avoid.reduce((sum, a) => sum + overlapArea({ ...p, ...panel }, a), 0);
    if (area < bestArea) {
      best = p;
      bestArea = area;
    }
  }
  return best;
}
