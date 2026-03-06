import { describe, it, expect } from 'vitest';
import {
  groupVariablesByScope,
  categorizeVariable,
  groupVariablesByCategory,
  isColorValue,
  deduplicateVariables,
  sortVariables,
  filterVariables,
  type CssVariable,
} from '../utils/css-vars';

describe('groupVariablesByScope', () => {
  it('groups variables by their scope', () => {
    const vars: CssVariable[] = [
      { name: '--color-primary', value: '#4f46e5', scope: ':root' },
      { name: '--bg', value: '#fff', scope: ':root' },
      { name: '--btn-bg', value: 'red', scope: '.btn' },
    ];
    const groups = groupVariablesByScope(vars);
    expect(groups).toHaveLength(2);
    expect(groups[0].scope).toBe(':root');
    expect(groups[0].variables).toHaveLength(2);
    expect(groups[1].scope).toBe('.btn');
    expect(groups[1].variables).toHaveLength(1);
  });

  it('puts :root first regardless of input order', () => {
    const vars: CssVariable[] = [
      { name: '--x', value: '1', scope: '.foo' },
      { name: '--y', value: '2', scope: ':root' },
    ];
    const groups = groupVariablesByScope(vars);
    expect(groups[0].scope).toBe(':root');
  });

  it('returns empty array for empty input', () => {
    expect(groupVariablesByScope([])).toEqual([]);
  });
});

describe('categorizeVariable', () => {
  it('categorizes color variables', () => {
    expect(categorizeVariable('--color-primary')).toBe('Colors');
    expect(categorizeVariable('--bg-surface')).toBe('Colors');
    expect(categorizeVariable('--text-secondary')).toBe('Colors');
  });

  it('categorizes typography variables', () => {
    expect(categorizeVariable('--font-body')).toBe('Typography');
    expect(categorizeVariable('--line-height-tight')).toBe('Typography');
  });

  it('categorizes sizing variables', () => {
    expect(categorizeVariable('--spacing-4')).toBe('Sizing');
    expect(categorizeVariable('--border-radius-lg')).toBe('Sizing');
    expect(categorizeVariable('--gap-md')).toBe('Sizing');
  });

  it('categorizes effects', () => {
    expect(categorizeVariable('--shadow-lg')).toBe('Effects');
    expect(categorizeVariable('--outline-offset')).toBe('Effects');
  });

  it('categorizes motion', () => {
    expect(categorizeVariable('--transition-fast')).toBe('Motion');
    expect(categorizeVariable('--duration-300')).toBe('Motion');
    expect(categorizeVariable('--ease-in-out')).toBe('Motion');
  });

  it('categorizes z-index', () => {
    expect(categorizeVariable('--z-modal')).toBe('Z-Index');
  });

  it('returns Other for uncategorizable variables', () => {
    expect(categorizeVariable('--custom-thing')).toBe('Other');
  });
});

describe('groupVariablesByCategory', () => {
  it('groups variables into categories', () => {
    const vars: CssVariable[] = [
      { name: '--color-primary', value: '#4f46e5', scope: ':root' },
      { name: '--font-body', value: 'Inter', scope: ':root' },
      { name: '--spacing-4', value: '16px', scope: ':root' },
    ];
    const groups = groupVariablesByCategory(vars);
    expect(Object.keys(groups)).toContain('Colors');
    expect(Object.keys(groups)).toContain('Typography');
    expect(Object.keys(groups)).toContain('Sizing');
  });
});

describe('isColorValue', () => {
  it('detects hex colors', () => {
    expect(isColorValue('#fff')).toBe(true);
    expect(isColorValue('#4f46e5')).toBe(true);
  });

  it('detects rgb/hsl colors', () => {
    expect(isColorValue('rgb(255, 0, 0)')).toBe(true);
    expect(isColorValue('hsl(200, 50%, 50%)')).toBe(true);
    expect(isColorValue('oklch(0.7 0.15 200)')).toBe(true);
  });

  it('detects named colors', () => {
    expect(isColorValue('transparent')).toBe(true);
    expect(isColorValue('white')).toBe(true);
    expect(isColorValue('currentColor')).toBe(true);
  });

  it('rejects non-color values', () => {
    expect(isColorValue('16px')).toBe(false);
    expect(isColorValue('Inter, sans-serif')).toBe(false);
    expect(isColorValue('300')).toBe(false);
  });
});

describe('deduplicateVariables', () => {
  it('keeps first occurrence of duplicate names', () => {
    const vars: CssVariable[] = [
      { name: '--x', value: 'first', scope: ':root' },
      { name: '--x', value: 'second', scope: '.btn' },
      { name: '--y', value: 'only', scope: ':root' },
    ];
    const result = deduplicateVariables(vars);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('first');
  });
});

describe('sortVariables', () => {
  it('sorts alphabetically by name', () => {
    const vars: CssVariable[] = [
      { name: '--z', value: '1', scope: ':root' },
      { name: '--a', value: '2', scope: ':root' },
      { name: '--m', value: '3', scope: ':root' },
    ];
    const sorted = sortVariables(vars);
    expect(sorted.map(v => v.name)).toEqual(['--a', '--m', '--z']);
  });

  it('does not mutate original array', () => {
    const vars: CssVariable[] = [
      { name: '--z', value: '1', scope: ':root' },
      { name: '--a', value: '2', scope: ':root' },
    ];
    sortVariables(vars);
    expect(vars[0].name).toBe('--z');
  });
});

describe('filterVariables', () => {
  const vars: CssVariable[] = [
    { name: '--color-primary', value: '#4f46e5', scope: ':root' },
    { name: '--font-size-lg', value: '18px', scope: ':root' },
    { name: '--spacing-4', value: '16px', scope: ':root' },
  ];

  it('filters by name', () => {
    expect(filterVariables(vars, 'color')).toHaveLength(1);
  });

  it('filters by value', () => {
    expect(filterVariables(vars, '16px')).toHaveLength(1);
  });

  it('is case insensitive', () => {
    expect(filterVariables(vars, 'COLOR')).toHaveLength(1);
  });

  it('returns all for empty query', () => {
    expect(filterVariables(vars, '')).toHaveLength(3);
  });
});
