/** Box model measurement utilities. */

export interface BoxModel {
  content: { width: number; height: number };
  padding: BoxSides;
  border: BoxSides;
  margin: BoxSides;
}

export interface BoxSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Parse a CSS px value to number. Returns 0 for non-px values. */
export function parsePx(value: string): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

/** Format number as px string, omitting unit for 0. */
export function formatPx(value: number): string {
  return value === 0 ? '0' : `${value}px`;
}

/** Check if all sides are equal. */
export function sidesEqual(sides: BoxSides): boolean {
  return sides.top === sides.right && sides.right === sides.bottom && sides.bottom === sides.left;
}

/** Format box sides as shorthand. */
export function formatSides(sides: BoxSides): string {
  const { top, right, bottom, left } = sides;
  if (top === right && right === bottom && bottom === left) return formatPx(top);
  if (top === bottom && right === left) return `${formatPx(top)} ${formatPx(right)}`;
  if (right === left) return `${formatPx(top)} ${formatPx(right)} ${formatPx(bottom)}`;
  return `${formatPx(top)} ${formatPx(right)} ${formatPx(bottom)} ${formatPx(left)}`;
}

/** Total box dimension including padding, border, margin. */
export function totalWidth(box: BoxModel): number {
  return box.content.width
    + box.padding.left + box.padding.right
    + box.border.left + box.border.right
    + box.margin.left + box.margin.right;
}

export function totalHeight(box: BoxModel): number {
  return box.content.height
    + box.padding.top + box.padding.bottom
    + box.border.top + box.border.bottom
    + box.margin.top + box.margin.bottom;
}
