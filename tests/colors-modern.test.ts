import { describe, it, expect } from 'vitest';
import { compositeOver, parseColor, toOklch, type RGBA } from '../utils/colors';

function expectNear(actual: RGBA | null, expected: Partial<RGBA>, tolerance = 2) {
  expect(actual).not.toBeNull();
  for (const [key, value] of Object.entries(expected)) {
    expect(Math.abs((actual as unknown as Record<string, number>)[key]! - (value as number))).toBeLessThanOrEqual(key === 'a' ? 0.001 : tolerance);
  }
}

describe('parseColor — modern syntaxes Chrome returns from getComputedStyle', () => {
  it('parses oklch with a unitless or percentage lightness', () => {
    expectNear(parseColor('oklch(0.628 0.2577 29.23)'), { r: 255, g: 0, b: 0, a: 1 });
    expectNear(parseColor('oklch(62.8% 0.2577 29.23)'), { r: 255, g: 0, b: 0 });
    expectNear(parseColor('oklch(1 0 0)'), { r: 255, g: 255, b: 255 });
    expectNear(parseColor('oklch(0 0 0)'), { r: 0, g: 0, b: 0 });
  });

  it('parses oklch alpha and a none hue', () => {
    expectNear(parseColor('oklch(0.5 0 none / 0.25)'), { a: 0.25 });
    expectNear(parseColor('oklch(0.5 0 0 / 50%)'), { a: 0.5 });
  });

  it('parses a Tailwind v4 palette colour (red-500)', () => {
    // --color-red-500: oklch(63.7% 0.237 25.331) ≈ #fb2c36
    expectNear(parseColor('oklch(63.7% 0.237 25.331)'), { r: 251, g: 44, b: 54 }, 3);
  });

  it('parses oklab, lab and lch', () => {
    expectNear(parseColor('oklab(0.628 0.2249 0.1258)'), { r: 255, g: 0, b: 0 });
    expectNear(parseColor('lab(54.29 80.8 69.89)'), { r: 255, g: 0, b: 0 }, 3);
    expectNear(parseColor('lch(54.29 106.84 40.85)'), { r: 255, g: 0, b: 0 }, 3);
    expectNear(parseColor('lab(100 0 0)'), { r: 255, g: 255, b: 255 });
  });

  it('parses color() in srgb, srgb-linear and display-p3, clamping out-of-gamut values', () => {
    expectNear(parseColor('color(srgb 1 0 0)'), { r: 255, g: 0, b: 0, a: 1 });
    expectNear(parseColor('color(srgb 0.5 0.5 0.5 / 0.5)'), { r: 128, g: 128, b: 128, a: 0.5 });
    expectNear(parseColor('color(srgb-linear 0.2158 0.2158 0.2158)'), { r: 128, g: 128, b: 128 });
    expectNear(parseColor('color(display-p3 1 1 1)'), { r: 255, g: 255, b: 255 });
    expectNear(parseColor('color(display-p3 1 0 0)'), { r: 255, g: 0, b: 0 });
  });

  it('rejects unsupported color spaces and garbage', () => {
    expect(parseColor('color(rec2020 1 0 0)')).toBeNull();
    expect(parseColor('oklch(banana)')).toBeNull();
  });

  it('keeps parsing the classic syntaxes', () => {
    expect(parseColor('rgb(224, 49, 49)')).toEqual({ r: 224, g: 49, b: 49, a: 1 });
    expect(parseColor('rgb(224 49 49 / 0.5)')).toEqual({ r: 224, g: 49, b: 49, a: 0.5 });
  });
});

describe('compositeOver', () => {
  it('returns the foreground when it is opaque', () => {
    expect(compositeOver({ r: 10, g: 20, b: 30, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });

  it('mixes a translucent foreground into an opaque background', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 })).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('handles two transparent colours', () => {
    expect(compositeOver({ r: 1, g: 2, b: 3, a: 0 }, { r: 4, g: 5, b: 6, a: 0 })).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

describe('toOklch', () => {
  it('formats sRGB red, white and black', () => {
    expect(toOklch({ r: 255, g: 0, b: 0, a: 1 })).toBe('oklch(62.8% 0.258 29.2)');
    expect(toOklch({ r: 255, g: 255, b: 255, a: 1 })).toBe('oklch(100% 0 0)');
    expect(toOklch({ r: 0, g: 0, b: 0, a: 1 })).toBe('oklch(0% 0 0)');
  });

  it('includes alpha when translucent', () => {
    expect(toOklch({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('oklch(62.8% 0.258 29.2 / 0.5)');
  });

  it('round-trips through parseColor', () => {
    const c = { r: 59, g: 91, b: 219, a: 1 };
    expectNear(parseColor(toOklch(c)), c, 1);
  });
});
