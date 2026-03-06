import { describe, it, expect } from 'vitest';
import {
  weightName, parseFontStack, formatSizeLineHeight,
  toFontShorthand, isGenericFont,
} from '../utils/fonts';

describe('weightName', () => {
  it('maps 400 to Regular', () => expect(weightName('400')).toBe('Regular'));
  it('maps 700 to Bold', () => expect(weightName('700')).toBe('Bold'));
  it('maps 100 to Thin', () => expect(weightName('100')).toBe('Thin'));
  it('maps 900 to Black', () => expect(weightName('900')).toBe('Black'));
  it('maps normal to Regular', () => expect(weightName('normal')).toBe('Regular'));
  it('maps bold to Bold', () => expect(weightName('bold')).toBe('Bold'));
  it('returns unknown values as-is', () => expect(weightName('950')).toBe('950'));
});

describe('parseFontStack', () => {
  it('parses single font', () => {
    expect(parseFontStack('Arial')).toEqual(['Arial']);
  });

  it('parses quoted font names', () => {
    expect(parseFontStack('"Helvetica Neue", Arial, sans-serif')).toEqual([
      'Helvetica Neue', 'Arial', 'sans-serif',
    ]);
  });

  it('handles single-quoted names', () => {
    expect(parseFontStack("'Open Sans', sans-serif")).toEqual(['Open Sans', 'sans-serif']);
  });

  it('handles empty string', () => {
    expect(parseFontStack('')).toEqual([]);
  });
});

describe('formatSizeLineHeight', () => {
  it('shows just size for normal line-height', () => {
    expect(formatSizeLineHeight('16px', 'normal')).toBe('16px');
  });

  it('shows size/lineHeight', () => {
    expect(formatSizeLineHeight('16px', '24px')).toBe('16px/24px');
  });
});

describe('toFontShorthand', () => {
  it('formats basic font', () => {
    const result = toFontShorthand({
      family: 'Arial', stack: ['Arial'], size: '16px',
      weight: '400', weightName: 'Regular', style: 'normal',
      lineHeight: 'normal', letterSpacing: 'normal', color: 'black',
    });
    expect(result).toBe('16px Arial');
  });

  it('includes weight and style', () => {
    const result = toFontShorthand({
      family: 'Georgia', stack: ['Georgia'], size: '14px',
      weight: '700', weightName: 'Bold', style: 'italic',
      lineHeight: '20px', letterSpacing: 'normal', color: 'black',
    });
    expect(result).toBe('italic 700 14px/20px Georgia');
  });
});

describe('isGenericFont', () => {
  it('identifies generic fonts', () => {
    expect(isGenericFont('serif')).toBe(true);
    expect(isGenericFont('sans-serif')).toBe(true);
    expect(isGenericFont('monospace')).toBe(true);
    expect(isGenericFont('system-ui')).toBe(true);
  });

  it('identifies non-generic fonts', () => {
    expect(isGenericFont('Arial')).toBe(false);
    expect(isGenericFont('Helvetica Neue')).toBe(false);
  });
});
