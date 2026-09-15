/** Colour panels that are not about a hovered element: a picked pixel and the page palette. */

import { contrastRatio, parseColor, type RGBA } from './colors';
import { colorEntry, type PanelBlock, type PanelModel } from './inspect';
import { paletteAsCss, uniqueColors, type PaletteGroup } from './palette';

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** A colour sampled with the eyedropper, in every format, with text contrast and recent picks. */
export function pickedColorModel(hex: string, recent: readonly string[]): PanelModel {
  const blocks: PanelBlock[] = [];
  const c = parseColor(hex);
  if (c) {
    blocks.push({ kind: 'colors', colors: [colorEntry('Picked', c)] });
    blocks.push({
      kind: 'rows',
      title: 'As a text colour',
      rows: [
        { label: 'on white', value: `${contrastRatio(c, WHITE).toFixed(2)}:1` },
        { label: 'on black', value: `${contrastRatio(c, BLACK).toFixed(2)}:1` },
      ],
    });
  } else {
    blocks.push({ kind: 'note', text: `Could not read the colour ${hex}` });
  }
  if (recent.length > 0) {
    blocks.push({ kind: 'swatches', title: 'Recent picks', swatches: recent.map(h => ({ color: h, label: h, copy: h })) });
  }
  return { toolId: 'color-picker', title: 'Eyedropper', path: [], blocks };
}

/** The page palette: swatches per role with use counts, and the whole set as CSS custom properties. */
export function paletteModel(groups: PaletteGroup[]): PanelModel {
  const unique = uniqueColors(groups);
  if (unique.length === 0) {
    return { toolId: 'color-picker', title: 'Page palette', path: [], blocks: [{ kind: 'note', text: 'No colours found on this page.' }] };
  }
  return {
    toolId: 'color-picker',
    title: 'Page palette',
    path: [],
    blocks: [
      {
        kind: 'rows',
        rows: [
          { label: 'Distinct colours', value: String(unique.length) },
          { label: 'Copy all', value: 'as CSS custom properties', copy: paletteAsCss(groups) },
        ],
      },
      ...groups.map((group): PanelBlock => ({
        kind: 'swatches',
        title: `${group.label} · ${group.colors.length}`,
        swatches: group.colors.map(entry => ({
          color: entry.hex,
          label: `${entry.hex} · ${entry.count} use${entry.count === 1 ? '' : 's'}`,
          copy: entry.hex,
          count: entry.count,
        })),
      })),
    ],
  };
}
