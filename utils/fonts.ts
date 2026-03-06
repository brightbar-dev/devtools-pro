/** Font detection and formatting. */

export interface FontInfo {
  family: string;
  stack: string[];
  size: string;
  weight: string;
  weightName: string;
  style: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
}

/** Map numeric font weights to names. */
const WEIGHT_NAMES: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semi Bold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
  normal: 'Regular',
  bold: 'Bold',
};

/** Get human-readable weight name. */
export function weightName(weight: string): string {
  return WEIGHT_NAMES[weight] || weight;
}

/** Parse font-family CSS value into individual font names. */
export function parseFontStack(fontFamily: string): string[] {
  return fontFamily
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Format font size + line height for display. */
export function formatSizeLineHeight(fontSize: string, lineHeight: string): string {
  if (lineHeight === 'normal') return fontSize;
  return `${fontSize}/${lineHeight}`;
}

/** Generate a CSS font shorthand from FontInfo. */
export function toFontShorthand(info: FontInfo): string {
  const parts: string[] = [];
  if (info.style !== 'normal') parts.push(info.style);
  if (info.weight !== '400' && info.weight !== 'normal') parts.push(info.weight);
  parts.push(formatSizeLineHeight(info.size, info.lineHeight));
  parts.push(info.stack[0] || info.family);
  return parts.join(' ');
}

/** Check if a font looks like a system/generic font. */
export function isGenericFont(name: string): boolean {
  const generic = [
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'math', 'fangsong',
  ];
  return generic.includes(name.toLowerCase());
}
