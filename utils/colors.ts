/** Color parsing, conversion, and contrast calculation. */

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface HSLA {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a: number; // 0-1
}

const NAMED_COLORS: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080',
  grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000',
  lime: '#00ff00', aqua: '#00ffff', teal: '#008080', navy: '#000080',
  fuchsia: '#ff00ff', coral: '#ff7f50', tomato: '#ff6347', gold: '#ffd700',
  wheat: '#f5deb3', khaki: '#f0e68c', salmon: '#fa8072', crimson: '#dc143c',
  indigo: '#4b0082', violet: '#ee82ee', plum: '#dda0dd', orchid: '#da70d6',
  chocolate: '#d2691e', sienna: '#a0522d', peru: '#cd853f', tan: '#d2b48c',
};

/** Parse any CSS color string to RGBA. Returns null if unparseable. */
export function parseColor(str: string): RGBA | null {
  if (!str || str === 'none') return null;
  const s = str.trim().toLowerCase();

  if (NAMED_COLORS[s]) return parseHex(NAMED_COLORS[s]);
  if (s.startsWith('#')) return parseHex(s);
  if (s.startsWith('rgb')) return parseRgb(s);
  if (s.startsWith('hsl')) return parseHsl(s);

  return null;
}

function parseHex(hex: string): RGBA | null {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number, a = 255;

  if (h.length === 3 || h.length === 4) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
    if (h.length === 4) a = parseInt(h[3] + h[3], 16);
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16);
  } else {
    return null;
  }

  if ([r, g, b, a].some(isNaN)) return null;
  return { r, g, b, a: a / 255 };
}

function parseRgb(str: string): RGBA | null {
  const match = str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (!match) return null;
  let a = 1;
  if (match[4]) {
    a = match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  }
  return { r: Math.round(+match[1]), g: Math.round(+match[2]), b: Math.round(+match[3]), a };
}

function parseHsl(str: string): RGBA | null {
  const match = str.match(/hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (!match) return null;
  const h = +match[1], s = +match[2] / 100, l = +match[3] / 100;
  let a = 1;
  if (match[4]) {
    a = match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  }
  const { r, g, b } = hslToRgbValues(h, s, l);
  return { r, g, b, a };
}

function hslToRgbValues(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function toHex(c: RGBA): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return c.a < 1
    ? `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${hex(Math.round(c.a * 255))}`
    : `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

export function toRgb(c: RGBA): string {
  return c.a < 1
    ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`
    : `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function toHsl(c: RGBA): string {
  const { h, s, l } = rgbToHsl(c);
  return c.a < 1
    ? `hsla(${h}, ${s}%, ${l}%, ${c.a})`
    : `hsl(${h}, ${s}%, ${l}%)`;
}

export function rgbToHsl(c: RGBA): HSLA {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100), a: c.a };
}

/** Relative luminance per WCAG 2.1 */
export function luminance(c: RGBA): number {
  const srgb = [c.r, c.g, c.b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** WCAG contrast ratio between two colors (1-21) */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG rating for a contrast ratio */
export function wcagRating(ratio: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

export function isTransparent(c: RGBA): boolean {
  return c.a === 0;
}
