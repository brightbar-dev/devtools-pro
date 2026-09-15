import { describe, it, expect } from 'vitest';
import { changesAsCss, emptyHistory, netChanges, recordEdit, redo, resetEdits, TEXT_PROP, undo, type Edit } from '../utils/edits';

const e = (over: Partial<Edit>): Edit => ({ target: 1, prop: 'padding-top', before: '', after: '12px', ...over });

describe('recordEdit', () => {
  it('appends edits and clears redo', () => {
    let h = recordEdit(emptyHistory(), e({}));
    h = undo(h).history;
    expect(h.undone).toHaveLength(1);
    h = recordEdit(h, e({ prop: 'color', before: '', after: 'blue' }));
    expect(h.done.map(x => x.prop)).toEqual(['color']);
    expect(h.undone).toEqual([]);
  });

  it('ignores no-op edits', () => {
    expect(recordEdit(emptyHistory(), e({ before: '8px', after: '8px' }))).toEqual(emptyHistory());
  });

  it('merges a typing burst into one step that keeps the first before', () => {
    let h = emptyHistory();
    for (const px of ['2px', '20px', '208px', '20px']) h = recordEdit(h, e({ before: h.done.at(-1)?.after ?? '', after: px, gesture: 7 }));
    expect(h.done).toEqual([{ target: 1, prop: 'padding-top', before: '', after: '20px', gesture: 7 }]);
  });

  it('drops a merged step that ends where it started', () => {
    let h = recordEdit(emptyHistory(), e({ before: '', after: '9px', gesture: 3 }));
    h = recordEdit(h, e({ before: '9px', after: '', gesture: 3 }));
    expect(h.done).toEqual([]);
  });

  it('keeps separate gestures as separate steps', () => {
    let h = recordEdit(emptyHistory(), e({ after: '9px', gesture: 1 }));
    h = recordEdit(h, e({ before: '9px', after: '10px', gesture: 2 }));
    expect(h.done).toHaveLength(2);
  });
});

describe('undo and redo', () => {
  it('walks back and forward one step at a time', () => {
    let h = recordEdit(emptyHistory(), e({}));
    h = recordEdit(h, e({ prop: 'color', after: 'red' }));
    const u1 = undo(h);
    expect(u1.revert).toEqual([e({ prop: 'color', after: 'red' })]);
    const u2 = undo(u1.history);
    expect(u2.revert[0]!.prop).toBe('padding-top');
    expect(undo(u2.history).revert).toEqual([]);
    const r1 = redo(u2.history);
    expect(r1.apply[0]!.prop).toBe('padding-top');
    expect(redo(r1.history).apply[0]!.prop).toBe('color');
    expect(redo(redo(r1.history).history).apply).toEqual([]);
  });

  it('undoes a multi-property gesture together, newest first', () => {
    let h = recordEdit(emptyHistory(), e({ prop: 'padding-top', gesture: 5 }));
    h = recordEdit(h, e({ prop: 'padding-bottom', gesture: 5 }));
    const { revert, history } = undo(h);
    expect(revert.map(x => x.prop)).toEqual(['padding-bottom', 'padding-top']);
    expect(redo(history).apply.map(x => x.prop)).toEqual(['padding-top', 'padding-bottom']);
  });
});

describe('netChanges and reset', () => {
  it('reports only what differs from the page as loaded', () => {
    let h = recordEdit(emptyHistory(), e({ before: '', after: '12px' }));
    h = recordEdit(h, e({ before: '12px', after: '' }));
    h = recordEdit(h, e({ prop: 'color', before: '', after: 'red' }));
    expect(netChanges(h)).toEqual([{ target: 1, prop: 'color', original: '', current: 'red' }]);
  });

  it('resets one element as a single undoable step', () => {
    let h = recordEdit(emptyHistory(), e({ target: 1, after: '12px' }));
    h = recordEdit(h, e({ target: 2, prop: 'color', after: 'red' }));
    const reset = resetEdits(h, 99, 1);
    expect(reset.apply).toEqual([{ target: 1, prop: 'padding-top', before: '12px', after: '', gesture: 99 }]);
    expect(netChanges(reset.history).map(c => c.target)).toEqual([2]);
    const undone = undo(reset.history);
    expect(undone.revert).toEqual(reset.apply);
    expect(netChanges(undone.history).map(c => c.target).sort()).toEqual([1, 2]);
  });

  it('resets everything, text included', () => {
    let h = recordEdit(emptyHistory(), e({ target: 1 }));
    h = recordEdit(h, e({ target: 2, prop: TEXT_PROP, before: 'Hi', after: 'Hello' }));
    const reset = resetEdits(h, 100);
    expect(reset.apply.map(a => [a.prop, a.after])).toEqual([['padding-top', ''], [TEXT_PROP, 'Hi']]);
    expect(netChanges(reset.history)).toEqual([]);
  });
});

describe('changesAsCss', () => {
  it('writes one rule per element with text edits as comments', () => {
    let h = recordEdit(emptyHistory(), e({ target: 1, prop: 'padding-top', after: '24px' }));
    h = recordEdit(h, e({ target: 1, prop: 'color', after: '#e03131' }));
    h = recordEdit(h, e({ target: 2, prop: TEXT_PROP, before: 'Flex A', after: 'Sign up */ now' }));
    h = recordEdit(h, e({ target: 3, prop: 'font-size', before: '16px', after: '' }));
    const css = changesAsCss(h, t => ['', '.card', '.cta', 'h1'][t]!);
    expect(css).toBe('.card {\n  padding-top: 24px;\n  color: #e03131;\n}\n\n.cta {\n  /* text: "Sign up * / now" */\n}\n\nh1 {\n  font-size: initial;\n}');
  });

  it('is empty without changes', () => {
    expect(changesAsCss(emptyHistory(), () => 'x')).toBe('');
  });
});
