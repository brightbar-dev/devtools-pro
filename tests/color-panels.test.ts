import { describe, it, expect } from 'vitest';
import { paletteModel, pickedColorModel } from '../utils/color-panels';
import { buildPalette } from '../utils/palette';
import { renderPanelHtml } from '../utils/panel-render';

describe('pickedColorModel', () => {
  it('shows the picked pixel in hex, rgb, hsl and oklch with text contrast', () => {
    const model = pickedColorModel('#e03131', []);
    expect(model.title).toBe('Eyedropper');
    expect(model.blocks[0]).toEqual({
      kind: 'colors',
      colors: [{ label: 'Picked', hex: '#e03131', rgb: 'rgb(224, 49, 49)', hsl: 'hsl(0, 74%, 54%)', oklch: expect.stringMatching(/^oklch\(\d+(\.\d)?% 0\.\d+ \d+(\.\d)?\)$/) }],
    });
    expect(model.blocks[1]).toMatchObject({ kind: 'rows', title: 'As a text colour', rows: [{ label: 'on white', value: '4.51:1' }, { label: 'on black', value: '4.65:1' }] });
  });

  it('lists recent picks as copyable swatches', () => {
    const model = pickedColorModel('#ffffff', ['#ffffff', '#3b5bdb']);
    expect(model.blocks.at(-1)).toEqual({
      kind: 'swatches',
      title: 'Recent picks',
      swatches: [{ color: '#ffffff', label: '#ffffff', copy: '#ffffff' }, { color: '#3b5bdb', label: '#3b5bdb', copy: '#3b5bdb' }],
    });
  });

  it('explains an unreadable colour instead of throwing', () => {
    expect(pickedColorModel('nope', []).blocks).toEqual([{ kind: 'note', text: 'Could not read the colour nope' }]);
  });
});

describe('paletteModel', () => {
  const groups = buildPalette([
    { role: 'background', value: 'rgb(224, 49, 49)' },
    { role: 'background', value: 'rgb(224, 49, 49)' },
    { role: 'text', value: 'rgb(255, 255, 255)' },
  ]);

  it('summarises, offers copy-all as CSS, and groups swatches with counts', () => {
    const model = paletteModel(groups);
    expect(model.title).toBe('Page palette');
    expect(model.blocks[0]).toMatchObject({ kind: 'rows', rows: [{ label: 'Distinct colours', value: '2' }, { label: 'Copy all', copy: expect.stringContaining('--background-1: #e03131;') }] });
    expect(model.blocks[1]).toEqual({
      kind: 'swatches',
      title: 'Backgrounds · 1',
      swatches: [{ color: '#e03131', label: '#e03131 · 2 uses', copy: '#e03131', count: 2 }],
    });
    expect(model.blocks[2]).toMatchObject({ kind: 'swatches', title: 'Text · 1' });
  });

  it('says so when a page has no colours', () => {
    expect(paletteModel([]).blocks).toEqual([{ kind: 'note', text: 'No colours found on this page.' }]);
  });

  it('renders swatches as copy buttons with vetted colours and counts', () => {
    const html = renderPanelHtml(paletteModel(groups));
    expect(html).toContain('class="sw copyable" data-copy="#e03131"');
    expect(html).toContain('data-dtp-style="{&quot;background&quot;:&quot;#e03131&quot;}"');
    expect(html).toContain('<span class="sw-count">2</span>');
    expect(html).toContain('aria-label="#e03131 · 2 uses"');
  });
});
