/** Copy an inspected element's styles as a CSS rule or as Tailwind classes, and the panels that show what was copied. */

import type { PathSegment } from './dom';
import { formatPath } from './dom';
import type { PanelBlock, PanelModel } from './inspect';
import type { Declaration, TailwindResult } from './tailwind';

/** Shorthands the inspector lists alongside their longhands; the longhands say it all. */
const REDUNDANT_SHORTHANDS: Record<string, string[]> = {
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  gap: ['row-gap', 'column-gap'],
  overflow: ['overflow-x', 'overflow-y'],
};

export function withoutRedundantShorthands(decls: Declaration[]): Declaration[] {
  const present = new Set(decls.map(d => d.prop));
  return decls.filter(d => !(REDUNDANT_SHORTHANDS[d.prop]?.every(longhand => present.has(longhand))));
}

/** A CSS rule, with the element's path as a comment so the paste says where it came from. */
export function cssRuleText(selector: string, decls: Declaration[], path: PathSegment[] = []): string {
  const body = withoutRedundantShorthands(decls).map(d => `  ${d.prop}: ${d.value};`).join('\n');
  const comment = path.length > 0 ? `/* ${formatPath(path, Infinity)} */\n` : '';
  return `${comment}${selector} {\n${body}\n}`;
}

export function tailwindText(result: TailwindResult): string {
  return result.classes.join(' ');
}

export function copiedCssModel(text: string, count: number, path: PathSegment[]): PanelModel {
  return {
    toolId: 'css-inspect',
    title: `Copied as CSS · ${count} declaration${count === 1 ? '' : 's'}`,
    path,
    blocks: [{ kind: 'code', text }],
  };
}

export function copiedTailwindModel(result: TailwindResult, path: PathSegment[]): PanelModel {
  const blocks: PanelBlock[] = [{ kind: 'code', text: tailwindText(result) || '(no classes)' }];
  if (result.unmapped.length > 0) {
    blocks.push({
      kind: 'rows',
      title: `Not mapped · ${result.unmapped.length}`,
      rows: result.unmapped.map(d => ({ label: d.prop, value: d.value, copy: `${d.prop}: ${d.value};` })),
    });
  } else {
    blocks.push({ kind: 'note', text: 'Every declaration mapped to a class.' });
  }
  return {
    toolId: 'css-inspect',
    title: `Copied as Tailwind · ${result.classes.length} class${result.classes.length === 1 ? '' : 'es'}`,
    path,
    blocks,
  };
}
