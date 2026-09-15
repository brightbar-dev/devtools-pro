/** Page colour palette: distinct colours from computed styles, grouped by role and counted. */

import { parseColor, toHex } from './colors';

export type ColorRole = 'background' | 'text' | 'border' | 'svg';

export interface ColorUse {
  role: ColorRole;
  /** A computed colour value, e.g. `rgb(224, 49, 49)`. */
  value: string;
}

export interface PaletteEntry {
  hex: string;
  count: number;
}

export interface PaletteGroup {
  role: ColorRole;
  label: string;
  colors: PaletteEntry[];
}

const ROLE_ORDER: ColorRole[] = ['background', 'text', 'border', 'svg'];
const ROLE_LABELS: Record<ColorRole, string> = {
  background: 'Backgrounds',
  text: 'Text',
  border: 'Borders',
  svg: 'SVG fill & stroke',
};

/** Group colour uses by role, merge equal colours, drop transparent ones, most used first. */
export function buildPalette(uses: ColorUse[], maxPerGroup = 48): PaletteGroup[] {
  const counts = new Map<ColorRole, Map<string, number>>();
  for (const use of uses) {
    const c = parseColor(use.value);
    if (!c || c.a === 0) continue;
    const hex = toHex(c);
    const roleCounts = counts.get(use.role) ?? new Map<string, number>();
    roleCounts.set(hex, (roleCounts.get(hex) ?? 0) + 1);
    counts.set(use.role, roleCounts);
  }
  return ROLE_ORDER.flatMap(role => {
    const roleCounts = counts.get(role);
    if (!roleCounts) return [];
    const colors = [...roleCounts.entries()]
      .map(([hex, count]) => ({ hex, count }))
      .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
      .slice(0, maxPerGroup);
    return [{ role, label: ROLE_LABELS[role], colors }];
  });
}

/** Every distinct colour across groups, most used first. */
export function uniqueColors(groups: PaletteGroup[]): PaletteEntry[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const { hex, count } of group.colors) totals.set(hex, (totals.get(hex) ?? 0) + count);
  }
  return [...totals.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

/** The palette as CSS custom properties, ready to paste into a stylesheet. */
export function paletteAsCss(groups: PaletteGroup[]): string {
  const lines = groups.flatMap(group =>
    group.colors.map((entry, i) => `  --${group.role}-${i + 1}: ${entry.hex}; /* ${entry.count} use${entry.count === 1 ? '' : 's'} */`));
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Put a picked colour at the front of the recent list, without duplicates. */
export function addRecentColor(recent: readonly string[], hex: string, max = 12): string[] {
  const normalized = hex.toLowerCase();
  return [normalized, ...recent.filter(h => h.toLowerCase() !== normalized)].slice(0, max);
}
