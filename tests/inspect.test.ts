import { describe, it, expect } from 'vitest';
import { buildPanelModel, boxModelOf, selectorOf, type InspectTarget, type PanelBlock, type PanelModel } from '../utils/inspect';
import { UnknownToolError } from '../utils/tools';
import type { Rect } from '../utils/geometry';

interface FakeOptions {
  tag?: string;
  id?: string;
  className?: string;
  rect?: Rect;
  styles?: Record<string, string>;
  text?: string;
  parent?: InspectTarget | null;
  previous?: InspectTarget | null;
  next?: InspectTarget | null;
  children?: InspectTarget[];
}

/** A DOM-free element that records which CSS properties were read. */
function fake(opts: FakeOptions = {}, reads: string[] = []): InspectTarget {
  return {
    tag: opts.tag ?? 'div',
    id: opts.id ?? '',
    className: opts.className ?? '',
    rect: opts.rect ?? { left: 0, top: 0, width: 100, height: 50 },
    style: prop => {
      reads.push(prop);
      return opts.styles?.[prop] ?? '';
    },
    text: () => opts.text ?? '',
    parent: () => opts.parent ?? null,
    previous: () => opts.previous ?? null,
    next: () => opts.next ?? null,
    children: () => opts.children ?? [],
  };
}

const ctx = { viewport: { width: 1000, height: 800 }, path: [{ label: 'main' }, { label: 'div.card' }] };

function rowsBlock(model: PanelModel, title?: string) {
  const block = model.blocks.find((b): b is Extract<PanelBlock, { kind: 'rows' }> => b.kind === 'rows' && b.title === title);
  if (!block) throw new Error(`no rows block titled ${title}`);
  return block;
}

function rowValue(model: PanelModel, label: string, title?: string): string | undefined {
  return rowsBlock(model, title).rows.find(r => r.label === label)?.value;
}

describe('buildPanelModel', () => {
  it('carries the tool name and the composed path', () => {
    const model = buildPanelModel('css-inspect', fake(), ctx);
    expect(model.title).toBe('CSS Inspector');
    expect(model.toolId).toBe('css-inspect');
    expect(model.path).toEqual(ctx.path);
  });

  it('throws for an unknown tool id instead of falling back to the CSS panel', () => {
    expect(() => buildPanelModel('css-inspector', fake(), ctx)).toThrow(UnknownToolError);
  });

  it('throws for a tool that is not an on-page inspector', () => {
    expect(() => buildPanelModel('accessibility', fake(), ctx)).toThrow(/page tool/);
  });
});

describe('CSS Inspector', () => {
  it('lists non-default computed values by category with copyable declarations', () => {
    const model = buildPanelModel('css-inspect', fake({
      styles: { display: 'block', position: 'fixed', 'z-index': '1000', color: 'rgb(255, 255, 255)', 'text-align': 'start' },
    }), ctx);
    const layout = rowsBlock(model, 'Layout');
    expect(layout.rows.map(r => r.label)).toEqual(['display', 'position', 'z-index']);
    expect(layout.rows[1]).toMatchObject({ value: 'fixed', copy: 'position: fixed;' });
    const typography = rowsBlock(model, 'Typography');
    expect(typography.rows).toEqual([{ label: 'color', value: 'rgb(255, 255, 255)', swatch: 'rgb(255, 255, 255)', copy: 'color: rgb(255, 255, 255);' }]);
  });

  it('skips the flexbox and grid categories for non-flex, non-grid elements', () => {
    const model = buildPanelModel('css-inspect', fake({ styles: { display: 'block', 'flex-direction': 'column', 'grid-template-columns': '1fr' } }), ctx);
    expect(model.blocks.some(b => b.kind === 'rows' && (b.title === 'Flexbox' || b.title === 'Grid'))).toBe(false);
  });
});

describe('Color Picker', () => {
  it('reads only the three colors it shows', () => {
    const reads: string[] = [];
    buildPanelModel('color-picker', fake({ styles: { color: '#fff', 'background-color': '#e03131' } }, reads), ctx);
    expect(reads.sort()).toEqual(['background-color', 'border-top-color', 'color']);
  });

  it('reports text, background and a WCAG contrast rating', () => {
    const model = buildPanelModel('color-picker', fake({
      styles: { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(224, 49, 49)', 'border-top-color': 'rgba(0, 0, 0, 0)' },
    }), ctx);
    const colors = model.blocks.find(b => b.kind === 'colors');
    expect(colors).toMatchObject({ colors: [{ label: 'Text', hex: '#ffffff' }, { label: 'Background', hex: '#e03131', rgb: 'rgb(224, 49, 49)' }] });
    const contrast = model.blocks.find((b): b is Extract<PanelBlock, { kind: 'contrast' }> => b.kind === 'contrast');
    expect(contrast?.ratio).toBeGreaterThan(4.5);
    expect(contrast?.ratio).toBeLessThan(4.53);
    expect(contrast?.rating).toBe('AA');
  });

  it('omits contrast when the background is transparent', () => {
    const model = buildPanelModel('color-picker', fake({ styles: { color: '#000', 'background-color': 'rgba(0, 0, 0, 0)' } }), ctx);
    expect(model.blocks.some(b => b.kind === 'contrast')).toBe(false);
  });
});

describe('Font Detector', () => {
  it('previews in the computed font and names the weight', () => {
    const model = buildPanelModel('font-detect', fake({
      styles: { 'font-family': '"Fixture Font", Georgia, serif', 'font-size': '32px', 'font-weight': '700', 'line-height': '40px', 'font-style': 'normal', 'letter-spacing': 'normal', color: 'rgb(0, 0, 0)' },
    }), ctx);
    expect(model.blocks[0]).toMatchObject({ kind: 'preview', style: { 'font-family': '"Fixture Font", Georgia, serif', 'font-size': '32px' } });
    expect(rowValue(model, 'Font')).toBe('Fixture Font');
    expect(rowValue(model, 'Stack')).toBe('Fixture Font, Georgia, serif (generic)');
    expect(rowValue(model, 'Size')).toBe('32px/40px');
    expect(rowValue(model, 'Weight')).toBe('700 (Bold)');
    expect(rowValue(model, 'Style')).toBeUndefined();
  });
});

describe('Spacing', () => {
  it('derives the content box from the border box, padding and border', () => {
    const t = fake({
      rect: { left: 0, top: 0, width: 200, height: 100 },
      styles: { 'padding-top': '10px', 'padding-right': '20px', 'padding-bottom': '10px', 'padding-left': '20px', 'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px', 'margin-top': '8px' },
    });
    const box = boxModelOf(t);
    expect(box.content).toEqual({ width: 158, height: 78 });
    expect(box.margin.top).toBe(8);
    expect(buildPanelModel('spacing', t, ctx).blocks).toEqual([{ kind: 'box', box }]);
  });
});

describe('Element Info', () => {
  it('lists identity and a copyable selector', () => {
    const model = buildPanelModel('element-info', fake({
      tag: 'section', id: '', className: 'grid-demo wide', rect: { left: 32.4, top: 120.6, width: 640, height: 200 },
      styles: { position: 'static', display: 'grid' }, text: '  Grid item A   Grid item B ',
    }), ctx);
    expect(rowValue(model, 'Tag')).toBe('<section>');
    expect(rowValue(model, 'Classes')).toBe('.grid-demo .wide');
    expect(rowValue(model, 'Position')).toBe('static (32, 121)');
    expect(rowValue(model, 'Text')).toBe('Grid item A Grid item B');
    const selector = rowsBlock(model).rows.find(r => r.label === 'Selector');
    expect(selector).toEqual({ label: 'Selector', value: 'section.grid-demo.wide', copy: 'section.grid-demo.wide' });
  });

  it('builds the selector from id first', () => {
    expect(selectorOf(fake({ tag: 'div', id: 'shadow-host', className: 'x' }))).toBe('div#shadow-host');
  });
});

describe('Rulers', () => {
  it('measures viewport edges, parent distances and sibling gaps', () => {
    const parent = fake({ rect: { left: 0, top: 0, width: 500, height: 400 } });
    const previous = fake({ rect: { left: 10, top: 10, width: 100, height: 30 } });
    const next = fake({ rect: { left: 10, top: 120, width: 100, height: 30 } });
    const model = buildPanelModel('rulers', fake({ rect: { left: 10, top: 56, width: 100, height: 40 }, parent, previous, next }), ctx);
    expect(rowValue(model, 'Width')).toBe('100px');
    expect(rowValue(model, 'Bottom')).toBe('704px to bottom');
    expect(rowValue(model, 'Right')).toBe('890px to right');
    expect(rowValue(model, 'Top', 'Distance to Parent')).toBe('56px');
    expect(rowValue(model, 'Bottom', 'Distance to Parent')).toBe('304px');
    expect(rowValue(model, 'Above', 'Sibling Gaps')).toBe('16px gap');
    expect(rowValue(model, 'Below', 'Sibling Gaps')).toBe('24px gap');
  });
});

describe('Grid Overlay', () => {
  it('describes a grid container', () => {
    const model = buildPanelModel('grid-overlay', fake({
      styles: { display: 'grid', 'grid-template-columns': '200px 200px 200px', gap: '16px', 'grid-template-areas': 'none' },
      children: [fake(), fake(), fake()],
    }), ctx);
    expect(rowValue(model, 'Columns', 'Layout')).toBe('200px 200px 200px');
    expect(rowValue(model, 'Gap', 'Layout')).toBe('16px');
    expect(rowValue(model, 'Children', 'Layout')).toBe('3');
  });

  it('lists flex children with grow, shrink and basis', () => {
    const child = fake({ tag: 'span', styles: { 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0%' } });
    const model = buildPanelModel('grid-overlay', fake({ styles: { display: 'flex', 'flex-direction': 'row' }, children: [child] }), ctx);
    expect(rowsBlock(model, 'Child Items').rows).toEqual([{ label: 'span[0]', value: '1 1 0%' }]);
  });

  it('shows item properties for a child of a grid container', () => {
    const parent = fake({ styles: { display: 'grid' } });
    const model = buildPanelModel('grid-overlay', fake({ styles: { display: 'block', 'grid-column': '1 / 3' }, parent }), ctx);
    expect(rowValue(model, 'Note', 'Layout')).toBe('Not a grid or flex container');
    expect(rowValue(model, 'Column', 'Grid Item Properties')).toBe('1 / 3');
  });
});
