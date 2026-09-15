import { describe, it, expect } from 'vitest';
import { authoredDetail, buildPanelModel, boxModelOf, selectorOf, type InspectTarget, type PanelBlock, type PanelModel } from '../utils/inspect';
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

  it('shows where an authored value came from under the computed one', () => {
    const model = buildPanelModel('css-inspect', fake({ styles: { display: 'grid', 'padding-top': '16px', 'row-gap': '16px' } }), {
      ...ctx,
      authored: {
        'padding-top': { value: 'var(--space-md)', selector: '.grid-demo', source: '<style>' },
        display: { value: 'grid', selector: '.grid-demo', source: 'site.css' },
      },
    });
    const layout = rowsBlock(model, 'Layout');
    expect(layout.rows[0]).toEqual({ label: 'display', value: 'grid', copy: 'display: grid;', detail: '.grid-demo · site.css' });
    const box = rowsBlock(model, 'Box Model');
    expect(box.rows[0]).toMatchObject({ label: 'padding-top', value: '16px', detail: 'var(--space-md) · .grid-demo · <style>' });
    expect(rowsBlock(model, 'Flex & Alignment').rows[0]).toEqual({ label: 'row-gap', value: '16px', copy: 'row-gap: 16px;' });
  });

  it('formats authored details, collapsing whitespace before comparing', () => {
    expect(authoredDetail('8px 16px', { value: '8px  16px', selector: 'p', source: 'a.css' })).toBe('p · a.css');
    expect(authoredDetail('8px', undefined)).toBeUndefined();
  });

  it('skips the flexbox and grid categories for non-flex, non-grid elements', () => {
    const model = buildPanelModel('css-inspect', fake({ styles: { display: 'block', 'flex-direction': 'column', 'grid-template-columns': '1fr' } }), ctx);
    expect(model.blocks.some(b => b.kind === 'rows' && (b.title === 'Flex & Alignment' || b.title === 'Grid'))).toBe(false);
  });
});

describe('Color Picker', () => {
  const contrastOf = (model: PanelModel) => model.blocks.find((b): b is Extract<PanelBlock, { kind: 'contrast' }> => b.kind === 'contrast');
  const colorsOf = (model: PanelModel) => model.blocks.find((b): b is Extract<PanelBlock, { kind: 'colors' }> => b.kind === 'colors')?.colors ?? [];

  it('reads colour, background and opacity properties only — no layout', () => {
    const reads: string[] = [];
    buildPanelModel('color-picker', fake({ styles: { color: '#fff', 'background-color': '#e03131' } }, reads), ctx);
    expect(new Set(reads)).toEqual(new Set(['color', 'background-color', 'background-image', 'opacity', 'border-top-color']));
  });

  it('reports text and background in four formats with AA/AAA for normal and large text', () => {
    const model = buildPanelModel('color-picker', fake({
      styles: { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(224, 49, 49)', 'border-top-color': 'rgba(0, 0, 0, 0)' },
    }), ctx);
    expect(colorsOf(model)).toMatchObject([
      { label: 'Text', hex: '#ffffff', oklch: 'oklch(100% 0 0)' },
      { label: 'Background', hex: '#e03131', rgb: 'rgb(224, 49, 49)' },
    ]);
    const contrast = contrastOf(model);
    expect(contrast?.ratio).toBeGreaterThan(4.5);
    expect(contrast?.ratio).toBeLessThan(4.53);
    expect(contrast?.rating).toBe('AA');
    expect(contrast?.levels).toEqual({ normal: { aa: true, aaa: false }, large: { aa: true, aaa: true } });
  });

  it('measures against the background behind a transparent element', () => {
    const parent = fake({ styles: { 'background-color': 'rgb(255, 255, 255)' } });
    const model = buildPanelModel('color-picker', fake({ styles: { color: 'rgb(118, 118, 118)', 'background-color': 'rgba(0, 0, 0, 0)' }, parent }), ctx);
    expect(colorsOf(model)[1]).toMatchObject({ label: 'Background (behind)', hex: '#ffffff' });
    expect(contrastOf(model)?.levels.normal).toEqual({ aa: true, aaa: false });
  });

  it('blends a translucent background into the one behind it', () => {
    const parent = fake({ styles: { 'background-color': 'rgb(255, 255, 255)' } });
    const model = buildPanelModel('color-picker', fake({ styles: { color: 'rgb(0, 0, 0)', 'background-color': 'rgba(0, 0, 0, 0.5)' }, parent }), ctx);
    expect(colorsOf(model)[1]).toMatchObject({ label: 'Background (blended)', hex: '#808080' });
  });

  it('points to the eyedropper when the background is an image or gradient', () => {
    const model = buildPanelModel('color-picker', fake({ styles: { color: 'rgb(255, 255, 255)', 'background-image': 'linear-gradient(red, blue)' } }), ctx);
    expect(contrastOf(model)).toBeUndefined();
    expect(model.blocks.at(-1)).toMatchObject({ kind: 'note', text: expect.stringContaining('eyedropper') });
  });

  it('shows a border colour only when the border has width', () => {
    const noWidth = buildPanelModel('color-picker', fake({ styles: { color: '#000', 'background-color': '#fff', 'border-top-color': 'rgb(0, 0, 0)', 'border-top-width': '0px' } }), ctx);
    expect(colorsOf(noWidth).map(c => c.label)).toEqual(['Text', 'Background']);
    const withWidth = buildPanelModel('color-picker', fake({ styles: { color: '#000', 'background-color': '#fff', 'border-top-color': 'rgb(204, 204, 204)', 'border-top-width': '1px' } }), ctx);
    expect(colorsOf(withWidth).map(c => c.label)).toEqual(['Text', 'Background', 'Border']);
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

describe('Live Edit', () => {
  it('invites a click on hover', () => {
    const model = buildPanelModel('live-edit', fake({ tag: 'span', className: 'pill', rect: { left: 0, top: 0, width: 72.4, height: 33.6 } }), ctx);
    expect(model.title).toBe('Live Edit');
    expect(model.blocks).toEqual([
      { kind: 'rows', rows: [{ label: 'Element', value: 'span.pill' }, { label: 'Size', value: '72 x 34' }] },
      { kind: 'note', text: 'Click to edit its text, spacing, colours and font size.' },
    ]);
  });
});

describe('Measure — anchor', () => {
  it('adds distances to the anchor first when one is set', () => {
    const model = buildPanelModel('rulers', fake({ rect: { left: 140, top: 10, width: 60, height: 60 } }), { ...ctx, anchor: { left: 0, top: 0, width: 100, height: 50 } });
    expect(model.blocks[0]).toEqual({
      kind: 'rows',
      title: 'To anchor',
      rows: [{ label: 'Horizontal', value: '40px' }, { label: 'Vertical', value: '10px' }, { label: 'Vertical', value: '20px' }],
    });
  });

  it('says so when the hovered box is the anchor box', () => {
    const rect = { left: 0, top: 0, width: 100, height: 50 };
    const model = buildPanelModel('rulers', fake({ rect }), { ...ctx, anchor: rect });
    expect(model.blocks[0]).toMatchObject({ title: 'To anchor', rows: [{ label: 'Distance', value: 'Same box as the anchor' }] });
  });

  it('has no anchor section without an anchor', () => {
    const model = buildPanelModel('rulers', fake(), ctx);
    expect(model.blocks.some(b => b.kind === 'rows' && b.title === 'To anchor')).toBe(false);
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
