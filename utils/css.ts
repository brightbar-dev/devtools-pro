/** CSS property categorization and formatting utilities. */

export interface StyleCategory {
  name: string;
  properties: StyleProperty[];
}

export interface StyleProperty {
  prop: string;
  value: string;
  isDefault: boolean;
}

/** CSS properties grouped by category, in display order. */
export const PROPERTY_CATEGORIES: Record<string, string[]> = {
  'Layout': [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'float', 'clear', 'z-index', 'overflow', 'overflow-x', 'overflow-y',
    'box-sizing', 'visibility', 'opacity',
  ],
  'Flexbox': [
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
    'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order', 'gap',
    'row-gap', 'column-gap',
  ],
  'Grid': [
    'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
    'grid-column', 'grid-row', 'grid-area', 'grid-auto-flow',
    'grid-auto-columns', 'grid-auto-rows',
  ],
  'Box Model': [
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-radius',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
  ],
  'Typography': [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration',
    'text-transform', 'text-indent', 'text-overflow', 'white-space', 'word-break',
    'word-wrap', 'color',
  ],
  'Background': [
    'background-color', 'background-image', 'background-position',
    'background-size', 'background-repeat', 'background-attachment',
    'background-clip', 'background-origin',
  ],
  'Effects': [
    'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
    'mix-blend-mode', 'transform', 'transition', 'animation',
    'cursor', 'outline',
  ],
};

/** Default/initial values that we skip in compact display. */
const DEFAULTS: Record<string, string[]> = {
  display: ['inline'],
  position: ['static'],
  float: ['none'],
  clear: ['none'],
  overflow: ['visible'],
  'overflow-x': ['visible'],
  'overflow-y': ['visible'],
  visibility: ['visible'],
  opacity: ['1'],
  'z-index': ['auto'],
  'flex-direction': ['row'],
  'flex-wrap': ['nowrap'],
  'justify-content': ['normal', 'flex-start'],
  'align-items': ['normal', 'stretch'],
  'align-content': ['normal'],
  'flex-grow': ['0'],
  'flex-shrink': ['1'],
  'flex-basis': ['auto'],
  'align-self': ['auto'],
  order: ['0'],
  'box-sizing': ['content-box'],
  'font-style': ['normal'],
  'font-variant': ['normal'],
  'text-align': ['start'],
  'text-decoration': ['none', 'none solid rgb(0, 0, 0)'],
  'text-transform': ['none'],
  'text-indent': ['0px'],
  'text-overflow': ['clip'],
  'white-space': ['normal'],
  'word-break': ['normal'],
  'word-wrap': ['normal'],
  'letter-spacing': ['normal'],
  'word-spacing': ['normal'],
  'background-image': ['none'],
  'background-position': ['0% 0%'],
  'background-size': ['auto'],
  'background-repeat': ['repeat'],
  'background-attachment': ['scroll'],
  'background-clip': ['border-box'],
  'background-origin': ['padding-box'],
  'box-shadow': ['none'],
  'text-shadow': ['none'],
  filter: ['none'],
  'backdrop-filter': ['none'],
  'mix-blend-mode': ['normal'],
  transform: ['none'],
  transition: ['all 0s ease 0s', 'none'],
  animation: ['none 0s ease 0s 1 normal none running', 'none'],
  cursor: ['auto'],
  outline: ['none'],
  'border-top-width': ['0px'],
  'border-right-width': ['0px'],
  'border-bottom-width': ['0px'],
  'border-left-width': ['0px'],
  'border-top-style': ['none'],
  'border-right-style': ['none'],
  'border-bottom-style': ['none'],
  'border-left-style': ['none'],
  gap: ['normal'],
  'row-gap': ['normal'],
  'column-gap': ['normal'],
  'grid-auto-flow': ['row'],
};

/** Check if a CSS value is the browser default for that property. */
export function isDefaultValue(prop: string, value: string): boolean {
  const defaults = DEFAULTS[prop];
  if (!defaults) return false;
  return defaults.includes(value);
}

/** Get all property names in a flat list across categories. */
export function getAllProperties(): string[] {
  return Object.values(PROPERTY_CATEGORIES).flat();
}

/** Get the category name for a property. */
export function getPropertyCategory(prop: string): string | null {
  for (const [cat, props] of Object.entries(PROPERTY_CATEGORIES)) {
    if (props.includes(prop)) return cat;
  }
  return null;
}

/** Shorten margin/padding if all sides are equal. */
export function collapseBoxValues(top: string, right: string, bottom: string, left: string): string {
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}

/** Format a CSS property value for copy-paste. */
export function formatCssRule(prop: string, value: string): string {
  return `${prop}: ${value};`;
}

/** Generate a CSS rule block from property-value pairs. */
export function formatCssBlock(rules: Array<{ prop: string; value: string }>): string {
  return rules.map(r => `  ${formatCssRule(r.prop, r.value)}`).join('\n');
}

/** Determine if a property category is relevant for a given display value. */
export function isCategoryRelevant(category: string, display: string): boolean {
  if (category === 'Flexbox') return display.includes('flex');
  if (category === 'Grid') return display.includes('grid');
  return true;
}
