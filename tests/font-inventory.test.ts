import { describe, it, expect } from 'vitest';
import { fontInventoryModel, summarizeFonts } from '../utils/font-inventory';
import { renderedFamily } from '../utils/fonts';

describe('renderedFamily', () => {
  it('returns the first family in the stack that is available', () => {
    const available = new Set(['Georgia']);
    expect(renderedFamily(['Inter', 'Georgia', 'serif'], f => available.has(f))).toBe('Georgia');
  });

  it('stops at a generic family, which always renders', () => {
    expect(renderedFamily(['Inter', 'system-ui', 'Georgia'], () => false)).toBe('system-ui');
  });

  it('falls back to the browser default when nothing in the stack is available', () => {
    expect(renderedFamily(['Nope', 'Missing'], () => false)).toBe('serif (browser default)');
    expect(renderedFamily([], () => false)).toBe('serif (browser default)');
  });
});

describe('summarizeFonts', () => {
  it('groups by family with counts, weights and sizes in numeric order', () => {
    const summary = summarizeFonts([
      { family: 'system-ui', weight: '400', size: '16px', style: 'normal' },
      { family: 'FixtureFont', weight: '700', size: '32px', style: 'normal' },
      { family: 'system-ui', weight: '700', size: '14px', style: 'normal' },
      { family: 'system-ui', weight: '400', size: '9px', style: 'italic' },
    ]);
    expect(summary).toEqual([
      { family: 'system-ui', count: 3, weights: ['400', '700'], sizes: ['9px', '14px', '16px'], italic: true },
      { family: 'FixtureFont', count: 1, weights: ['700'], sizes: ['32px'], italic: false },
    ]);
  });
});

describe('fontInventoryModel', () => {
  it('previews each family in itself and lists its use', () => {
    const model = fontInventoryModel(summarizeFonts([{ family: 'FixtureFont', weight: '700', size: '32px', style: 'normal' }]));
    expect(model.title).toBe('Page fonts · 1');
    expect(model.blocks).toEqual([
      { kind: 'preview', text: 'FixtureFont', style: { 'font-family': '"FixtureFont"' } },
      { kind: 'rows', rows: [
        { label: 'Family', value: 'FixtureFont', copy: 'FixtureFont' },
        { label: 'Used by', value: '1 element' },
        { label: 'Weights', value: '700 Bold' },
        { label: 'Sizes', value: '32px' },
      ] },
    ]);
  });

  it('caps the list and says how many more', () => {
    const uses = Array.from({ length: 5 }, (_, i) => ({ family: `F${i}`, weight: '400', size: '16px', style: 'normal' }));
    expect(fontInventoryModel(summarizeFonts(uses), 2).blocks.at(-1)).toEqual({ kind: 'note', text: 'and 3 more' });
  });

  it('handles a page without text', () => {
    expect(fontInventoryModel([]).blocks).toEqual([{ kind: 'note', text: 'No text found on this page.' }]);
  });
});
