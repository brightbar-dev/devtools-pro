import { describe, it, expect } from 'vitest';
import { auditTextContrast, effectiveBackground, isLargeText, requiredRatios, type BackgroundLayer, type TextSample } from '../utils/contrast';
import type { RGBA } from '../utils/colors';

const white: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const hex = (h: string, a = 1): RGBA => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a });
const clear = (): BackgroundLayer => ({ color: { r: 0, g: 0, b: 0, a: 0 }, image: false, opacity: 1 });
const solid = (h: string, a = 1): BackgroundLayer => ({ color: hex(h, a), image: false, opacity: 1 });

let nextId = 0;
function sample(color: RGBA, layers: BackgroundLayer[], fontSizePx = 16, fontWeight = 400): TextSample {
  const id = nextId++;
  return { id, text: `text ${id}`, selector: `p.t${id}`, color, layers, fontSizePx, fontWeight };
}

describe('effectiveBackground', () => {
  it('uses the element’s own opaque background', () => {
    expect(effectiveBackground([solid('#eeeeee'), solid('#000000')], white)).toEqual({ kind: 'solid', color: hex('#eeeeee'), opacity: 1 });
  });

  it('walks transparent layers out to the page canvas', () => {
    expect(effectiveBackground([clear(), clear()], white)).toEqual({ kind: 'solid', color: white, opacity: 1 });
  });

  it('composites translucent backgrounds over the first opaque one', () => {
    const bg = effectiveBackground([solid('#000000', 0.5), solid('#ffffff')], white);
    expect(bg).toEqual({ kind: 'solid', color: { r: 128, g: 128, b: 128, a: 1 }, opacity: 1 });
  });

  it('asks for a manual check when an image or gradient sits behind the text', () => {
    expect(effectiveBackground([clear(), { color: null, image: true, opacity: 1 }, solid('#ffffff')], white).kind).toBe('manual');
  });

  it('ignores an image hidden behind an opaque background', () => {
    const bg = effectiveBackground([solid('#222222'), { color: null, image: true, opacity: 1 }], white);
    expect(bg).toEqual({ kind: 'solid', color: hex('#222222'), opacity: 1 });
  });

  it('multiplies opacity along the chain', () => {
    const bg = effectiveBackground([{ ...solid('#ffffff'), opacity: 0.5 }, { ...clear(), opacity: 0.5 }], white);
    expect(bg.kind === 'solid' && bg.opacity).toBe(0.25);
  });
});

describe('large text', () => {
  it('follows WCAG: 24px, or 18.66px and bold', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
    expect(isLargeText(18, 700)).toBe(false);
  });

  it('lowers the required ratios for large text', () => {
    expect(requiredRatios(false)).toEqual({ aa: 4.5, aaa: 7 });
    expect(requiredRatios(true)).toEqual({ aa: 3, aaa: 4.5 });
  });
});

describe('auditTextContrast', () => {
  it('fails the teardown fixture’s #ddd-on-#eee paragraph at AA', () => {
    const s = sample(hex('#dddddd'), [solid('#eeeeee'), clear()]);
    const audit = auditTextContrast([s], white);
    expect(audit.checked).toBe(1);
    expect(audit.failAA).toHaveLength(1);
    expect(audit.failAA[0]).toMatchObject({ id: s.id, fg: '#dddddd', bg: '#eeeeee', required: 4.5, large: false });
    expect(audit.failAA[0]!.ratio).toBeGreaterThan(1.1);
    expect(audit.failAA[0]!.ratio).toBeLessThan(1.25);
  });

  it('puts #767676 on white (4.54:1) in the AAA-only list', () => {
    const audit = auditTextContrast([sample(hex('#767676'), [solid('#ffffff')])], white);
    expect(audit.failAA).toHaveLength(0);
    expect(audit.failAAAOnly).toHaveLength(1);
    expect(audit.failAAAOnly[0]).toMatchObject({ required: 7, ratio: 4.54 });
  });

  it('holds large text to 3:1 at AA', () => {
    const large = auditTextContrast([sample(hex('#949494'), [solid('#ffffff')], 24)], white);
    expect(large.failAA).toHaveLength(0);
    expect(large.failAAAOnly[0]).toMatchObject({ large: true, required: 4.5 });
    const normal = auditTextContrast([sample(hex('#949494'), [solid('#ffffff')], 16)], white);
    expect(normal.failAA[0]).toMatchObject({ large: false, required: 4.5 });
  });

  it('lists text on images or gradients as manual checks, not measured', () => {
    const s = sample(hex('#ffffff'), [{ color: null, image: true, opacity: 1 }]);
    const audit = auditTextContrast([s], white);
    expect(audit.checked).toBe(0);
    expect(audit.manual).toEqual([{ id: s.id, text: s.text, selector: s.selector, reason: 'Text sits on a background image or gradient' }]);
  });

  it('fades translucent text into its background before measuring', () => {
    const opaque = auditTextContrast([sample(hex('#000000'), [solid('#ffffff')])], white);
    expect(opaque.failAA).toHaveLength(0);
    const faded = auditTextContrast([sample(hex('#000000', 0.25), [solid('#ffffff')])], white);
    expect(faded.failAA).toHaveLength(1);
    expect(faded.failAA[0]!.fg).toBe('#bfbfbf');
  });

  it('treats element opacity like translucent text', () => {
    const audit = auditTextContrast([sample(hex('#000000'), [{ ...solid('#ffffff'), opacity: 0.2 }])], white);
    expect(audit.failAA).toHaveLength(1);
  });

  it('measures against a dark canvas when the page has no background', () => {
    const dark: RGBA = { r: 18, g: 18, b: 18, a: 1 };
    expect(auditTextContrast([sample(hex('#333333'), [clear()])], dark).failAA).toHaveLength(1);
    expect(auditTextContrast([sample(hex('#333333'), [clear()])], white).failAA).toHaveLength(0);
  });

  it('sorts failures worst first', () => {
    const audit = auditTextContrast([
      sample(hex('#999999'), [solid('#ffffff')]),
      sample(hex('#eeeeee'), [solid('#ffffff')]),
      sample(hex('#bbbbbb'), [solid('#ffffff')]),
    ], white);
    const ratios = audit.failAA.map(f => f.ratio);
    expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
    expect(audit.failAA[0]!.fg).toBe('#eeeeee');
  });
});
