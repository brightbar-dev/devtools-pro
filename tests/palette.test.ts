import { describe, it, expect } from 'vitest';
import { addRecentColor, buildPalette, paletteAsCss, uniqueColors } from '../utils/palette';

describe('buildPalette', () => {
  it('groups by role in a fixed order and counts equal colours once each', () => {
    const groups = buildPalette([
      { role: 'text', value: 'rgb(255, 255, 255)' },
      { role: 'background', value: 'rgb(224, 49, 49)' },
      { role: 'text', value: '#ffffff' },
      { role: 'background', value: 'rgb(224, 49, 49)' },
      { role: 'background', value: 'rgb(59, 91, 219)' },
    ]);
    expect(groups.map(g => g.role)).toEqual(['background', 'text']);
    expect(groups[0]).toEqual({ role: 'background', label: 'Backgrounds', colors: [{ hex: '#e03131', count: 2 }, { hex: '#3b5bdb', count: 1 }] });
    expect(groups[1]!.colors).toEqual([{ hex: '#ffffff', count: 2 }]);
  });

  it('drops transparent and unparseable colours', () => {
    const groups = buildPalette([
      { role: 'background', value: 'rgba(0, 0, 0, 0)' },
      { role: 'border', value: 'nonsense' },
      { role: 'border', value: 'rgb(204, 204, 204)' },
    ]);
    expect(groups).toEqual([{ role: 'border', label: 'Borders', colors: [{ hex: '#cccccc', count: 1 }] }]);
  });

  it('keeps translucent colours distinct from their opaque versions', () => {
    const groups = buildPalette([{ role: 'background', value: 'rgba(0, 0, 0, 0.5)' }, { role: 'background', value: 'rgb(0, 0, 0)' }]);
    expect(groups[0]!.colors.map(c => c.hex).sort()).toEqual(['#000000', '#00000080']);
  });

  it('reads modern colour syntax', () => {
    expect(buildPalette([{ role: 'svg', value: 'oklch(1 0 0)' }])[0]).toEqual({ role: 'svg', label: 'SVG fill & stroke', colors: [{ hex: '#ffffff', count: 1 }] });
  });

  it('breaks count ties by hex and caps each group', () => {
    const uses = ['#333333', '#111111', '#222222'].map(value => ({ role: 'text' as const, value }));
    expect(buildPalette(uses, 2)[0]!.colors).toEqual([{ hex: '#111111', count: 1 }, { hex: '#222222', count: 1 }]);
  });
});

describe('uniqueColors', () => {
  it('merges the same colour across roles', () => {
    const groups = buildPalette([
      { role: 'background', value: '#ffffff' },
      { role: 'text', value: '#ffffff' },
      { role: 'text', value: '#000000' },
    ]);
    expect(uniqueColors(groups)).toEqual([{ hex: '#ffffff', count: 2 }, { hex: '#000000', count: 1 }]);
  });
});

describe('paletteAsCss', () => {
  it('writes numbered custom properties per role with use counts', () => {
    const css = paletteAsCss(buildPalette([
      { role: 'background', value: '#e03131' },
      { role: 'background', value: '#e03131' },
      { role: 'text', value: '#ffffff' },
    ]));
    expect(css).toBe(':root {\n  --background-1: #e03131; /* 2 uses */\n  --text-1: #ffffff; /* 1 use */\n}');
  });
});

describe('addRecentColor', () => {
  it('puts the newest first, removes duplicates and caps the list', () => {
    expect(addRecentColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
    expect(addRecentColor(['#111111'], '#ABCDEF')).toEqual(['#abcdef', '#111111']);
    expect(addRecentColor(['#1', '#2', '#3'], '#4', 3)).toEqual(['#4', '#1', '#2']);
  });
});
