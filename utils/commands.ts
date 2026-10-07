/**
 * The command palette's logic, free of the DOM: what can be run, fuzzy filtering, and the
 * recently-used ordering. The inspector draws the list and runs the chosen command.
 */

import { TOOLS, type Tool } from './tools';

/** Key that opens the palette while a tool is on, when the focus is not in a text field. */
export const PALETTE_KEY = '/';
/** How many recently run commands are remembered. */
export const MAX_RECENT = 8;
/** `storage.local` key for the recent list. */
export const RECENT_STORAGE_KEY = 'recentCommands';

export type CommandRun =
  /** Switch the on-page inspector to a hover tool. */
  | { type: 'tool'; toolId: string }
  /** A tool-bar action. `toolId` is the tool it belongs to, or null when any tool offers it. */
  | { type: 'action'; toolId: string | null; actionId: string }
  /** Capture the whole page from the page. */
  | { type: 'capture-page' }
  /** Stop inspecting. */
  | { type: 'exit' }
  /** A tool whose report is shown in the toolbar popup, which a page cannot open. */
  | { type: 'popup'; toolId: string };

export interface Command {
  /** Stable id, also what is stored for "recently used". */
  id: string;
  title: string;
  /** Section the command is listed under. */
  group: string;
  /** Secondary text: what it does. */
  detail: string;
  /** The command's own key, as shown (e.g. `C`, `Esc`). */
  shortcut?: string;
  /** Extra words the filter matches, so "contrast" finds Accessibility. */
  keywords: string[];
  /** The tool this command switches to or belongs to, for the active marker. */
  toolId?: string;
  active: boolean;
  run: CommandRun;
}

const PAGE_TOOL_KEYWORDS: Record<string, string[]> = {
  'meta-tags': ['seo', 'open graph', 'viewport', 'head'],
  accessibility: ['a11y', 'wcag', 'contrast', 'alt', 'landmarks', 'headings'],
  'css-vars': ['custom properties', 'variables', 'tokens'],
  assets: ['images', 'scripts', 'stylesheets', 'fonts', 'resources'],
};

const TOOL_KEYWORDS: Record<string, string[]> = {
  'css-inspect': ['style', 'computed', 'inspector'],
  'color-picker': ['colour', 'contrast', 'hex', 'rgb'],
  'font-detect': ['typography', 'typeface', 'family'],
  spacing: ['margin', 'padding', 'box model'],
  'element-info': ['tag', 'class', 'dimensions', 'selector'],
  rulers: ['ruler', 'distance', 'size', 'gap'],
  'grid-overlay': ['flex', 'layout', 'tracks'],
  'live-edit': ['edit', 'undo', 'change'],
  screenshot: ['capture', 'png', 'image'],
};

function toolCommands(tools: readonly Tool[], activeTool: string | null): Command[] {
  const out: Command[] = [];
  for (const tool of tools) {
    if (tool.kind === 'hover') {
      out.push({
        id: `tool:${tool.id}`, title: tool.name, group: 'Tools', detail: tool.description,
        keywords: TOOL_KEYWORDS[tool.id] ?? [], toolId: tool.id, active: tool.id === activeTool,
        run: { type: 'tool', toolId: tool.id },
      });
    } else if (tool.kind === 'page') {
      out.push({
        id: `popup:${tool.id}`, title: tool.name, group: 'Page tools',
        detail: `Opens from the toolbar icon · ${tool.description}`,
        keywords: PAGE_TOOL_KEYWORDS[tool.id] ?? [], toolId: tool.id, active: false,
        run: { type: 'popup', toolId: tool.id },
      });
    }
  }
  return out;
}

/**
 * Every command, in the order shown when nothing is typed: the tools, then each tool's actions,
 * then the capture and exit commands. Tool ids and action keys come from `TOOLS`, so a new tool
 * or action appears here without being listed twice.
 */
export function buildCommands(activeTool: string | null, tools: readonly Tool[] = TOOLS): Command[] {
  const out = toolCommands(tools.filter(t => t.kind === 'hover'), activeTool);
  for (const tool of tools) {
    for (const action of tool.actions ?? []) {
      out.push({
        id: `action:${action.id}`, title: action.label, group: 'Actions',
        detail: `${tool.name} · ${action.description}`, shortcut: action.key.toUpperCase(),
        keywords: [tool.name, tool.shortName], toolId: tool.id, active: false,
        run: { type: 'action', toolId: tool.id, actionId: action.id },
      });
    }
  }
  out.push(
    {
      id: 'action:capture-element', title: 'Screenshot hovered element', group: 'Actions',
      detail: 'Save the hovered element as a PNG', shortcut: 'S',
      keywords: ['capture', 'png', 'image', 'screenshot'], active: false,
      run: { type: 'action', toolId: null, actionId: 'capture-element' },
    },
    {
      id: 'capture-page', title: 'Screenshot full page', group: 'Actions',
      detail: 'Save the whole page as a PNG (up to 16,000px)',
      keywords: ['capture', 'png', 'image', 'screenshot', 'scroll'], active: false,
      run: { type: 'capture-page' },
    },
  );
  out.push(...toolCommands(tools.filter(t => t.kind === 'page'), activeTool));
  out.push({
    id: 'exit', title: 'Stop inspecting', group: 'General', detail: 'Close the tools on this page, in every frame',
    shortcut: 'Esc', keywords: ['exit', 'close', 'quit', 'off'], active: false, run: { type: 'exit' },
  });
  return out;
}

// ── Fuzzy matching ─────────────────────────────────────────────────────────

export interface Match {
  score: number;
  /** Indices of the matched characters in the text, for highlighting. */
  indices: number[];
}

function isWordStart(text: string, i: number): boolean {
  return i === 0 || /[^a-z0-9]/.test(text[i - 1]!) || (/[a-z]/.test(text[i - 1]!) && /[A-Z]/.test(text[i]!));
}

/** Match one whitespace-free term in `text`: a substring beats a scattered subsequence. */
function matchTerm(term: string, text: string): Match | null {
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const at = lower.indexOf(t);
  if (at >= 0) {
    // Prefer an occurrence that starts a word over an earlier one in the middle of a word.
    let best = at;
    for (let i = at; i >= 0; i = lower.indexOf(t, i + 1)) {
      if (isWordStart(text, i)) {
        best = i;
        break;
      }
    }
    const score = 100 + (best === 0 ? 60 : 0) + (isWordStart(text, best) ? 40 : 0) - best * 0.5 - (text.length - t.length) * 0.1;
    return { score, indices: Array.from({ length: t.length }, (_, k) => best + k) };
  }
  const indices: number[] = [];
  let score = 10;
  let from = 0;
  for (const ch of t) {
    // Take a word start if one is ahead, otherwise the next occurrence.
    let found = -1;
    for (let i = lower.indexOf(ch, from); i >= 0; i = lower.indexOf(ch, i + 1)) {
      if (found < 0) found = i;
      if (isWordStart(text, i)) {
        found = i;
        break;
      }
      if (i - from > 12) break;
    }
    if (found < 0) return null;
    const prev = indices[indices.length - 1];
    if (prev !== undefined && found === prev + 1) score += 6;
    else score -= Math.min(found - from, 6) * 0.5;
    if (isWordStart(text, found)) score += 8;
    indices.push(found);
    from = found + 1;
  }
  return { score, indices };
}

/**
 * Score a query against a text: every whitespace-separated term must match, in any order.
 * Returns null when one does not.
 */
export function fuzzyMatch(query: string, text: string): Match | null {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0, indices: [] };
  let score = 0;
  const indices = new Set<number>();
  for (const term of terms) {
    const m = matchTerm(term, text);
    if (!m) return null;
    score += m.score;
    for (const i of m.indices) indices.add(i);
  }
  return { score, indices: [...indices].sort((a, b) => a - b) };
}

export interface RankedCommand {
  command: Command;
  /** Title characters to highlight. */
  indices: number[];
  /** True when listed because it was run recently (shown first while nothing is typed). */
  recent: boolean;
}

/** Keep only ids that are real commands, newest first, once each, so stored data cannot inject rows. */
export function sanitizeRecent(stored: unknown, commands: readonly Command[]): string[] {
  if (!Array.isArray(stored)) return [];
  const known = new Set(commands.map(c => c.id));
  const out: string[] = [];
  for (const id of stored) {
    if (typeof id === 'string' && known.has(id) && !out.includes(id)) out.push(id);
    if (out.length === MAX_RECENT) break;
  }
  return out;
}

/** Put `id` first in the recent list, without duplicates, capped at `MAX_RECENT`. */
export function recordRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter(r => r !== id)].slice(0, MAX_RECENT);
}

/**
 * The list to show for `query`. With nothing typed: recently run commands first (newest first),
 * then the rest in their own order. With a query: matches by score, a recent command getting a
 * bonus large enough to win a near tie but not to outrank a clearly better match.
 */
export function rankCommands(commands: readonly Command[], query: string, recent: readonly string[]): RankedCommand[] {
  const recency = new Map(recent.map((id, i) => [id, i]));
  if (query.trim() === '') {
    const byId = new Map(commands.map(c => [c.id, c]));
    const first = recent.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
    const seen = new Set(first.map(c => c.id));
    return [
      ...first.map(command => ({ command, indices: [], recent: true })),
      ...commands.filter(c => !seen.has(c.id)).map(command => ({ command, indices: [], recent: false })),
    ];
  }
  const scored: Array<RankedCommand & { score: number; order: number }> = [];
  commands.forEach((command, order) => {
    const title = fuzzyMatch(query, command.title);
    // Words that are not in the title (keywords, group, the tool it belongs to) still match,
    // but never beat a title match and are not highlighted.
    const extra = title ? null : fuzzyMatch(query, [command.group, command.detail, ...command.keywords].join(' '));
    if (!title && !extra) return;
    const rank = recency.get(command.id);
    const bonus = rank === undefined ? 0 : 20 - rank * 2;
    scored.push({
      command, indices: title?.indices ?? [], recent: rank !== undefined,
      score: (title ? title.score : Math.min(extra!.score, 60) * 0.5) + bonus, order,
    });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map(({ command, indices, recent: r }) => ({ command, indices, recent: r }));
}

/** Arrow-key movement through `count` rows, wrapping at both ends. */
export function moveSelection(index: number, count: number, key: string): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowUp') return index <= 0 ? count - 1 : index - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'PageDown') return Math.min(index + 5, count - 1);
  if (key === 'PageUp') return Math.max(index - 5, 0);
  return index;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Whether a key press opens the palette: a bare `/`, never while typing in a field. */
export function isPaletteShortcut(e: KeyLike, typing: boolean): boolean {
  return e.key === PALETTE_KEY && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
}
