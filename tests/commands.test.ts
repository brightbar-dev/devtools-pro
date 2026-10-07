import { describe, it, expect } from 'vitest';
import {
  MAX_RECENT, buildCommands, fuzzyMatch, isPaletteShortcut, moveSelection, rankCommands, recordRecent, sanitizeRecent,
} from '../utils/commands';
import { HOVER_TOOLS, TOOLS } from '../utils/tools';
import { isRelayable } from '../utils/messages';

const commands = buildCommands('css-inspect');
const titles = (q: string, recent: string[] = []) => rankCommands(commands, q, recent).map(r => r.command.title);

describe('buildCommands', () => {
  it('lists every tool once, hover tools as switches and page tools as popup entries', () => {
    for (const tool of TOOLS.filter(t => t.kind !== 'capture')) {
      expect(commands.filter(c => c.toolId === tool.id && (c.run.type === 'tool' || c.run.type === 'popup')), tool.id).toHaveLength(1);
    }
    expect(commands.filter(c => c.run.type === 'tool')).toHaveLength(HOVER_TOOLS.length);
    expect(commands.find(c => c.id === 'popup:meta-tags')?.run).toEqual({ type: 'popup', toolId: 'meta-tags' });
  });

  it('lists every tool-bar action with the key the tool bar uses', () => {
    for (const tool of TOOLS) {
      for (const action of tool.actions ?? []) {
        const cmd = commands.find(c => c.id === `action:${action.id}`);
        expect(cmd?.shortcut, action.id).toBe(action.key.toUpperCase());
        expect(cmd?.run).toEqual({ type: 'action', toolId: tool.id, actionId: action.id });
      }
    }
    expect(commands.find(c => c.id === 'action:capture-element')?.shortcut).toBe('S');
  });

  it('has the capture, exit and unique ids, and none are paid or promotional', () => {
    expect(new Set(commands.map(c => c.id)).size).toBe(commands.length);
    expect(commands.find(c => c.id === 'capture-page')?.run).toEqual({ type: 'capture-page' });
    expect(commands.find(c => c.id === 'exit')?.shortcut).toBe('Esc');
    expect(JSON.stringify(commands)).not.toMatch(/pro\b|upgrade|trial|premium|subscribe/i);
  });

  it('marks only the active tool', () => {
    expect(commands.filter(c => c.active).map(c => c.id)).toEqual(['tool:css-inspect']);
    expect(buildCommands(null).some(c => c.active)).toBe(false);
  });
});

describe('fuzzyMatch', () => {
  it('matches substrings, prefixes and scattered letters, case-insensitively', () => {
    expect(fuzzyMatch('css', 'CSS Inspector')?.indices).toEqual([0, 1, 2]);
    expect(fuzzyMatch('INSP', 'CSS Inspector')?.indices).toEqual([4, 5, 6, 7]);
    expect(fuzzyMatch('cvr', 'CSS Variables')).not.toBeNull();
    expect(fuzzyMatch('xyz', 'CSS Inspector')).toBeNull();
  });

  it('requires every word of the query, in any order', () => {
    expect(fuzzyMatch('page copy', 'Copy page palette')).not.toBeNull();
    expect(fuzzyMatch('copy zzz', 'Copy CSS')).toBeNull();
  });

  it('scores a prefix above a mid-word hit, and a substring above a scatter', () => {
    expect(fuzzyMatch('co', 'Color Picker')!.score).toBeGreaterThan(fuzzyMatch('co', 'Accordion')!.score);
    expect(fuzzyMatch('pic', 'Color Picker')!.score).toBeGreaterThan(fuzzyMatch('pcr', 'Color Picker')!.score);
  });

  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('  ', 'anything')).toEqual({ score: 0, indices: [] });
  });
});

describe('rankCommands', () => {
  it('shows the tools in toolbar order when nothing is typed and nothing was used', () => {
    const ranked = rankCommands(commands, '', []);
    expect(ranked).toHaveLength(commands.length);
    expect(ranked.some(r => r.recent)).toBe(false);
    expect(ranked[0]!.command.id).toBe('tool:css-inspect');
  });

  it('puts recently run commands first, newest first, once each', () => {
    const ranked = rankCommands(commands, '', ['action:palette', 'tool:spacing']);
    expect(ranked.slice(0, 2).map(r => [r.command.id, r.recent])).toEqual([['action:palette', true], ['tool:spacing', true]]);
    expect(ranked.filter(r => r.command.id === 'tool:spacing')).toHaveLength(1);
    expect(ranked).toHaveLength(commands.length);
  });

  it('puts the best title match first', () => {
    expect(titles('eyed')[0]).toBe('Eyedropper');
    expect(titles('grid')[0]).toBe('Grid Overlay');
    expect(titles('full')[0]).toBe('Screenshot full page');
  });

  it('highlights the matched characters of the title', () => {
    const top = rankCommands(commands, 'eyed', [])[0]!;
    expect(top.indices).toEqual([0, 1, 2, 3]);
  });

  it('finds commands by keyword, below title matches and without highlights', () => {
    const ranked = rankCommands(commands, 'wcag', []);
    expect(ranked[0]!.command.id).toBe('popup:accessibility');
    expect(ranked[0]!.indices).toEqual([]);
    const a = rankCommands(commands, 'margin', []).map(r => r.command.id);
    expect(a[0]).toBe('tool:spacing');
  });

  it('lets a recent command win a near tie but not beat a clearly better match', () => {
    // "c" matches many titles; a recent one rises.
    const withRecent = titles('co', ['action:copy-tailwind']);
    expect(withRecent.indexOf('Copy Tailwind')).toBeLessThan(titles('co').indexOf('Copy Tailwind'));
    expect(titles('eyedropper', ['exit'])[0]).toBe('Eyedropper');
  });

  it('returns nothing when no command matches', () => {
    expect(rankCommands(commands, 'qqqq', [])).toEqual([]);
  });
});

describe('recent commands', () => {
  it('records newest first without duplicates and caps the list', () => {
    expect(recordRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    const many = Array.from({ length: MAX_RECENT + 3 }, (_, i) => `id${i}`).reduce<string[]>((acc, id) => recordRecent(acc, id), []);
    expect(many).toHaveLength(MAX_RECENT);
    expect(many[0]).toBe(`id${MAX_RECENT + 2}`);
  });

  it('drops stored ids that are not commands, repeats, and non-arrays', () => {
    expect(sanitizeRecent(['tool:spacing', 'nope', 'tool:spacing', 7, 'exit'], commands)).toEqual(['tool:spacing', 'exit']);
    expect(sanitizeRecent('tool:spacing', commands)).toEqual([]);
    expect(sanitizeRecent(undefined, commands)).toEqual([]);
  });
});

describe('moveSelection', () => {
  it('wraps with the arrow keys', () => {
    expect(moveSelection(0, 3, 'ArrowUp')).toBe(2);
    expect(moveSelection(2, 3, 'ArrowDown')).toBe(0);
    expect(moveSelection(1, 3, 'ArrowDown')).toBe(2);
  });

  it('pages without wrapping and copes with an empty list', () => {
    expect(moveSelection(1, 20, 'PageDown')).toBe(6);
    expect(moveSelection(18, 20, 'PageDown')).toBe(19);
    expect(moveSelection(2, 20, 'PageUp')).toBe(0);
    expect(moveSelection(0, 0, 'ArrowDown')).toBe(-1);
  });
});

describe('palette shortcut', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('is a bare slash outside text fields', () => {
    expect(isPaletteShortcut(key('/'), false)).toBe(true);
    expect(isPaletteShortcut(key('/'), true)).toBe(false);
    expect(isPaletteShortcut(key('/', { ctrlKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key('/', { metaKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key('k', { ctrlKey: true }), false)).toBe(false);
  });

  it('collides with no tool-bar key', () => {
    const keys = new Set(['s', ...TOOLS.flatMap(t => (t.actions ?? []).map(a => a.key))]);
    expect(keys.has('/')).toBe(false);
  });

  it('can be relayed to every frame', () => {
    expect(isRelayable({ action: 'dtp:palette' })).toBe(true);
  });
});
