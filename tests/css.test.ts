import { describe, it, expect } from 'vitest';
import {
  isDefaultValue, getAllProperties, getPropertyCategory,
  collapseBoxValues, formatCssRule, formatCssBlock, isCategoryRelevant,
} from '../utils/css';

describe('isDefaultValue', () => {
  it('detects static position as default', () => {
    expect(isDefaultValue('position', 'static')).toBe(true);
  });

  it('detects none float as default', () => {
    expect(isDefaultValue('float', 'none')).toBe(true);
  });

  it('detects non-default values', () => {
    expect(isDefaultValue('position', 'absolute')).toBe(false);
    expect(isDefaultValue('display', 'flex')).toBe(false);
  });

  it('returns false for unknown properties', () => {
    expect(isDefaultValue('unknown-prop', 'anything')).toBe(false);
  });

  it('handles multiple defaults', () => {
    expect(isDefaultValue('justify-content', 'normal')).toBe(true);
    expect(isDefaultValue('justify-content', 'flex-start')).toBe(true);
    expect(isDefaultValue('justify-content', 'center')).toBe(false);
  });
});

describe('getAllProperties', () => {
  it('returns a flat array of property names', () => {
    const props = getAllProperties();
    expect(props.length).toBeGreaterThan(50);
    expect(props).toContain('display');
    expect(props).toContain('font-family');
    expect(props).toContain('background-color');
  });
});

describe('getPropertyCategory', () => {
  it('finds Layout for display', () => {
    expect(getPropertyCategory('display')).toBe('Layout');
  });

  it('finds Typography for font-family', () => {
    expect(getPropertyCategory('font-family')).toBe('Typography');
  });

  it('finds Box Model for width', () => {
    expect(getPropertyCategory('width')).toBe('Box Model');
  });

  it('returns null for unknown', () => {
    expect(getPropertyCategory('unknown')).toBeNull();
  });
});

describe('collapseBoxValues', () => {
  it('collapses all same', () => {
    expect(collapseBoxValues('8px', '8px', '8px', '8px')).toBe('8px');
  });

  it('collapses vertical/horizontal', () => {
    expect(collapseBoxValues('8px', '16px', '8px', '16px')).toBe('8px 16px');
  });

  it('collapses left = right', () => {
    expect(collapseBoxValues('8px', '16px', '12px', '16px')).toBe('8px 16px 12px');
  });

  it('keeps all four when different', () => {
    expect(collapseBoxValues('1px', '2px', '3px', '4px')).toBe('1px 2px 3px 4px');
  });
});

describe('formatCssRule', () => {
  it('formats property: value;', () => {
    expect(formatCssRule('color', 'red')).toBe('color: red;');
  });
});

describe('formatCssBlock', () => {
  it('formats indented rules', () => {
    const result = formatCssBlock([
      { prop: 'color', value: 'red' },
      { prop: 'font-size', value: '16px' },
    ]);
    expect(result).toBe('  color: red;\n  font-size: 16px;');
  });
});

describe('isCategoryRelevant', () => {
  it('Flexbox relevant for flex display', () => {
    expect(isCategoryRelevant('Flexbox', 'flex')).toBe(true);
    expect(isCategoryRelevant('Flexbox', 'inline-flex')).toBe(true);
  });

  it('Flexbox not relevant for block', () => {
    expect(isCategoryRelevant('Flexbox', 'block')).toBe(false);
  });

  it('Grid relevant for grid display', () => {
    expect(isCategoryRelevant('Grid', 'grid')).toBe(true);
  });

  it('Grid not relevant for flex', () => {
    expect(isCategoryRelevant('Grid', 'flex')).toBe(false);
  });

  it('other categories always relevant', () => {
    expect(isCategoryRelevant('Layout', 'block')).toBe(true);
    expect(isCategoryRelevant('Typography', 'flex')).toBe(true);
  });
});
