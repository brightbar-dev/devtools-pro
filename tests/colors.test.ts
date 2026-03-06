import { describe, it, expect } from 'vitest';
import {
  parseColor, toHex, toRgb, toHsl, rgbToHsl,
  luminance, contrastRatio, wcagRating, isTransparent,
} from '../utils/colors';

describe('parseColor', () => {
  it('parses hex 6-digit', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses hex 3-digit', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses hex 8-digit with alpha', () => {
    const c = parseColor('#ff000080');
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.a).toBeCloseTo(0.502, 2);
  });

  it('parses rgb()', () => {
    expect(parseColor('rgb(100, 200, 50)')).toEqual({ r: 100, g: 200, b: 50, a: 1 });
  });

  it('parses rgba()', () => {
    expect(parseColor('rgba(100, 200, 50, 0.5)')).toEqual({ r: 100, g: 200, b: 50, a: 0.5 });
  });

  it('parses hsl()', () => {
    const c = parseColor('hsl(0, 100%, 50%)');
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });

  it('parses named colors', () => {
    expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('blue')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('parses transparent', () => {
    const c = parseColor('transparent');
    expect(c).not.toBeNull();
    expect(c!.a).toBe(0);
  });

  it('returns null for invalid', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('none')).toBeNull();
    expect(parseColor('notacolor')).toBeNull();
  });

  it('handles case insensitive', () => {
    expect(parseColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('RED')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
});

describe('toHex', () => {
  it('formats opaque color', () => {
    expect(toHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
  });

  it('formats transparent color with alpha', () => {
    const hex = toHex({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(hex).toBe('#ff000080');
  });

  it('pads single-digit channels', () => {
    expect(toHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
  });
});

describe('toRgb', () => {
  it('formats opaque', () => {
    expect(toRgb({ r: 255, g: 128, b: 0, a: 1 })).toBe('rgb(255, 128, 0)');
  });

  it('formats with alpha', () => {
    expect(toRgb({ r: 255, g: 128, b: 0, a: 0.5 })).toBe('rgba(255, 128, 0, 0.5)');
  });
});

describe('toHsl', () => {
  it('formats opaque red', () => {
    const hsl = toHsl({ r: 255, g: 0, b: 0, a: 1 });
    expect(hsl).toBe('hsl(0, 100%, 50%)');
  });

  it('formats with alpha', () => {
    const hsl = toHsl({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(hsl).toBe('hsla(0, 100%, 50%, 0.5)');
  });
});

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const { h, s, l } = rgbToHsl({ r: 255, g: 0, b: 0, a: 1 });
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts white', () => {
    const { h, s, l } = rgbToHsl({ r: 255, g: 255, b: 255, a: 1 });
    expect(s).toBe(0);
    expect(l).toBe(100);
  });

  it('converts gray', () => {
    const { s, l } = rgbToHsl({ r: 128, g: 128, b: 128, a: 1 });
    expect(s).toBe(0);
    expect(l).toBe(50);
  });
});

describe('luminance', () => {
  it('black is 0', () => {
    expect(luminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 3);
  });

  it('white is 1', () => {
    expect(luminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 3);
  });
});

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    const ratio = contrastRatio(
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 }
    );
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('same color is 1:1', () => {
    const c = { r: 128, g: 128, b: 128, a: 1 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 1);
  });

  it('is commutative', () => {
    const a = { r: 255, g: 0, b: 0, a: 1 };
    const b = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
});

describe('wcagRating', () => {
  it('AAA for 7+', () => expect(wcagRating(7)).toBe('AAA'));
  it('AA for 4.5-7', () => expect(wcagRating(4.5)).toBe('AA'));
  it('AA Large for 3-4.5', () => expect(wcagRating(3)).toBe('AA Large'));
  it('Fail for <3', () => expect(wcagRating(2)).toBe('Fail'));
});

describe('isTransparent', () => {
  it('true for a=0', () => expect(isTransparent({ r: 0, g: 0, b: 0, a: 0 })).toBe(true));
  it('false for a=1', () => expect(isTransparent({ r: 0, g: 0, b: 0, a: 1 })).toBe(false));
  it('false for a=0.5', () => expect(isTransparent({ r: 0, g: 0, b: 0, a: 0.5 })).toBe(false));
});
