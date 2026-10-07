/** Length units for the Measure tool: CSS reference conversions (1in = 96px = 2.54cm = 72pt), rem from the page's root font size. */

export const LENGTH_UNITS = ['px', 'rem', 'em', 'pt', 'cm', 'mm', 'in'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const DEFAULT_UNIT: LengthUnit = 'px';

/** The two font sizes relative units need. `fontSize` is the measured element's, when there is one. */
export interface UnitContext {
  rootFontSize: number;
  fontSize: number;
}

export const DEFAULT_CONTEXT: UnitContext = { rootFontSize: 16, fontSize: 16 };

export function isLengthUnit(value: unknown): value is LengthUnit {
  return typeof value === 'string' && (LENGTH_UNITS as readonly string[]).includes(value);
}

/** The stored unit, or px for anything that is not one. */
export function unitFrom(value: unknown): LengthUnit {
  return isLengthUnit(value) ? value : DEFAULT_UNIT;
}

/** The next unit in the list, wrapping around. */
export function nextUnit(unit: LengthUnit): LengthUnit {
  return LENGTH_UNITS[(LENGTH_UNITS.indexOf(unit) + 1) % LENGTH_UNITS.length]!;
}

/** CSS pixels per absolute unit. */
const PX_PER: Record<'in' | 'cm' | 'mm' | 'pt', number> = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72 };

/** Decimals kept per unit: enough that one step of the unit is still visible. */
const DECIMALS: Record<LengthUnit, number> = { px: 1, rem: 2, em: 2, pt: 1, cm: 2, mm: 1, in: 3 };

/** A length in CSS pixels as a number of `unit`, or null when a relative unit has no usable font size. */
export function convertPx(px: number, unit: LengthUnit, ctx: UnitContext = DEFAULT_CONTEXT): number | null {
  if (unit === 'px') return px;
  if (unit === 'rem') return ctx.rootFontSize > 0 ? px / ctx.rootFontSize : null;
  if (unit === 'em') return ctx.fontSize > 0 ? px / ctx.fontSize : null;
  return px / PX_PER[unit];
}

/** A length in `unit` as text ("12.7mm"); falls back to pixels when the unit cannot be computed. */
export function formatUnit(px: number, unit: LengthUnit, ctx: UnitContext = DEFAULT_CONTEXT): string {
  const value = convertPx(px, unit, ctx);
  if (value === null) return `${Number(px.toFixed(DECIMALS.px))}px`;
  const text = Number(value.toFixed(DECIMALS[unit]));
  return `${Object.is(text, -0) ? 0 : text}${unit}`;
}

/** A short note on what a relative unit is relative to, for panels; empty for absolute units. */
export function unitBasis(unit: LengthUnit, ctx: UnitContext = DEFAULT_CONTEXT): string {
  if (unit === 'rem') return `1rem = ${Number(ctx.rootFontSize.toFixed(2))}px (root font size)`;
  if (unit === 'em') return `1em = ${Number(ctx.fontSize.toFixed(2))}px (this element's font size)`;
  return '';
}
