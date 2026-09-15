/**
 * Page-wide text contrast: the effective background behind a piece of text, WCAG large-text
 * rules, and the audit over every text sample the content script collects.
 */

import { compositeOver, contrastRatio, toHex, type RGBA } from './colors';

/** One element between the text and the page canvas, innermost first. */
export interface BackgroundLayer {
  /** Parsed computed background-color, null when unparseable. */
  color: RGBA | null;
  /** The element paints a background image or gradient. */
  image: boolean;
  /** Computed opacity, 0–1. */
  opacity: number;
}

export type EffectiveBackground =
  | { kind: 'solid'; color: RGBA; opacity: number }
  | { kind: 'manual'; reason: string };

/**
 * The colour text sits on: walk out from the text's element to the first opaque background,
 * then composite the translucent backgrounds inside it back in. An image or gradient before
 * that point cannot be judged from styles alone, so it is a manual check.
 */
export function effectiveBackground(layers: BackgroundLayer[], canvas: RGBA): EffectiveBackground {
  const stack: BackgroundLayer[] = [];
  let base: RGBA = canvas;
  for (const layer of layers) {
    if (layer.image) return { kind: 'manual', reason: 'Text sits on a background image or gradient' };
    stack.push(layer);
    if (layer.color && layer.color.a >= 1) {
      base = layer.color;
      stack.pop();
      break;
    }
  }
  let color = { ...base, a: 1 };
  for (let i = stack.length - 1; i >= 0; i--) {
    const c = stack[i]!.color;
    if (c && c.a > 0) color = compositeOver(c, color);
  }
  const opacity = layers.reduce((product, layer) => product * layer.opacity, 1);
  return { kind: 'solid', color, opacity };
}

/** WCAG large text: at least 24px, or at least 18.66px (14pt) and bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/** Minimum ratios for WCAG 1.4.3 (AA) and 1.4.6 (AAA). */
export function requiredRatios(large: boolean): { aa: number; aaa: number } {
  return large ? { aa: 3, aaa: 4.5 } : { aa: 4.5, aaa: 7 };
}

export interface TextSample {
  /** Index of the element in the content script's registry, for highlighting. */
  id: number;
  text: string;
  selector: string;
  color: RGBA;
  layers: BackgroundLayer[];
  fontSizePx: number;
  fontWeight: number;
}

export interface ContrastFinding {
  id: number;
  text: string;
  selector: string;
  ratio: number;
  fg: string;
  bg: string;
  large: boolean;
  required: number;
}

export interface ManualContrastCheck {
  id: number;
  text: string;
  selector: string;
  reason: string;
}

export interface ContrastAudit {
  checked: number;
  /** Below WCAG AA (1.4.3), worst first. */
  failAA: ContrastFinding[];
  /** Passes AA but below AAA (1.4.6), worst first. */
  failAAAOnly: ContrastFinding[];
  manual: ManualContrastCheck[];
}

/** Ratio of the text colour, faded by any translucency or opacity, against its background. */
export function sampleRatio(sample: TextSample, bg: { color: RGBA; opacity: number }): { ratio: number; fg: RGBA } {
  const alpha = sample.color.a * bg.opacity;
  const fg = alpha >= 1 ? { ...sample.color, a: 1 } : compositeOver({ ...sample.color, a: alpha }, bg.color);
  return { ratio: contrastRatio(fg, bg.color), fg };
}

export function auditTextContrast(samples: TextSample[], canvas: RGBA): ContrastAudit {
  const audit: ContrastAudit = { checked: 0, failAA: [], failAAAOnly: [], manual: [] };
  for (const sample of samples) {
    const bg = effectiveBackground(sample.layers, canvas);
    if (bg.kind === 'manual') {
      audit.manual.push({ id: sample.id, text: sample.text, selector: sample.selector, reason: bg.reason });
      continue;
    }
    audit.checked++;
    const { ratio, fg } = sampleRatio(sample, bg);
    const large = isLargeText(sample.fontSizePx, sample.fontWeight);
    const { aa, aaa } = requiredRatios(large);
    const finding = (required: number): ContrastFinding => ({
      id: sample.id, text: sample.text, selector: sample.selector,
      ratio: Math.round(ratio * 100) / 100, fg: toHex(fg), bg: toHex(bg.color), large, required,
    });
    if (ratio < aa) audit.failAA.push(finding(aa));
    else if (ratio < aaa) audit.failAAAOnly.push(finding(aaa));
  }
  audit.failAA.sort((a, b) => a.ratio - b.ratio);
  audit.failAAAOnly.sort((a, b) => a.ratio - b.ratio);
  return audit;
}
