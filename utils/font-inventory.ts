/** Page font inventory: every rendered family with how often, and at which weights and sizes. */

import { weightName } from './fonts';
import type { PanelBlock, PanelModel } from './inspect';

export interface FontUse {
  family: string;
  weight: string;
  size: string;
  style: string;
}

export interface FontSummary {
  family: string;
  count: number;
  weights: string[];
  sizes: string[];
  italic: boolean;
}

const byNumber = (a: string, b: string) => parseFloat(a) - parseFloat(b);

export function summarizeFonts(uses: FontUse[]): FontSummary[] {
  const map = new Map<string, { count: number; weights: Set<string>; sizes: Set<string>; italic: boolean }>();
  for (const use of uses) {
    const entry = map.get(use.family) ?? { count: 0, weights: new Set<string>(), sizes: new Set<string>(), italic: false };
    entry.count++;
    entry.weights.add(use.weight);
    entry.sizes.add(use.size);
    entry.italic ||= use.style === 'italic' || use.style.startsWith('oblique');
    map.set(use.family, entry);
  }
  return [...map.entries()]
    .map(([family, e]) => ({ family, count: e.count, weights: [...e.weights].sort(byNumber), sizes: [...e.sizes].sort(byNumber), italic: e.italic }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

export function fontInventoryModel(summaries: FontSummary[], limit = 20): PanelModel {
  const blocks: PanelBlock[] = summaries.length === 0
    ? [{ kind: 'note', text: 'No text found on this page.' }]
    : summaries.slice(0, limit).flatMap((font): PanelBlock[] => [
      { kind: 'preview', text: font.family, style: { 'font-family': `"${font.family.replace(/"/g, '')}"` } },
      {
        kind: 'rows',
        rows: [
          { label: 'Family', value: font.family, copy: font.family },
          { label: 'Used by', value: `${font.count} element${font.count === 1 ? '' : 's'}` },
          { label: 'Weights', value: font.weights.map(w => `${w} ${weightName(w)}`).join(', ') + (font.italic ? ', italic' : '') },
          { label: 'Sizes', value: font.sizes.join(', ') },
        ],
      },
    ]);
  if (summaries.length > limit) blocks.push({ kind: 'note', text: `and ${summaries.length - limit} more` });
  return { toolId: 'font-detect', title: `Page fonts · ${summaries.length}`, path: [], blocks };
}
