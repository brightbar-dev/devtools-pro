import { describe, it, expect } from 'vitest';
import { LENGTH_UNITS, convertPx, formatUnit, nextUnit, unitBasis, unitFrom } from '../utils/units';
import { formatLength, formatSize } from '../utils/measure';
import { buildPanelModel, type InspectTarget } from '../utils/inspect';

const ctx = { rootFontSize: 16, fontSize: 20 };

describe('convertPx', () => {
  it('uses the CSS reference pixel: 96px is 1in, 2.54cm, 25.4mm and 72pt', () => {
    expect(convertPx(96, 'in')).toBeCloseTo(1, 10);
    expect(convertPx(96, 'cm')).toBeCloseTo(2.54, 10);
    expect(convertPx(96, 'mm')).toBeCloseTo(25.4, 10);
    expect(convertPx(96, 'pt')).toBeCloseTo(72, 10);
  });

  it('divides by the root font size for rem and the element font size for em', () => {
    expect(convertPx(40, 'rem', { rootFontSize: 20, fontSize: 10 })).toBe(2);
    expect(convertPx(40, 'em', { rootFontSize: 20, fontSize: 10 })).toBe(4);
  });

  it('has no rem or em without a usable font size', () => {
    expect(convertPx(10, 'rem', { rootFontSize: 0, fontSize: 16 })).toBeNull();
    expect(convertPx(10, 'em', { rootFontSize: 16, fontSize: 0 })).toBeNull();
  });
});

describe('formatUnit', () => {
  it('formats each unit with the decimals that matter for it', () => {
    expect(formatUnit(96, 'in')).toBe('1in');
    expect(formatUnit(100, 'cm')).toBe('2.65cm');
    expect(formatUnit(100, 'mm')).toBe('26.5mm');
    expect(formatUnit(100, 'pt')).toBe('75pt');
    expect(formatUnit(100, 'rem', ctx)).toBe('6.25rem');
    expect(formatUnit(30, 'em', ctx)).toBe('1.5em');
    expect(formatUnit(12.46, 'px')).toBe('12.5px');
  });

  it('keeps the sign and never prints negative zero', () => {
    expect(formatUnit(-8, 'px')).toBe('-8px');
    expect(formatUnit(-0.0001, 'cm')).toBe('0cm');
  });

  it('falls back to pixels when a relative unit has no font size', () => {
    expect(formatUnit(24, 'rem', { rootFontSize: 0, fontSize: 0 })).toBe('24px');
  });
});

describe('unit helpers', () => {
  it('cycles through every unit and wraps', () => {
    const seen: string[] = [LENGTH_UNITS[0]];
    for (let i = 1; i < LENGTH_UNITS.length; i++) seen.push(nextUnit(seen.at(-1) as (typeof LENGTH_UNITS)[number]));
    expect(seen).toEqual([...LENGTH_UNITS]);
    expect(nextUnit('in')).toBe('px');
  });

  it('reads a stored unit, defaulting to px for anything else', () => {
    expect(unitFrom('mm')).toBe('mm');
    expect(unitFrom('furlong')).toBe('px');
    expect(unitFrom(undefined)).toBe('px');
  });

  it('says what a relative unit is relative to', () => {
    expect(unitBasis('rem', ctx)).toBe('1rem = 16px (root font size)');
    expect(unitBasis('em', ctx)).toBe("1em = 20px (this element's font size)");
    expect(unitBasis('cm', ctx)).toBe('');
  });
});

describe('measure labels', () => {
  it('keeps the unsigned distance label in any unit', () => {
    expect(formatLength(-96, 'in')).toBe('1in');
    expect(formatLength(24)).toBe('24px');
  });

  it('writes sizes with one suffix, and bare numbers for pixels as before', () => {
    expect(formatSize(120, 48)).toBe('120 × 48');
    expect(formatSize(96, 192, 'in')).toBe('1 × 2in');
    expect(formatSize(100, 50, 'cm')).toBe('2.65 × 1.32cm');
    expect(formatSize(32, 16, 'rem', ctx)).toBe('2 × 1rem');
  });
});

describe('Measure panel units', () => {
  const target = (fontSize: string): InspectTarget => ({
    tag: 'div', id: '', className: '',
    rect: { left: 10, top: 20, width: 192, height: 96 },
    style: prop => (prop === 'font-size' ? fontSize : ''),
    text: () => '',
    parent: () => null,
    previous: () => null,
    next: () => null,
    children: () => [],
  });
  const rows = (unit: 'px' | 'cm' | 'em', fontSize = '16px') => {
    const model = buildPanelModel('rulers', target(fontSize), { viewport: { width: 1000, height: 800 }, path: [], unit, rootFontSize: 16 });
    return model.blocks;
  };

  it('shows pixels by default, rounded', () => {
    const first = rows('px')[0]!;
    expect(first.kind === 'rows' && first.rows.slice(0, 2).map(r => r.value)).toEqual(['192px', '96px']);
  });

  it('converts the size rows to the chosen unit', () => {
    const first = rows('cm')[0]!;
    expect(first.kind === 'rows' && first.rows.slice(0, 2).map(r => r.value)).toEqual(['5.08cm', '2.54cm']);
  });

  it('measures em against the element font size and says so', () => {
    const blocks = rows('em', '24px');
    const first = blocks[0]!;
    expect(first.kind === 'rows' && first.rows[0]!.value).toBe('8em');
    expect(blocks.at(-1)).toEqual({ kind: 'note', text: "1em = 24px (this element's font size)" });
  });
});
