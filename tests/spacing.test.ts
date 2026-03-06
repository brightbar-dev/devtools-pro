import { describe, it, expect } from 'vitest';
import {
  parsePx, formatPx, sidesEqual, formatSides, totalWidth, totalHeight,
} from '../utils/spacing';
import type { BoxModel } from '../utils/spacing';

describe('parsePx', () => {
  it('parses px values', () => expect(parsePx('16px')).toBe(16));
  it('parses decimal px', () => expect(parsePx('1.5px')).toBe(1.5));
  it('returns 0 for empty', () => expect(parsePx('')).toBe(0));
  it('returns 0 for auto', () => expect(parsePx('auto')).toBe(0));
  it('parses negative values', () => expect(parsePx('-8px')).toBe(-8));
});

describe('formatPx', () => {
  it('formats non-zero', () => expect(formatPx(16)).toBe('16px'));
  it('formats zero without unit', () => expect(formatPx(0)).toBe('0'));
});

describe('sidesEqual', () => {
  it('true when all equal', () => {
    expect(sidesEqual({ top: 8, right: 8, bottom: 8, left: 8 })).toBe(true);
  });

  it('false when different', () => {
    expect(sidesEqual({ top: 8, right: 16, bottom: 8, left: 16 })).toBe(false);
  });
});

describe('formatSides', () => {
  it('formats all same', () => {
    expect(formatSides({ top: 8, right: 8, bottom: 8, left: 8 })).toBe('8px');
  });

  it('formats vertical/horizontal', () => {
    expect(formatSides({ top: 8, right: 16, bottom: 8, left: 16 })).toBe('8px 16px');
  });

  it('formats three values', () => {
    expect(formatSides({ top: 8, right: 16, bottom: 24, left: 16 })).toBe('8px 16px 24px');
  });

  it('formats four values', () => {
    expect(formatSides({ top: 1, right: 2, bottom: 3, left: 4 })).toBe('1px 2px 3px 4px');
  });

  it('uses 0 without unit', () => {
    expect(formatSides({ top: 0, right: 0, bottom: 0, left: 0 })).toBe('0');
  });
});

describe('totalWidth / totalHeight', () => {
  const box: BoxModel = {
    content: { width: 100, height: 50 },
    padding: { top: 10, right: 20, bottom: 10, left: 20 },
    border: { top: 1, right: 1, bottom: 1, left: 1 },
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
  };

  it('calculates total width', () => {
    expect(totalWidth(box)).toBe(100 + 20 + 20 + 1 + 1 + 8 + 8);
  });

  it('calculates total height', () => {
    expect(totalHeight(box)).toBe(50 + 10 + 10 + 1 + 1 + 8 + 8);
  });
});
