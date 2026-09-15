/**
 * Panel content for the on-page hover tools. Builders read the hovered element through
 * `InspectTarget`, a DOM-free view, and return a plain `PanelModel`. That keeps them
 * testable in Node, and lets a model built inside a frame travel to the top document
 * (structured clone) to be rendered there.
 */

import { parseColor, toHex, toRgb, toHsl, toOklch, wcagRating, type RGBA } from './colors';
import { contrastLevels, effectiveBackground, textContrast, type BackgroundLayer } from './contrast';
import { formatCssRule, nonDefaultDeclarations } from './css';
import { parseFontStack, weightName, formatSizeLineHeight, isGenericFont } from './fonts';
import { parsePx, type BoxModel, type BoxSides } from './spacing';
import { elementSelector, formatDimensions, textPreview, type PathSegment } from './dom';
import { getHoverTool, UnknownToolError } from './tools';
import { distanceGuides, formatLength } from './measure';
import type { EditFormState } from './edit-form';
import type { Rect, Size } from './geometry';

/** What the builders may read about an element. Every accessor is lazy, so a tool reads only what it shows. */
export interface InspectTarget {
  tag: string;
  id: string;
  className: string;
  rect: Rect;
  /** Computed value of a CSS property, '' when unavailable. */
  style(prop: string): string;
  text(): string;
  parent(): InspectTarget | null;
  previous(): InspectTarget | null;
  next(): InspectTarget | null;
  children(): InspectTarget[];
}

export interface PanelRow {
  label: string;
  value: string;
  /** A CSS color to show as a swatch before the value. */
  swatch?: string;
  /** Text copied when the row is clicked. */
  copy?: string;
  /** A secondary line, e.g. where an authored value came from. */
  detail?: string;
}

export interface ColorEntry {
  label: string;
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
}

export interface Swatch {
  color: string;
  label: string;
  copy: string;
  count?: number;
}

export type PanelBlock =
  | { kind: 'rows'; title?: string; rows: PanelRow[] }
  | { kind: 'colors'; colors: ColorEntry[] }
  | { kind: 'contrast'; ratio: number; rating: string; levels: ReturnType<typeof contrastLevels> }
  | { kind: 'swatches'; title: string; swatches: Swatch[] }
  | { kind: 'code'; text: string }
  | { kind: 'edit-form'; state: EditFormState }
  | { kind: 'box'; box: BoxModel }
  | { kind: 'preview'; text: string; style: Record<string, string> }
  | { kind: 'note'; text: string };

export interface PanelModel {
  toolId: string;
  title: string;
  path: PathSegment[];
  blocks: PanelBlock[];
}

export interface BuildContext {
  viewport: Size;
  path: PathSegment[];
  /** The Measure tool's anchored element, when one is set. */
  anchor?: Rect;
  /** Winning authored declarations for the element, by property (CSS Inspector). */
  authored?: Record<string, AuthoredValue>;
}

export interface AuthoredValue {
  value: string;
  selector: string;
  source: string;
}

/** Build the panel for a hover tool. Throws `UnknownToolError` for ids that are not hover tools. */
export function buildPanelModel(toolId: string, target: InspectTarget, ctx: BuildContext): PanelModel {
  const tool = getHoverTool(toolId);
  return { toolId: tool.id, title: tool.name, path: ctx.path, blocks: blocksFor(tool.id, target, ctx) };
}

function blocksFor(toolId: string, t: InspectTarget, ctx: BuildContext): PanelBlock[] {
  switch (toolId) {
    case 'css-inspect': return cssBlocks(t, ctx.authored);
    case 'color-picker': return colorBlocks(t);
    case 'font-detect': return fontBlocks(t);
    case 'spacing': return spacingBlocks(t);
    case 'element-info': return elementBlocks(t);
    case 'rulers': return rulerBlocks(t, ctx.viewport, ctx.anchor);
    case 'grid-overlay': return gridBlocks(t);
    case 'live-edit': return liveEditBlocks(t);
    default: throw new UnknownToolError(toolId, 'has no panel builder');
  }
}

export function selectorOf(t: InspectTarget): string {
  return elementSelector({ tagName: t.tag, id: t.id, className: t.className });
}

function row(label: string, value: string, extra: Partial<PanelRow> = {}): PanelRow {
  return { label, value, ...extra };
}

/** "var(--space-md) · .grid-demo · site.css" — the authored value when it differs, then where it was set. */
export function authoredDetail(computed: string, authored: AuthoredValue | undefined): string | undefined {
  if (!authored) return undefined;
  const where = `${authored.selector} · ${authored.source}`;
  return authored.value.replace(/\s+/g, ' ') === computed ? where : `${authored.value} · ${where}`;
}

function cssBlocks(t: InspectTarget, authored?: Record<string, AuthoredValue>): PanelBlock[] {
  const blocks: PanelBlock[] = [];
  for (const decl of nonDefaultDeclarations(prop => t.style(prop))) {
    const r = row(decl.prop, decl.value, {
      swatch: parseColor(decl.value) ? decl.value : undefined,
      copy: formatCssRule(decl.prop, decl.value),
      detail: authoredDetail(decl.value, authored?.[decl.prop]),
    });
    if (r.detail === undefined) delete r.detail;
    const last = blocks.at(-1);
    if (last?.kind === 'rows' && last.title === decl.category) last.rows.push(r);
    else blocks.push({ kind: 'rows', title: decl.category, rows: [r] });
  }
  return blocks;
}

export function colorEntry(label: string, c: RGBA): ColorEntry {
  return { label, hex: toHex(c), rgb: toRgb(c), hsl: toHsl(c), oklch: toOklch(c) };
}

const PAGE_CANVAS: RGBA = { r: 255, g: 255, b: 255, a: 1 };

/** Background layers from the element out to the root. */
export function backgroundLayersOf(t: InspectTarget): BackgroundLayer[] {
  const layers: BackgroundLayer[] = [];
  for (let node: InspectTarget | null = t, depth = 0; node && depth < 64; node = node.parent(), depth++) {
    const image = node.style('background-image');
    const opacity = parseFloat(node.style('opacity'));
    layers.push({ color: parseColor(node.style('background-color')), image: Boolean(image) && image !== 'none', opacity: Number.isFinite(opacity) ? opacity : 1 });
  }
  return layers;
}

function colorBlocks(t: InspectTarget): PanelBlock[] {
  const color = parseColor(t.style('color'));
  const ownBg = parseColor(t.style('background-color'));
  const border = parseColor(t.style('border-top-color'));
  const bg = effectiveBackground(backgroundLayersOf(t), PAGE_CANVAS);

  const colors: ColorEntry[] = [];
  if (color) colors.push(colorEntry('Text', color));
  if (ownBg && ownBg.a >= 1) colors.push(colorEntry('Background', ownBg));
  else if (bg.kind === 'solid') colors.push(colorEntry(ownBg && ownBg.a > 0 ? 'Background (blended)' : 'Background (behind)', bg.color));
  if (border && border.a !== 0 && parsePx(t.style('border-top-width')) > 0) colors.push(colorEntry('Border', border));

  const blocks: PanelBlock[] = [{ kind: 'colors', colors }];
  if (color && bg.kind === 'solid') {
    const { ratio } = textContrast(color, bg);
    blocks.push({ kind: 'contrast', ratio, rating: wcagRating(ratio), levels: contrastLevels(ratio) });
  } else if (bg.kind === 'manual') {
    blocks.push({ kind: 'note', text: 'The background is an image or gradient. Press E for the eyedropper to sample it.' });
  }
  return blocks;
}

function fontBlocks(t: InspectTarget): PanelBlock[] {
  const family = t.style('font-family');
  const stack = parseFontStack(family);
  const size = t.style('font-size');
  const weight = t.style('font-weight');
  const fontStyle = t.style('font-style');
  const letterSpacing = t.style('letter-spacing');
  const rows: PanelRow[] = [
    row('Font', stack[0] || family),
    row('Stack', stack.map(f => (isGenericFont(f) ? `${f} (generic)` : f)).join(', ')),
    row('Size', formatSizeLineHeight(size, t.style('line-height'))),
    row('Weight', `${weight} (${weightName(weight)})`),
  ];
  if (fontStyle && fontStyle !== 'normal') rows.push(row('Style', fontStyle));
  if (letterSpacing && letterSpacing !== 'normal') rows.push(row('Letter Spacing', letterSpacing));
  return [
    {
      kind: 'preview',
      text: 'The quick brown fox',
      style: { 'font-family': family, 'font-size': size, 'font-weight': weight, 'font-style': fontStyle, color: t.style('color') },
    },
    { kind: 'rows', rows },
  ];
}

function liveEditBlocks(t: InspectTarget): PanelBlock[] {
  return [
    { kind: 'rows', rows: [row('Element', selectorOf(t)), row('Size', formatDimensions(t.rect.width, t.rect.height))] },
    { kind: 'note', text: 'Click to edit its text, spacing, colours and font size.' },
  ];
}

function sides(t: InspectTarget, prefix: string, suffix = ''): BoxSides {
  return {
    top: parsePx(t.style(`${prefix}-top${suffix}`)),
    right: parsePx(t.style(`${prefix}-right${suffix}`)),
    bottom: parsePx(t.style(`${prefix}-bottom${suffix}`)),
    left: parsePx(t.style(`${prefix}-left${suffix}`)),
  };
}

export function boxModelOf(t: InspectTarget): BoxModel {
  const padding = sides(t, 'padding');
  const border = sides(t, 'border', '-width');
  const margin = sides(t, 'margin');
  return {
    content: {
      width: t.rect.width - padding.left - padding.right - border.left - border.right,
      height: t.rect.height - padding.top - padding.bottom - border.top - border.bottom,
    },
    padding,
    border,
    margin,
  };
}

function spacingBlocks(t: InspectTarget): PanelBlock[] {
  return [{ kind: 'box', box: boxModelOf(t) }];
}

function elementBlocks(t: InspectTarget): PanelBlock[] {
  const selector = selectorOf(t);
  const rows: PanelRow[] = [row('Tag', `<${t.tag}>`)];
  if (t.id) rows.push(row('ID', `#${t.id}`));
  const classes = t.className.trim().split(/\s+/).filter(Boolean);
  if (classes.length > 0) rows.push(row('Classes', classes.map(c => `.${c}`).join(' ')));
  rows.push(row('Size', formatDimensions(t.rect.width, t.rect.height)));
  rows.push(row('Position', `${t.style('position')} (${Math.round(t.rect.left)}, ${Math.round(t.rect.top)})`));
  rows.push(row('Display', t.style('display')));
  const text = t.text();
  if (text.trim()) rows.push(row('Text', textPreview(text)));
  rows.push(row('Selector', selector, { copy: selector }));
  return [{ kind: 'rows', rows }];
}

const px = (n: number) => `${Math.round(n)}px`;

function rulerBlocks(t: InspectTarget, viewport: Size, anchor?: Rect): PanelBlock[] {
  const r = t.rect;
  const blocks: PanelBlock[] = [{
    kind: 'rows',
    rows: [
      row('Width', px(r.width)),
      row('Height', px(r.height)),
      row('Top', `${px(r.top)} from viewport`),
      row('Left', `${px(r.left)} from viewport`),
      row('Bottom', `${px(viewport.height - (r.top + r.height))} to bottom`),
      row('Right', `${px(viewport.width - (r.left + r.width))} to right`),
    ],
  }];

  const parent = t.parent();
  if (parent) {
    const p = parent.rect;
    blocks.push({
      kind: 'rows',
      title: 'Distance to Parent',
      rows: [
        row('Top', px(r.top - p.top)),
        row('Left', px(r.left - p.left)),
        row('Bottom', px(p.top + p.height - (r.top + r.height))),
        row('Right', px(p.left + p.width - (r.left + r.width))),
      ],
    });
  }

  const prev = t.previous();
  const next = t.next();
  if (prev || next) {
    const rows: PanelRow[] = [];
    if (prev) rows.push(row('Above', `${px(r.top - (prev.rect.top + prev.rect.height))} gap`));
    if (next) rows.push(row('Below', `${px(next.rect.top - (r.top + r.height))} gap`));
    blocks.push({ kind: 'rows', title: 'Sibling Gaps', rows });
  }

  if (anchor) {
    const guides = distanceGuides(anchor, r);
    blocks.unshift({
      kind: 'rows',
      title: 'To anchor',
      rows: guides.length > 0
        ? guides.map(g => row(g.axis === 'x' ? 'Horizontal' : 'Vertical', formatLength(g.length)))
        : [row('Distance', 'Same box as the anchor')],
    });
  }
  return blocks;
}

function gridBlocks(t: InspectTarget): PanelBlock[] {
  const display = t.style('display');
  const rows: PanelRow[] = [row('Display', display)];
  const blocks: PanelBlock[] = [{ kind: 'rows', title: 'Layout', rows }];

  if (display.includes('grid')) {
    rows.push(
      row('Columns', t.style('grid-template-columns')),
      row('Rows', t.style('grid-template-rows')),
      row('Gap', t.style('gap') || 'none'),
      row('Areas', t.style('grid-template-areas') || 'none'),
      row('Auto Flow', t.style('grid-auto-flow')),
      row('Align Items', t.style('align-items')),
      row('Justify Items', t.style('justify-items')),
      row('Children', String(t.children().length)),
    );
  } else if (display.includes('flex')) {
    const children = t.children();
    rows.push(
      row('Direction', t.style('flex-direction')),
      row('Wrap', t.style('flex-wrap')),
      row('Gap', t.style('gap') || 'none'),
      row('Justify Content', t.style('justify-content')),
      row('Align Items', t.style('align-items')),
      row('Align Content', t.style('align-content')),
      row('Children', String(children.length)),
    );
    if (children.length > 0 && children.length <= 12) {
      blocks.push({
        kind: 'rows',
        title: 'Child Items',
        rows: children.map((c, i) => row(`${c.tag}[${i}]`, `${c.style('flex-grow')} ${c.style('flex-shrink')} ${c.style('flex-basis')}`)),
      });
    }
  } else {
    rows.push(row('Note', 'Not a grid or flex container'));
    const parentDisplay = t.parent()?.style('display') ?? '';
    if (parentDisplay.includes('flex')) {
      blocks.push({
        kind: 'rows',
        title: 'Flex Item Properties',
        rows: [
          row('Flex', `${t.style('flex-grow')} ${t.style('flex-shrink')} ${t.style('flex-basis')}`),
          row('Align Self', t.style('align-self')),
          row('Order', t.style('order')),
        ],
      });
    } else if (parentDisplay.includes('grid')) {
      blocks.push({
        kind: 'rows',
        title: 'Grid Item Properties',
        rows: [
          row('Column', t.style('grid-column')),
          row('Row', t.style('grid-row')),
          row('Align Self', t.style('align-self')),
          row('Justify Self', t.style('justify-self')),
        ],
      });
    }
  }
  return blocks;
}
