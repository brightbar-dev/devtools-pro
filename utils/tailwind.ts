/** Best-effort conversion of computed CSS declarations into Tailwind utility classes. */

import { isDefaultValue } from './css';

export interface Declaration { prop: string; value: string }
export interface TailwindResult { classes: string[]; unmapped: Declaration[] }

interface Ctx {
  values: Map<string, string>;
  classes: string[];
  /** Props consumed: mapped to a class or recognised as a default. */
  seen: Set<string>;
  /** Props recognised but whose value could not be mapped. */
  failed: Set<string>;
}

type Handler = (ctx: Ctx) => void;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_ABBR = ['t', 'r', 'b', 'l'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
const CORNER_ABBR = ['tl', 'tr', 'br', 'bl'] as const;

// ---------------------------------------------------------------------------
// Value helpers

/** Format a CSS value for use inside Tailwind square brackets (spaces become underscores). */
export function arbitrary(value: string): string {
  return value
    .trim()
    .replace(/_/g, '\\_')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, '_');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse `16px` / `-12.5px` / `0` to a number, or null for anything else. */
function parsePx(value: string): number | null {
  if (value === '0') return 0;
  const m = /^(-?\d*\.?\d+)px$/.exec(value);
  return m && m[1] !== undefined ? parseFloat(m[1]) : null;
}

/** Parse `50%` to a number, or null. */
function parsePercent(value: string): number | null {
  const m = /^(-?\d*\.?\d+)%$/.exec(value);
  return m && m[1] !== undefined ? parseFloat(m[1]) : null;
}

function isZero(value: string): boolean {
  return parsePx(value) === 0 || parsePercent(value) === 0;
}

/** Tailwind spacing scale keyed by px. */
const SPACING: Record<string, string> = {
  '0': '0', '1': 'px', '2': '0.5', '4': '1', '6': '1.5', '8': '2', '10': '2.5',
  '12': '3', '14': '3.5', '16': '4', '20': '5', '24': '6', '28': '7', '32': '8',
  '36': '9', '40': '10', '44': '11', '48': '12', '56': '14', '64': '16', '80': '20',
  '96': '24', '112': '28', '128': '32', '144': '36', '160': '40', '176': '44',
  '192': '48', '208': '52', '224': '56', '240': '60', '256': '64', '288': '72',
  '320': '80', '384': '96',
};

/** Spacing-scale class for a px or % length (`mt-4`, `-mt-2`, `mt-[13px]`, `w-full`), or null. */
function spacingClass(prefix: string, value: string): string | null {
  const px = parsePx(value);
  if (px !== null) {
    const token = SPACING[String(Math.abs(px))];
    if (token !== undefined) return `${px < 0 ? '-' : ''}${prefix}-${token}`;
    return `${prefix}-[${round2(px)}px]`;
  }
  const pct = parsePercent(value);
  if (pct !== null) return pct === 100 ? `${prefix}-full` : `${prefix}-[${round2(pct)}%]`;
  return null;
}

/** Colour suffix for `text-` / `bg-` / `border-`: `white`, `[#e03131]`, `[rgba(...)]`, or null. */
function colorToken(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return 'transparent';
  if (v === 'currentcolor') return 'current';
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.exec(v);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a === 0) return 'transparent';
    if (a < 1) return `[rgba(${r},${g},${b},${a})]`;
    if (r === 255 && g === 255 && b === 255) return 'white';
    if (r === 0 && g === 0 && b === 0) return 'black';
    return `[#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}]`;
  }
  if (/^#[0-9a-f]{3,8}$/.test(v)) return `[${v}]`;
  if (/^[a-z-]+\(.*\)$/.test(v)) return `[${arbitrary(v)}]`;
  return null;
}

// ---------------------------------------------------------------------------
// Defaults

const ZERO = ['0px', '0'];

/** Initial values not covered by `isDefaultValue` in ./css. */
const EXTRA_DEFAULTS: Record<string, string[]> = {
  top: ['auto'], right: ['auto'], bottom: ['auto'], left: ['auto'],
  width: ['auto'], height: ['auto'],
  'min-width': ['auto', ...ZERO], 'min-height': ['auto', ...ZERO],
  'max-width': ['none'], 'max-height': ['none'],
  margin: ZERO, 'margin-top': ZERO, 'margin-right': ZERO, 'margin-bottom': ZERO, 'margin-left': ZERO,
  padding: ZERO, 'padding-top': ZERO, 'padding-right': ZERO, 'padding-bottom': ZERO, 'padding-left': ZERO,
  'background-color': ['rgba(0, 0, 0, 0)', 'transparent'],
  'font-weight': ['400', 'normal'],
  'line-height': ['normal'],
  'align-self': ['normal'],
  'grid-template-columns': ['none'], 'grid-template-rows': ['none'], 'grid-template-areas': ['none'],
  'grid-column': ['auto', 'auto / auto'], 'grid-row': ['auto', 'auto / auto'],
  'grid-column-start': ['auto'], 'grid-column-end': ['auto'],
  'grid-row-start': ['auto'], 'grid-row-end': ['auto'],
  'grid-area': ['auto', 'auto / auto / auto / auto'],
  'grid-auto-columns': ['auto'], 'grid-auto-rows': ['auto'],
  'border-radius': ZERO,
  'border-top-left-radius': ZERO, 'border-top-right-radius': ZERO,
  'border-bottom-right-radius': ZERO, 'border-bottom-left-radius': ZERO,
  'text-decoration-line': ['none'], 'text-decoration-style': ['solid'],
  transform: ['matrix(1, 0, 0, 1, 0, 0)'],
  flex: ['0 1 auto'],
};

/** Values `isDefaultValue` treats as defaults that are explicit choices worth a class here. */
const NOT_DEFAULT: Record<string, string[]> = {
  'justify-content': ['flex-start'],
};

/** Shorthands that are fully represented when their longhands are also present. */
const SHORTHANDS: Record<string, string[]> = {
  margin: SIDES.map(s => `margin-${s}`),
  padding: SIDES.map(s => `padding-${s}`),
  inset: [...SIDES],
  gap: ['row-gap', 'column-gap'],
  overflow: ['overflow-x', 'overflow-y'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  'grid-column': ['grid-column-start', 'grid-column-end'],
  'grid-row': ['grid-row-start', 'grid-row-end'],
  'border-radius': CORNERS.map(c => `border-${c}-radius`),
  'border-width': SIDES.map(s => `border-${s}-width`),
  'border-style': SIDES.map(s => `border-${s}-style`),
  'border-color': SIDES.map(s => `border-${s}-color`),
  'text-decoration': ['text-decoration-line'],
};

function isDefault(prop: string, value: string): boolean {
  const v = value.replace(/\s+/g, ' ');
  if (NOT_DEFAULT[prop]?.includes(v)) return false;
  return isDefaultValue(prop, v) || (EXTRA_DEFAULTS[prop]?.includes(v) ?? false);
}

// ---------------------------------------------------------------------------
// Context helpers

/** Read a declaration and mark it consumed. */
function take(ctx: Ctx, prop: string): string | undefined {
  const value = ctx.values.get(prop);
  if (value !== undefined) ctx.seen.add(prop);
  return value;
}

function emit(ctx: Ctx, ...classes: Array<string | null | undefined>): void {
  for (const c of classes) if (c) ctx.classes.push(c);
}

function fail(ctx: Ctx, prop: string): void {
  ctx.failed.add(prop);
}

/** Map a single keyword-valued property through a lookup table; defaults skip, unknowns fail. */
function keyword(ctx: Ctx, prop: string, table: Record<string, string>): void {
  const value = take(ctx, prop);
  if (value === undefined || isDefault(prop, value)) return;
  const cls = table[value];
  if (cls === undefined) fail(ctx, prop);
  else emit(ctx, cls);
}

/** Split a 1-4 value box shorthand into [top, right, bottom, left]. */
function expandSides(value: string): string[] | null {
  const parts = value.split(/\s+/);
  const [a, b = a, c = a, d = b] = parts;
  if (parts.length > 4 || a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

// ---------------------------------------------------------------------------
// Layout

const DISPLAY: Record<string, string> = {
  block: 'block', 'inline-block': 'inline-block', inline: 'inline', flex: 'flex',
  'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid',
  contents: 'contents', table: 'table', 'table-row': 'table-row', 'table-cell': 'table-cell',
  'list-item': 'list-item', 'flow-root': 'flow-root', none: 'hidden',
};

const POSITION: Record<string, string> = {
  relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky',
};

const OVERFLOW = new Set(['visible', 'hidden', 'clip', 'scroll', 'auto']);

function inset(ctx: Ctx): void {
  const values = SIDES.map(side => take(ctx, side));
  take(ctx, 'inset');
  if (values.every(v => v !== undefined && isZero(v))) {
    emit(ctx, 'inset-0');
    return;
  }
  SIDES.forEach((side, i) => {
    const value = values[i];
    if (value === undefined || isDefault(side, value)) return;
    const cls = spacingClass(side, value);
    if (cls) emit(ctx, cls);
    else fail(ctx, side);
  });
}

function zIndex(ctx: Ctx): void {
  const value = take(ctx, 'z-index');
  if (value === undefined || isDefault('z-index', value)) return;
  if (!/^-?\d+$/.test(value)) fail(ctx, 'z-index');
  else emit(ctx, ['0', '10', '20', '30', '40', '50'].includes(value) ? `z-${value}` : `z-[${value}]`);
}

function overflow(ctx: Ctx): void {
  const short = take(ctx, 'overflow')?.split(/\s+/);
  const x = take(ctx, 'overflow-x') ?? short?.[0];
  const y = take(ctx, 'overflow-y') ?? short?.[1] ?? short?.[0];
  const bad = [x, y].some(v => v !== undefined && !OVERFLOW.has(v));
  if (bad) {
    for (const p of ['overflow', 'overflow-x', 'overflow-y']) if (ctx.values.has(p)) fail(ctx, p);
    return;
  }
  if (x !== undefined && x === y) {
    if (x !== 'visible') emit(ctx, `overflow-${x}`);
    return;
  }
  if (x !== undefined && x !== 'visible') emit(ctx, `overflow-x-${x}`);
  if (y !== undefined && y !== 'visible') emit(ctx, `overflow-y-${y}`);
}

// ---------------------------------------------------------------------------
// Flexbox

function flexGrowShrink(ctx: Ctx, prop: 'flex-grow' | 'flex-shrink', name: 'grow' | 'shrink'): void {
  const value = take(ctx, prop);
  if (value === undefined || isDefault(prop, value)) return;
  if (!/^\d*\.?\d+$/.test(value)) return fail(ctx, prop);
  if (name === 'grow' && value === '1') emit(ctx, 'grow');
  else if (name === 'shrink' && value === '0') emit(ctx, 'shrink-0');
  else emit(ctx, `${name}-[${value}]`);
}

function flexBasis(ctx: Ctx): void {
  const value = take(ctx, 'flex-basis');
  if (value === undefined || isDefault('flex-basis', value)) return;
  const cls = isZero(value) ? 'basis-0' : spacingClass('basis', value);
  if (cls) emit(ctx, cls);
  else fail(ctx, 'flex-basis');
}

function order(ctx: Ctx): void {
  const value = take(ctx, 'order');
  if (value === undefined || isDefault('order', value)) return;
  if (!/^-?\d+$/.test(value)) return fail(ctx, 'order');
  const n = Number(value);
  if (n === -9999) emit(ctx, 'order-first');
  else if (n === 9999) emit(ctx, 'order-last');
  else emit(ctx, n >= 1 && n <= 12 ? `order-${n}` : `order-[${n}]`);
}

const HANDLERS_FLEX: Handler[] = [
  ctx => keyword(ctx, 'flex-direction', {
    column: 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse',
  }),
  ctx => keyword(ctx, 'flex-wrap', { wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse' }),
  ctx => keyword(ctx, 'justify-content', {
    'flex-start': 'justify-start', start: 'justify-start', 'flex-end': 'justify-end',
    end: 'justify-end', center: 'justify-center', 'space-between': 'justify-between',
    'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
  }),
  ctx => keyword(ctx, 'align-items', {
    'flex-start': 'items-start', start: 'items-start', 'flex-end': 'items-end',
    end: 'items-end', center: 'items-center', baseline: 'items-baseline',
  }),
  ctx => keyword(ctx, 'align-content', {
    center: 'content-center', 'flex-start': 'content-start', 'flex-end': 'content-end',
    'space-between': 'content-between', 'space-around': 'content-around',
    'space-evenly': 'content-evenly',
  }),
  ctx => keyword(ctx, 'align-self', {
    'flex-start': 'self-start', start: 'self-start', 'flex-end': 'self-end',
    end: 'self-end', center: 'self-center', stretch: 'self-stretch', baseline: 'self-baseline',
  }),
  ctx => flexGrowShrink(ctx, 'flex-grow', 'grow'),
  ctx => flexGrowShrink(ctx, 'flex-shrink', 'shrink'),
  flexBasis,
  order,
];

// ---------------------------------------------------------------------------
// Grid

function gridTemplate(ctx: Ctx, prop: string, prefix: 'grid-cols' | 'grid-rows'): void {
  const value = take(ctx, prop);
  if (value === undefined || isDefault(prop, value)) return;
  const repeat = /^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)\s*\)$/.exec(value);
  if (repeat) emit(ctx, `${prefix}-${repeat[1]}`);
  else if (value === 'subgrid') emit(ctx, `${prefix}-subgrid`);
  else emit(ctx, `${prefix}-[${arbitrary(value)}]`);
}

/** `span N`, an integer line, or `auto`; null when unrecognised (named lines etc.). */
function parseLine(token: string): { span?: number; line?: number } | null {
  if (token === 'auto') return {};
  const span = /^span\s+(\d+)$/.exec(token);
  if (span) return { span: Number(span[1]) };
  return /^-?\d+$/.test(token) ? { line: Number(token) } : null;
}

function gridLine(ctx: Ctx, axis: 'column' | 'row', prefix: 'col' | 'row'): void {
  const shorthand = `grid-${axis}`;
  const startProp = `${shorthand}-start`;
  const endProp = `${shorthand}-end`;
  const short = take(ctx, shorthand);
  const startLong = take(ctx, startProp);
  const endLong = take(ctx, endProp);
  const [shortStart, shortEnd] = short?.split('/').map(s => s.trim()) ?? [];
  const start = parseLine(startLong ?? shortStart ?? 'auto');
  const end = parseLine(endLong ?? shortEnd ?? 'auto');
  if (!start || !end) {
    for (const p of [shorthand, startProp, endProp]) if (ctx.values.has(p)) fail(ctx, p);
    return;
  }
  const span = start.span ?? end.span;
  if (start.line === 1 && end.line === -1) return emit(ctx, `${prefix}-span-full`);
  if (start.line !== undefined) emit(ctx, `${prefix}-start-${start.line}`);
  if (span !== undefined) emit(ctx, span <= 12 ? `${prefix}-span-${span}` : `${prefix}-span-[${span}]`);
  if (end.line !== undefined) emit(ctx, `${prefix}-end-${end.line}`);
}

const HANDLERS_GRID: Handler[] = [
  ctx => gridTemplate(ctx, 'grid-template-columns', 'grid-cols'),
  ctx => gridTemplate(ctx, 'grid-template-rows', 'grid-rows'),
  ctx => keyword(ctx, 'grid-auto-flow', {
    column: 'grid-flow-col', dense: 'grid-flow-dense', 'row dense': 'grid-flow-row-dense',
    'column dense': 'grid-flow-col-dense',
  }),
  ctx => gridLine(ctx, 'column', 'col'),
  ctx => gridLine(ctx, 'row', 'row'),
];

// ---------------------------------------------------------------------------
// Spacing

/** Class for one margin/padding value, e.g. `mx-auto`, `-mt-2`, `pl-[13px]`; null when unmappable. */
function boxClass(prefix: string, value: string): string | null {
  if (value === 'auto') return prefix.startsWith('m') ? `${prefix}-auto` : null;
  return spacingClass(prefix, value);
}

function boxSides(ctx: Ctx, prop: 'margin' | 'padding'): void {
  const base = prop === 'margin' ? 'm' : 'p';
  const longhands = SIDES.map(side => take(ctx, `${prop}-${side}`));
  const short = take(ctx, prop);
  const useShort = longhands.every(v => v === undefined);
  if (useShort && short === undefined) return;
  const expanded = useShort && short !== undefined ? expandSides(short) : null;
  if (useShort && !expanded) return fail(ctx, prop);
  const values = SIDES.map((_, i) => {
    const v = (useShort ? expanded?.[i] : longhands[i]) ?? '0px';
    return isZero(v) ? '0px' : v;
  });
  const [t, r, b, l] = values;
  const valid = values.every(v => isZero(v) || boxClass(base, v) !== null);

  if (valid && t === r && r === b && b === l) {
    if (t !== undefined && !isZero(t)) emit(ctx, boxClass(base, t));
  } else if (valid && t === b && r === l) {
    if (r !== undefined && !isZero(r)) emit(ctx, boxClass(`${base}x`, r));
    if (t !== undefined && !isZero(t)) emit(ctx, boxClass(`${base}y`, t));
  } else {
    values.forEach((value, i) => {
      if (isZero(value)) return;
      const cls = boxClass(`${base}${SIDE_ABBR[i]}`, value);
      if (cls) emit(ctx, cls);
      else fail(ctx, useShort ? prop : `${prop}-${SIDES[i]}`);
    });
  }
}

function gap(ctx: Ctx): void {
  const short = take(ctx, 'gap')?.split(/\s+/);
  const row = take(ctx, 'row-gap') ?? short?.[0];
  const col = take(ctx, 'column-gap') ?? short?.[1] ?? short?.[0];
  const skip = (v: string | undefined): boolean => v === undefined || v === 'normal' || isZero(v);
  if (row === col && !skip(row) && row !== undefined) {
    const cls = spacingClass('gap', row);
    if (cls) return emit(ctx, cls);
  }
  const pairs: Array<[string | undefined, string, string]> = [[col, 'gap-x', 'column-gap'], [row, 'gap-y', 'row-gap']];
  for (const [value, prefix, prop] of pairs) {
    if (skip(value) || value === undefined) continue;
    const cls = spacingClass(prefix, value);
    if (cls) emit(ctx, cls);
    else fail(ctx, ctx.values.has(prop) ? prop : 'gap');
  }
}

// ---------------------------------------------------------------------------
// Sizing

const SIZE_KEYWORDS: Record<string, string> = {
  'fit-content': 'fit', 'min-content': 'min', 'max-content': 'max',
};

function size(ctx: Ctx, prop: string, prefix: string): void {
  const value = take(ctx, prop);
  if (value === undefined || isDefault(prop, value)) return;
  const isMinMax = prefix.includes('-');
  const keywordToken = SIZE_KEYWORDS[value];
  let cls: string | null = null;
  if (keywordToken) cls = `${prefix}-${keywordToken}`;
  else if (value === '100vw' && prefix === 'w') cls = 'w-screen';
  else if (value === '100vh' && (prefix === 'h' || prefix === 'min-h')) cls = `${prefix}-screen`;
  else if (value === '100%') cls = `${prefix}-full`;
  else if (isMinMax && parsePx(value) !== null) cls = `${prefix}-[${round2(parsePx(value) ?? 0)}px]`;
  else if (/^\d*\.?\d+(vw|vh|rem|em)$/.test(value)) cls = `${prefix}-[${value}]`;
  else cls = spacingClass(prefix, value);
  if (cls) emit(ctx, cls);
  else fail(ctx, prop);
}

// ---------------------------------------------------------------------------
// Typography

const FONT_SIZE: Record<string, string> = {
  '12': 'xs', '14': 'sm', '16': 'base', '18': 'lg', '20': 'xl', '24': '2xl', '30': '3xl',
  '36': '4xl', '48': '5xl', '60': '6xl', '72': '7xl', '96': '8xl', '128': '9xl',
};

const FONT_WEIGHT: Record<string, string> = {
  '100': 'thin', '200': 'extralight', '300': 'light', '500': 'medium', '600': 'semibold',
  '700': 'bold', bold: 'bold', '800': 'extrabold', '900': 'black',
};

const LEADING: Record<string, string> = {
  '12': '3', '16': '4', '20': '5', '24': '6', '28': '7', '32': '8', '36': '9', '40': '10',
};

function fontFamily(ctx: Ctx): void {
  const value = take(ctx, 'font-family');
  if (!value) return;
  const cleaned = value.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().replace(/\s+/g, '_');
  emit(ctx, `font-[${cleaned}]`);
}

function fontSize(ctx: Ctx): void {
  const value = take(ctx, 'font-size');
  if (value === undefined) return;
  const px = parsePx(value);
  if (px === null) return fail(ctx, 'font-size');
  const name = FONT_SIZE[String(px)];
  emit(ctx, name ? `text-${name}` : `text-[${round2(px)}px]`);
}

function fontWeight(ctx: Ctx): void {
  const value = take(ctx, 'font-weight');
  if (value === undefined || isDefault('font-weight', value)) return;
  const name = FONT_WEIGHT[value];
  if (name) emit(ctx, `font-${name}`);
  else if (/^\d+$/.test(value)) emit(ctx, `font-[${value}]`);
  else fail(ctx, 'font-weight');
}

function lineHeight(ctx: Ctx): void {
  const value = take(ctx, 'line-height');
  if (value === undefined || isDefault('line-height', value)) return;
  const px = parsePx(value);
  if (px !== null) emit(ctx, LEADING[String(px)] ? `leading-${LEADING[String(px)]}` : `leading-[${round2(px)}px]`);
  else if (/^\d*\.?\d+$/.test(value)) emit(ctx, `leading-[${value}]`);
  else fail(ctx, 'line-height');
}

function letterSpacing(ctx: Ctx): void {
  const value = take(ctx, 'letter-spacing');
  if (value === undefined || isDefault('letter-spacing', value) || isZero(value)) return;
  emit(ctx, `tracking-[${arbitrary(value)}]`);
}

const DECORATION: Record<string, string> = {
  underline: 'underline', 'line-through': 'line-through', overline: 'overline',
};

function textDecoration(ctx: Ctx): void {
  const line = take(ctx, 'text-decoration-line');
  const short = take(ctx, 'text-decoration');
  const value = line ?? short?.split(/\s+/)[0];
  const prop = line !== undefined ? 'text-decoration-line' : 'text-decoration';
  if (value === undefined || value === 'none') {
    // Decoration colour/style/thickness are irrelevant without a decoration line.
    for (const p of ['text-decoration-color', 'text-decoration-style', 'text-decoration-thickness']) take(ctx, p);
    return;
  }
  const cls = DECORATION[value];
  if (cls) emit(ctx, cls);
  else fail(ctx, prop);
}

function color(ctx: Ctx, prop: string, prefix: string): void {
  const value = take(ctx, prop);
  if (value === undefined || isDefault(prop, value)) return;
  const token = colorToken(value);
  if (token) emit(ctx, `${prefix}-${token}`);
  else fail(ctx, prop);
}

const HANDLERS_TYPE: Handler[] = [
  fontFamily,
  fontSize,
  fontWeight,
  ctx => keyword(ctx, 'font-style', { italic: 'italic' }),
  lineHeight,
  letterSpacing,
  ctx => keyword(ctx, 'text-align', {
    left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify', end: 'text-end',
  }),
  ctx => keyword(ctx, 'text-transform', {
    uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize',
  }),
  textDecoration,
  ctx => keyword(ctx, 'white-space', {
    nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-line': 'whitespace-pre-line',
    'pre-wrap': 'whitespace-pre-wrap', 'break-spaces': 'whitespace-break-spaces',
  }),
  ctx => color(ctx, 'color', 'text'),
];

// ---------------------------------------------------------------------------
// Borders

const BORDER_STYLE: Record<string, string> = {
  dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double', hidden: 'border-hidden',
};

function borderWidthClass(prefix: string, px: number): string {
  if (px === 1) return prefix;
  if (px === 2 || px === 4 || px === 8) return `${prefix}-${px}`;
  return `${prefix}-[${round2(px)}px]`;
}

/** Per-side values from longhands, falling back to an expanded shorthand; also returns the prop to blame. */
function borderSides(ctx: Ctx, kind: 'width' | 'style' | 'color'): Array<{ value?: string; prop: string }> {
  const short = take(ctx, `border-${kind}`);
  const shortSides = short === undefined ? null
    : kind === 'color' ? (colorToken(short) ? [short, short, short, short] : null)
      : expandSides(short);
  if (short !== undefined && !shortSides) fail(ctx, `border-${kind}`);
  return SIDES.map((side, i) => {
    const prop = `border-${side}-${kind}`;
    const value = take(ctx, prop);
    return value !== undefined ? { value, prop } : { value: shortSides?.[i], prop: `border-${kind}` };
  });
}

function borders(ctx: Ctx): void {
  const widths = borderSides(ctx, 'width').map(({ value, prop }) => {
    if (value === undefined) return 0;
    const px = parsePx(value);
    if (px === null) fail(ctx, prop);
    return px ?? 0;
  });
  const active = widths.map(w => w > 0);
  const [t, r, b, l] = widths;
  if (t === r && r === b && b === l) {
    if ((t ?? 0) > 0) emit(ctx, borderWidthClass('border', t ?? 0));
  } else {
    widths.forEach((w, i) => { if (w > 0) emit(ctx, borderWidthClass(`border-${SIDE_ABBR[i]}`, w)); });
  }

  const styles = borderSides(ctx, 'style').filter((_, i) => active[i]);
  const firstStyle = styles[0]?.value ?? 'solid';
  if (styles.every(s => (s.value ?? 'solid') === firstStyle)) {
    if (BORDER_STYLE[firstStyle]) emit(ctx, BORDER_STYLE[firstStyle]);
    else if (firstStyle !== 'solid' && firstStyle !== 'none') styles.forEach(s => fail(ctx, s.prop));
  } else {
    styles.forEach(s => fail(ctx, s.prop));
  }

  const colors = borderSides(ctx, 'color')
    .map((c, i) => ({ ...c, i, token: active[i] && c.value !== undefined ? colorToken(c.value) : undefined }))
    .filter(c => c.token !== undefined);
  colors.forEach(c => { if (c.token === null) fail(ctx, c.prop); });
  const first = colors[0]?.token;
  if (first && colors.every(c => c.token === first)) {
    emit(ctx, `border-${first}`);
  } else {
    colors.forEach(c => { if (c.token) emit(ctx, `border-${SIDE_ABBR[c.i]}-${c.token}`); });
  }
}

const RADIUS: Record<string, string> = {
  '2': '-sm', '4': '', '6': '-md', '8': '-lg', '12': '-xl', '16': '-2xl', '24': '-3xl',
};

/** `rounded`, `rounded-tl-lg`, `rounded-[10px]`; '' for zero; null when unmappable. */
function radiusClass(prefix: string, value: string): string | null {
  if (value === '50%') return `${prefix}-full`;
  const px = parsePx(value);
  if (px === null) return parsePercent(value) !== null ? `${prefix}-[${value}]` : null;
  if (px === 0) return '';
  if (px >= 9999) return `${prefix}-full`;
  const name = RADIUS[String(px)];
  return name !== undefined ? prefix + name : `${prefix}-[${round2(px)}px]`;
}

function radius(ctx: Ctx): void {
  const longhands = CORNERS.map(c => take(ctx, `border-${c}-radius`));
  const short = take(ctx, 'border-radius');
  const useShort = longhands.every(v => v === undefined);
  if (useShort && short === undefined) return;
  const expanded = useShort && short !== undefined && !short.includes('/') ? expandSides(short) : null;
  if (useShort && !expanded) return fail(ctx, 'border-radius');
  const values = CORNERS.map((_, i) => ((useShort ? expanded?.[i] : longhands[i]) ?? '0px'));
  const norm = values.map(v => (isZero(v) ? '0px' : v));
  const blame = (i: number): string => (useShort ? 'border-radius' : `border-${CORNERS[i]}-radius`);

  if (norm.every(v => v === norm[0])) {
    const cls = radiusClass('rounded', norm[0] ?? '0px');
    if (cls === null) CORNERS.forEach((_, i) => { if (useShort || longhands[i] !== undefined) fail(ctx, blame(i)); });
    else emit(ctx, cls);
    return;
  }
  norm.forEach((value, i) => {
    const cls = radiusClass(`rounded-${CORNER_ABBR[i]}`, value);
    if (cls === null) fail(ctx, blame(i));
    else emit(ctx, cls);
  });
}

// ---------------------------------------------------------------------------
// Effects

const CURSORS = new Set([
  'pointer', 'default', 'wait', 'text', 'move', 'help', 'not-allowed', 'none', 'context-menu',
  'progress', 'cell', 'crosshair', 'vertical-text', 'alias', 'copy', 'no-drop', 'grab',
  'grabbing', 'all-scroll', 'col-resize', 'row-resize', 'zoom-in', 'zoom-out',
]);

function opacity(ctx: Ctx): void {
  const value = take(ctx, 'opacity');
  if (value === undefined || isDefault('opacity', value)) return;
  const n = Number(value);
  if (!/^\d*\.?\d+$/.test(value) || n > 1) return fail(ctx, 'opacity');
  const pct = Math.round(n * 100);
  emit(ctx, Math.abs(n * 100 - pct) < 1e-9 && pct % 5 === 0 ? `opacity-${pct}` : `opacity-[${value}]`);
}

function boxShadow(ctx: Ctx): void {
  const value = take(ctx, 'box-shadow');
  if (value === undefined || isDefault('box-shadow', value)) return;
  emit(ctx, `shadow-[${arbitrary(value)}]`);
}

function cursor(ctx: Ctx): void {
  const value = take(ctx, 'cursor');
  if (value === undefined || isDefault('cursor', value)) return;
  if (CURSORS.has(value)) emit(ctx, `cursor-${value}`);
  else fail(ctx, 'cursor');
}

/** Only `none` and the identity matrix are recognised; any real transform is reported unmapped. */
function transform(ctx: Ctx): void {
  const value = take(ctx, 'transform');
  if (value !== undefined && !isDefault('transform', value)) fail(ctx, 'transform');
}

// ---------------------------------------------------------------------------
// Entry point

/** Handlers in output order: layout, flex/grid, spacing, sizing, typography, backgrounds, borders, effects. */
const HANDLERS: Handler[] = [
  ctx => keyword(ctx, 'display', DISPLAY),
  ctx => keyword(ctx, 'position', POSITION),
  inset,
  zIndex,
  overflow,
  ctx => keyword(ctx, 'box-sizing', { 'border-box': 'box-border' }),
  ctx => keyword(ctx, 'visibility', { hidden: 'invisible', collapse: 'collapse' }),
  ...HANDLERS_FLEX,
  ...HANDLERS_GRID,
  ctx => boxSides(ctx, 'margin'),
  ctx => boxSides(ctx, 'padding'),
  gap,
  ctx => size(ctx, 'width', 'w'),
  ctx => size(ctx, 'height', 'h'),
  ctx => size(ctx, 'min-width', 'min-w'),
  ctx => size(ctx, 'min-height', 'min-h'),
  ctx => size(ctx, 'max-width', 'max-w'),
  ctx => size(ctx, 'max-height', 'max-h'),
  ...HANDLERS_TYPE,
  ctx => color(ctx, 'background-color', 'bg'),
  borders,
  radius,
  opacity,
  boxShadow,
  cursor,
  transform,
];

/** Convert computed CSS declarations to Tailwind classes; declarations that cannot be mapped are returned in `unmapped`. */
export function toTailwind(decls: Declaration[]): TailwindResult {
  const values = new Map<string, string>();
  const originals = new Map<string, Declaration>();
  for (const decl of decls) {
    const prop = decl.prop.trim().toLowerCase();
    const value = decl.value.trim();
    if (!prop || !value) continue;
    values.set(prop, value);
    originals.set(prop, decl);
  }

  const ctx: Ctx = { values, classes: [], seen: new Set(), failed: new Set() };
  for (const handler of HANDLERS) handler(ctx);

  const unmapped: Declaration[] = [];
  for (const [prop, value] of values) {
    const covered = ctx.seen.has(prop)
      || isDefault(prop, value)
      || (SHORTHANDS[prop]?.every(p => values.has(p)) ?? false);
    if (ctx.failed.has(prop) || !covered) {
      const original = originals.get(prop);
      unmapped.push({ prop: original?.prop ?? prop, value: original?.value ?? value });
    }
  }
  return { classes: [...new Set(ctx.classes)], unmapped };
}
