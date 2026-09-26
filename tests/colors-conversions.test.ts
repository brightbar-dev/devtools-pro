import { describe, it, expect } from 'vitest';
import { parseColor, rgbToHsl, toHsl } from '../utils/colors';

// parseColor and rgbToHsl run for every colour the Color Picker, CSS panel, palette and Live Edit
// show. The existing tests reach only the red sector of the hsl conversion and degree hues.
describe('hsl → rgb across every hue sector', () => {
  it.each([
    ['hsl(0, 100%, 50%)', { r: 255, g: 0, b: 0 }],
    ['hsl(60, 100%, 50%)', { r: 255, g: 255, b: 0 }],
    ['hsl(120, 100%, 50%)', { r: 0, g: 255, b: 0 }],
    ['hsl(180, 100%, 50%)', { r: 0, g: 255, b: 255 }],
    ['hsl(240, 100%, 50%)', { r: 0, g: 0, b: 255 }],
    ['hsl(300, 100%, 50%)', { r: 255, g: 0, b: 255 }],
    ['hsl(30, 100%, 50%)', { r: 255, g: 128, b: 0 }],
    ['hsl(210, 50%, 40%)', { r: 51, g: 102, b: 153 }],
    ['hsl(0, 0%, 50%)', { r: 128, g: 128, b: 128 }],
  ])('%s', (input, rgb) => {
    expect(parseColor(input)).toEqual({ ...rgb, a: 1 });
  });

  it('reads alpha as a number or a percentage, comma or slash separated', () => {
    expect(parseColor('hsla(240, 100%, 50%, 0.25)')).toEqual({ r: 0, g: 0, b: 255, a: 0.25 });
    expect(parseColor('hsl(240 100% 50% / 50%)')).toEqual({ r: 0, g: 0, b: 255, a: 0.5 });
  });
});

describe('rgb → hsl, the value shown and copied', () => {
  it.each([
    [{ r: 0, g: 255, b: 0, a: 1 }, 'hsl(120, 100%, 50%)'],
    [{ r: 0, g: 0, b: 255, a: 1 }, 'hsl(240, 100%, 50%)'],
    [{ r: 255, g: 0, b: 128, a: 1 }, 'hsl(330, 100%, 50%)'],
    [{ r: 51, g: 102, b: 153, a: 1 }, 'hsl(210, 50%, 40%)'],
    [{ r: 204, g: 230, b: 255, a: 1 }, 'hsl(209, 100%, 90%)'],
  ])('%o → %s', (rgba, hsl) => {
    expect(toHsl(rgba)).toBe(hsl);
  });

  it('round-trips the sector corners through parseColor', () => {
    for (const h of [0, 60, 120, 180, 240, 300]) {
      const c = parseColor(`hsl(${h}, 100%, 50%)`)!;
      expect(rgbToHsl(c)).toEqual({ h, s: 100, l: 50, a: 1 });
    }
  });
});

describe('the other syntaxes computed styles and authored values use', () => {
  it('parses 4-digit hex with alpha', () => {
    expect(parseColor('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0x88 / 255 });
  });

  it('rejects hex of the wrong length or with bad digits', () => {
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('#1234567')).toBeNull();
    expect(parseColor('#ggg')).toBeNull();
  });

  it('parses space-separated rgb with a percentage alpha (Chrome’s modern serialisation)', () => {
    expect(parseColor('rgb(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('reads oklch hues in rad and turn the same as degrees', () => {
    const degrees = parseColor('oklch(0.6 0.2 180)');
    expect(parseColor(`oklch(0.6 0.2 ${Math.PI}rad)`)).toEqual(degrees);
    expect(parseColor('oklch(0.6 0.2 0.5turn)')).toEqual(degrees);
  });

  // Guards hue units: 'grad' must not be read as 'rad' (both end in "rad").
  it('reads oklch and lch hues in grad the same as degrees', () => {
    expect(parseColor('oklch(0.6 0.2 200grad)')).toEqual(parseColor('oklch(0.6 0.2 180)'));
    expect(parseColor('lch(50 40 200grad)')).toEqual(parseColor('lch(50 40 180)'));
  });

  it('rejects color() with too few components or an unsupported space', () => {
    expect(parseColor('color(srgb 1)')).toBeNull();
    expect(parseColor('color(xyz 1 1 1)')).toBeNull();
  });
});
