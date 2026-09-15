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
  if (s.startsWith('oklch(')) return parseOklch(s);
  if (s.startsWith('oklab(')) return parseOklab(s);
  if (s.startsWith('lch(')) return parseLch(s);
  if (s.startsWith('lab(')) return parseLab(s);
  if (s.startsWith('color(')) return parseColorFunction(s);

  return null;
}

/** Components and alpha of a modern color function such as `oklch(0.63 0.26 29 / 0.5)`. */
function functionArgs(str: string): { parts: string[]; alpha: number } | null {
  const inner = str.match(/^[a-z-]+\((.*)\)$/)?.[1];
  if (inner === undefined) return null;
  const [main = '', alphaPart] = inner.split('/');
  const parts = main.trim().split(/[\s,]+/).filter(Boolean);
  const alpha = alphaPart === undefined ? 1 : component(alphaPart.trim(), 1);
  return Number.isFinite(alpha) ? { parts, alpha: Math.min(1, Math.max(0, alpha)) } : null;
}

/** A number, a percentage of `percentOf`, or `none` (zero). */
function component(value: string | undefined, percentOf: number): number {
  if (value === undefined) return NaN;
  if (value === 'none') return 0;
  return value.endsWith('%') ? (parseFloat(value) / 100) * percentOf : parseFloat(value);
}

function hue(value: string | undefined): number {
  if (value === undefined) return NaN;
  if (value === 'none') return 0;
  const n = parseFloat(value);
  if (value.endsWith('rad')) return (n * 180) / Math.PI;
  if (value.endsWith('turn')) return n * 360;
  if (value.endsWith('grad')) return n * 0.9;
  return n;
}

const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** Linear-light sRGB (0–1, possibly out of gamut) to clamped 8-bit RGBA. */
function fromLinearSrgb(r: number, g: number, b: number, a: number): RGBA | null {
  if (![r, g, b].every(Number.isFinite)) return null;
  const to8 = (v: number) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255);
  return { r: to8(r), g: to8(g), b: to8(b), a };
}

function fromXyzD65(x: number, y: number, z: number, a: number): RGBA | null {
  return fromLinearSrgb(
    3.2409699419045226 * x - 1.5373831775700939 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
    a,
  );
}

function fromOklab(L: number, A: number, B: number, alpha: number): RGBA | null {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return fromLinearSrgb(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    alpha,
  );
}

/** CIE Lab (D50, as CSS defines it) to sRGB via XYZ and a Bradford adaptation to D65. */
function fromLab(L: number, A: number, B: number, alpha: number): RGBA | null {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const xr = fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * epsilon ? fy ** 3 : L / kappa;
  const zr = fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa;
  const x = xr * 0.9642956764;
  const y = yr;
  const z = zr * 0.8251046025;
  return fromXyzD65(
    0.955473421488075 * x - 0.02309845494876471 * y + 0.06325924320057072 * z,
    -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z,
    0.012314014864481998 * x - 0.020507649298898964 * y + 1.330365926242124 * z,
    alpha,
  );
}

function parseOklch(str: string): RGBA | null {
  const args = functionArgs(str);
  if (!args) return null;
  const [l, c, h] = args.parts;
  const L = component(l, 1);
  const C = component(c, 0.4);
  const H = (hue(h) * Math.PI) / 180;
  return fromOklab(L, C * Math.cos(H), C * Math.sin(H), args.alpha);
}

function parseOklab(str: string): RGBA | null {
  const args = functionArgs(str);
  if (!args) return null;
  const [l, a, b] = args.parts;
  return fromOklab(component(l, 1), component(a, 0.4), component(b, 0.4), args.alpha);
}

function parseLab(str: string): RGBA | null {
  const args = functionArgs(str);
  if (!args) return null;
  const [l, a, b] = args.parts;
  return fromLab(component(l, 100), component(a, 125), component(b, 125), args.alpha);
}

function parseLch(str: string): RGBA | null {
  const args = functionArgs(str);
  if (!args) return null;
  const [l, c, h] = args.parts;
  const C = component(c, 150);
  const H = (hue(h) * Math.PI) / 180;
  return fromLab(component(l, 100), C * Math.cos(H), C * Math.sin(H), args.alpha);
}

/** `color(srgb …)`, `color(srgb-linear …)` and `color(display-p3 …)`; other spaces are not parsed. */
function parseColorFunction(str: string): RGBA | null {
  const args = functionArgs(str);
  if (!args) return null;
  const [space, ...rest] = args.parts;
  const [r, g, b] = rest.map(v => component(v, 1));
  if (r === undefined || g === undefined || b === undefined) return null;
  if (space === 'srgb') return fromLinearSrgb(toLinear(r), toLinear(g), toLinear(b), args.alpha);
  if (space === 'srgb-linear') return fromLinearSrgb(r, g, b, args.alpha);
  if (space === 'display-p3') {
    const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
    return fromXyzD65(
      0.4865709486482162 * lr + 0.26566769316909306 * lg + 0.1982172852343625 * lb,
      0.2289745640697488 * lr + 0.6917385218365064 * lg + 0.079286914093745 * lb,
      0.04511338185890264 * lg + 1.043944368900976 * lb,
      args.alpha,
    );
  }
  return null;
}

/** Paint `fg` over `bg` (source-over compositing). */
export function compositeOver(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (f: number, b: number) => Math.round((f * fg.a + b * bg.a * (1 - fg.a)) / a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: Math.round(a * 1000) / 1000 };
}

/** Format as CSS `oklch()`, e.g. `oklch(62.8% 0.258 29.2)`. */
export function toOklch(c: RGBA): string {
  const [r, g, b] = [c.r, c.g, c.b].map(v => toLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  const H = C < 0.0005 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));
  const body = `${trim(L * 100, 1)}% ${trim(C < 0.0005 ? 0 : C, 3)} ${trim(H, 1)}`;
  return c.a < 1 ? `oklch(${body} / ${trim(c.a, 3)})` : `oklch(${body})`;
}

function parseHex(hex: string): RGBA | null {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number, a = 255;

  if (h.length === 3 || h.length === 4) {
    r = parseInt(h.charAt(0).repeat(2), 16);
    g = parseInt(h.charAt(1).repeat(2), 16);
    b = parseInt(h.charAt(2).repeat(2), 16);
    if (h.length === 4) a = parseInt(h.charAt(3).repeat(2), 16);
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
  return { r: Math.round(Number(match[1])), g: Math.round(Number(match[2])), b: Math.round(Number(match[3])), a };
}

function parseHsl(str: string): RGBA | null {
  const match = str.match(/hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (!match) return null;
  const h = Number(match[1]), s = Number(match[2]) / 100, l = Number(match[3]) / 100;
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
  const linear = (channel: number) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
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
