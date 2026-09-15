/** Live edits with a real history: undo, redo, reset one element or everything, and export as CSS. */

export interface Edit {
  /** Which element, as a key the content script assigns. */
  target: number;
  /** A CSS property, or `#text` for the element's text content. */
  prop: string;
  /** Inline value before the edit ('' when there was none), or the text before. */
  before: string;
  after: string;
  /** Edits sharing a gesture id (one typing burst, one colour drag, one reset) undo together. */
  gesture?: number;
}

export interface EditHistory {
  done: Edit[];
  undone: Edit[];
}

export const TEXT_PROP = '#text';

export function emptyHistory(): EditHistory {
  return { done: [], undone: [] };
}

/**
 * Record an edit. A new edit clears redo. Consecutive edits to the same target and property
 * in the same gesture merge into one step that keeps the first `before`.
 */
export function recordEdit(history: EditHistory, edit: Edit): EditHistory {
  if (edit.before === edit.after) return history;
  const last = history.done.at(-1);
  if (last && edit.gesture !== undefined && last.gesture === edit.gesture && last.target === edit.target && last.prop === edit.prop) {
    const merged = { ...last, after: edit.after };
    const done = merged.before === merged.after ? history.done.slice(0, -1) : [...history.done.slice(0, -1), merged];
    return { done, undone: [] };
  }
  return { done: [...history.done, edit], undone: [] };
}

/** Undo the latest step (a whole gesture); returns its edits newest first, to apply as `before`. */
export function undo(history: EditHistory): { history: EditHistory; revert: Edit[] } {
  const last = history.done.at(-1);
  if (!last) return { history, revert: [] };
  let i = history.done.length - 1;
  if (last.gesture !== undefined) while (i > 0 && history.done[i - 1]!.gesture === last.gesture) i--;
  const step = history.done.slice(i);
  return { history: { done: history.done.slice(0, i), undone: [...history.undone, ...step] }, revert: [...step].reverse() };
}

/** Redo the most recently undone step; returns its edits in order, to apply as `after`. */
export function redo(history: EditHistory): { history: EditHistory; apply: Edit[] } {
  const last = history.undone.at(-1);
  if (!last) return { history, apply: [] };
  let i = history.undone.length - 1;
  if (last.gesture !== undefined) while (i > 0 && history.undone[i - 1]!.gesture === last.gesture) i--;
  const step = history.undone.slice(i);
  return { history: { done: [...history.done, ...step], undone: history.undone.slice(0, i) }, apply: step };
}

export interface NetChange {
  target: number;
  prop: string;
  original: string;
  current: string;
}

/** What differs from the page as loaded: per target and property, the first `before` and the last `after`. */
export function netChanges(history: EditHistory): NetChange[] {
  const byKey = new Map<string, NetChange>();
  for (const edit of history.done) {
    const key = `${edit.target}:${edit.prop}`;
    const existing = byKey.get(key);
    if (existing) existing.current = edit.after;
    else byKey.set(key, { target: edit.target, prop: edit.prop, original: edit.before, current: edit.after });
  }
  return [...byKey.values()].filter(c => c.original !== c.current);
}

/**
 * Reset one element (or everything when `target` is omitted) to how the page loaded. The reset
 * is recorded as one gesture, so it can be undone like any other step.
 */
export function resetEdits(history: EditHistory, gesture: number, target?: number): { history: EditHistory; apply: Edit[] } {
  const apply = netChanges(history)
    .filter(c => target === undefined || c.target === target)
    .map(c => ({ target: c.target, prop: c.prop, before: c.current, after: c.original, gesture }));
  let next = history;
  for (const edit of apply) next = { done: [...next.done, edit], undone: [] };
  return { history: next, apply };
}

/** The net changes as CSS rules, one per element, with text edits as comments. */
export function changesAsCss(history: EditHistory, selectorFor: (target: number) => string): string {
  const byTarget = new Map<number, NetChange[]>();
  for (const change of netChanges(history)) {
    const list = byTarget.get(change.target) ?? [];
    list.push(change);
    byTarget.set(change.target, list);
  }
  return [...byTarget.entries()].map(([target, changes]) => {
    const lines = changes.map(c => (c.prop === TEXT_PROP
      ? `  /* text: ${JSON.stringify(c.current).replace(/\*\//g, '* /')} */`
      : `  ${c.prop}: ${c.current || 'initial'};`));
    return `${selectorFor(target)} {\n${lines.join('\n')}\n}`;
  }).join('\n\n');
}
