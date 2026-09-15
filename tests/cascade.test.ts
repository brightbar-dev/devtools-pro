import { describe, it, expect } from 'vitest';
import { compareSpecificity, sheetLabel, shorthandCandidates, specificity, splitSelectorList, winningDeclarations, type AuthoredDeclaration } from '../utils/cascade';

describe('splitSelectorList', () => {
  it('splits at top-level commas only', () => {
    expect(splitSelectorList('a, .b > c ,#d')).toEqual(['a', '.b > c', '#d']);
    expect(splitSelectorList(':is(a, b) c, [title="x,y"]')).toEqual([':is(a, b) c', '[title="x,y"]']);
  });
});

describe('specificity', () => {
  const cases: Array<[string, [number, number, number]]> = [
    ['*', [0, 0, 0]],
    ['div', [0, 0, 1]],
    ['.flex-demo > span', [0, 1, 1]],
    ['#shadow-host', [1, 0, 0]],
    ['header.fixed-header', [0, 1, 1]],
    ['a[href^="#"]:hover', [0, 2, 1]],
    ['ul li::marker', [0, 0, 3]],
    ['p:first-line', [0, 0, 2]],
    [':where(#x, .y) p', [0, 0, 1]],
    [':is(#x, .y) p', [1, 0, 1]],
    ['a:not(.b, #c)', [1, 0, 1]],
    ['li:nth-child(2n of .item)', [0, 2, 1]],
    ['.a\\:b', [0, 1, 0]],
  ];
  for (const [selector, expected] of cases) {
    it(`${selector} → ${expected.join(',')}`, () => {
      expect(specificity(selector)).toEqual(expected);
    });
  }

  it('compares id > class > type', () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 1], [0, 1, 1])).toBe(0);
  });
});

describe('winningDeclarations', () => {
  const decl = (over: Partial<AuthoredDeclaration>): AuthoredDeclaration => ({
    prop: 'padding-top', value: '8px', important: false, selector: 'div', specificity: [0, 0, 1], order: 0, source: 'a.css', ...over,
  });

  it('prefers higher specificity regardless of order', () => {
    const win = winningDeclarations([decl({ value: '1px', specificity: [0, 1, 0], order: 1 }), decl({ value: '2px', specificity: [0, 0, 1], order: 2 })]);
    expect(win.get('padding-top')?.value).toBe('1px');
  });

  it('prefers the later rule at equal specificity', () => {
    const win = winningDeclarations([decl({ value: '1px', order: 1 }), decl({ value: '2px', order: 2 })]);
    expect(win.get('padding-top')?.value).toBe('2px');
  });

  it('lets inline styles beat selectors, and !important beat inline', () => {
    const inline = decl({ value: 'inline', inline: true, selector: 'style=""', specificity: [0, 0, 0], order: 99 });
    expect(winningDeclarations([decl({ value: 'id', specificity: [1, 0, 0] }), inline]).get('padding-top')?.value).toBe('inline');
    expect(winningDeclarations([inline, decl({ value: 'important', important: true })]).get('padding-top')?.value).toBe('important');
  });

  it('keeps properties separate', () => {
    const win = winningDeclarations([decl({ prop: 'color', value: 'red' }), decl({ prop: 'padding-top', value: '4px' })]);
    expect([...win.keys()].sort()).toEqual(['color', 'padding-top']);
  });
});

describe('sheetLabel', () => {
  it('names a sheet by its file, or <style> when inline', () => {
    expect(sheetLabel('https://example.com/assets/site.css?v=3')).toBe('site.css');
    expect(sheetLabel(null)).toBe('<style>');
    expect(sheetLabel('https://cdn.example.com/')).toBe('cdn.example.com');
  });
});

describe('shorthandCandidates', () => {
  it('finds the shorthand that can carry a var() for a longhand', () => {
    expect(shorthandCandidates('padding-top')).toEqual(['padding']);
    expect(shorthandCandidates('border-left-color')).toEqual(['border-left', 'border-color', 'border']);
    expect(shorthandCandidates('border-bottom-left-radius')).toEqual(['border-radius']);
    expect(shorthandCandidates('column-gap')).toEqual(['gap']);
    expect(shorthandCandidates('grid-template-columns')).toEqual(['grid-template', 'grid']);
    expect(shorthandCandidates('color')).toEqual([]);
  });
});
