/**
 * Render a `PanelModel` to HTML for the inspector's shadow root. Every value is escaped and
 * every style value is vetted, so a model that arrives from another frame cannot inject
 * markup or load resources. Styles travel in `data-dtp-style` (JSON) and are applied through
 * CSSOM by the content script, because a page's CSP can block `style` attributes.
 */

import { escapeHtml, formatPath } from './dom';
import { formatPx } from './spacing';
import type { BoxSides } from './spacing';
import type { PanelBlock, PanelModel, PanelRow } from './inspect';

/** A CSS value that is safe inside a style attribute (no declaration breaks, no resource loads), or null. */
export function safeCssValue(value: string): string | null {
  if (/[;{}<>\\]/.test(value)) return null;
  if (/\b(url|image-set|image|src|expression|element)\s*\(/i.test(value)) return null;
  return value;
}

/** The vetted subset of a style map: lower-case property names with safe, non-empty values. */
export function safeStyle(style: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(style)) {
    if (!/^[a-z-]+$/.test(prop) || !value) continue;
    const safe = safeCssValue(value);
    if (safe !== null) out[prop] = safe;
  }
  return out;
}

function styleAttr(style: Record<string, string>): string {
  const safe = safeStyle(style);
  return Object.keys(safe).length ? ` data-dtp-style="${escapeHtml(JSON.stringify(safe))}"` : '';
}

function copyAttrs(copy: string | undefined): string {
  return copy ? ` data-copy="${escapeHtml(copy)}" title="Click to copy"` : '';
}

function renderRow(r: PanelRow): string {
  const swatch = r.swatch ? `<span class="swatch"${styleAttr({ background: r.swatch })}></span>` : '';
  return `<div class="prop${r.copy ? ' copyable' : ''}"${copyAttrs(r.copy)}>`
    + `<span class="prop-name">${escapeHtml(r.label)}</span>`
    + `<span class="prop-val">${swatch}${escapeHtml(r.value)}</span></div>`;
}

function renderSides(s: BoxSides): string {
  return `<div class="box-values"><span>${formatPx(s.top)}</span><span>${formatPx(s.right)}</span>`
    + `<span>${formatPx(s.bottom)}</span><span>${formatPx(s.left)}</span></div>`;
}

function renderBlock(block: PanelBlock): string {
  switch (block.kind) {
    case 'rows':
      return `<div class="category">${block.title ? `<div class="cat-name">${escapeHtml(block.title)}</div>` : ''}`
        + block.rows.map(renderRow).join('') + '</div>';
    case 'colors':
      return block.colors.map(c => `<div class="color-row">`
        + `<span class="swatch-lg"${styleAttr({ background: c.hex })}></span>`
        + `<div class="color-info"><div class="color-label">${escapeHtml(c.label)}</div>`
        + [c.hex, c.rgb, c.hsl, c.oklch].map(v => `<div class="color-value copyable"${copyAttrs(v)}>${escapeHtml(v)}</div>`).join('')
        + '</div></div>').join('');
    case 'contrast': {
      const cls = block.rating === 'Fail' ? 'fail' : block.rating === 'AAA' ? 'aaa' : 'aa';
      const level = (ok: boolean, name: string) => `<span class="lvl ${ok ? 'pass' : 'miss'}">${name} ${ok ? '✓' : '✗'}</span>`;
      const { normal, large } = block.levels;
      return `<div class="contrast"><span>Contrast: ${block.ratio.toFixed(2)}:1</span>`
        + `<span class="badge ${cls}">${escapeHtml(block.rating)}</span></div>`
        + `<div class="levels"><span class="lvl-label">Normal text</span>${level(normal.aa, 'AA')}${level(normal.aaa, 'AAA')}`
        + `<span class="lvl-label">Large text</span>${level(large.aa, 'AA')}${level(large.aaa, 'AAA')}</div>`;
    }
    case 'swatches':
      return `<div class="category"><div class="cat-name">${escapeHtml(block.title)}</div><div class="sw-grid">`
        + block.swatches.map(sw => `<button type="button" class="sw copyable" data-copy="${escapeHtml(sw.copy)}"`
          + ` title="${escapeHtml(`${sw.label} · click to copy`)}" aria-label="${escapeHtml(sw.label)}">`
          + `<span class="sw-chip"${styleAttr({ background: sw.color })}></span>`
          + (sw.count !== undefined ? `<span class="sw-count">${sw.count}</span>` : '') + '</button>').join('')
        + '</div></div>';
    case 'box': {
      const b = block.box;
      return '<div class="box-model">'
        + `<div class="box-layer margin-box"><span class="box-label">margin</span>${renderSides(b.margin)}`
        + `<div class="box-layer border-box"><span class="box-label">border</span>${renderSides(b.border)}`
        + `<div class="box-layer padding-box"><span class="box-label">padding</span>${renderSides(b.padding)}`
        + `<div class="box-layer content-box">${Math.round(b.content.width)} x ${Math.round(b.content.height)}</div>`
        + '</div></div></div></div>';
    }
    case 'preview':
      return `<div class="font-preview"${styleAttr(block.style)}>${escapeHtml(block.text)}</div>`;
    case 'note':
      return `<div class="note">${escapeHtml(block.text)}</div>`;
  }
}

export function renderPanelHtml(model: PanelModel): string {
  const fullPath = formatPath(model.path, Infinity);
  return `<div class="panel-head"><div class="panel-title">${escapeHtml(model.title)}</div>`
    + `<div class="panel-path" title="${escapeHtml(fullPath)}">${escapeHtml(formatPath(model.path))}</div></div>`
    + model.blocks.map(renderBlock).join('');
}
