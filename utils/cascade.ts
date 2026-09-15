/** The authored side of the cascade: selector specificity and which matching declaration wins. */

export type Specificity = [ids: number, classes: number, types: number];

/** Split a selector list at top-level commas, leaving commas inside `:is()`, `[attr="a,b"]` etc. alone. */
export function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i]!;
    if (quote) {
      current += ch;
      if (ch === '\\') current += selectorText[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function maxOf(list: string): Specificity {
  return splitSelectorList(list).map(specificity).reduce<Specificity>((best, s) => (compareSpecificity(s, best) > 0 ? s : best), [0, 0, 0]);
}

/** Read a balanced parenthesised argument starting at `open` (the index of `(`). */
function readArgument(selector: string, open: number): { arg: string; end: number } {
  let depth = 0;
  for (let i = open; i < selector.length; i++) {
    if (selector[i] === '(') depth++;
    else if (selector[i] === ')' && --depth === 0) return { arg: selector.slice(open + 1, i), end: i + 1 };
  }
  return { arg: selector.slice(open + 1), end: selector.length };
}

/** Specificity of one complex selector (no top-level commas), per Selectors Level 4. */
export function specificity(selector: string): Specificity {
  let total: Specificity = [0, 0, 0];
  let i = 0;
  const s = selector;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '\\') {
      i += 2;
    } else if (ch === '#') {
      total = add(total, [1, 0, 0]);
      i++;
      while (i < s.length && /[\w-]|[^\x00-\x7F]|\\/.test(s[i]!)) i += s[i] === '\\' ? 2 : 1;
    } else if (ch === '.') {
      total = add(total, [0, 1, 0]);
      i++;
      while (i < s.length && /[\w-]|[^\x00-\x7F]|\\/.test(s[i]!)) i += s[i] === '\\' ? 2 : 1;
    } else if (ch === '[') {
      total = add(total, [0, 1, 0]);
      let depth = 0;
      for (; i < s.length; i++) {
        if (s[i] === '[') depth++;
        else if (s[i] === ']' && --depth === 0) break;
        else if (s[i] === '"' || s[i] === "'") {
          const q = s[i];
          for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++;
        }
      }
      i++;
    } else if (ch === ':') {
      const element = s[i + 1] === ':';
      i += element ? 2 : 1;
      const name = s.slice(i).match(/^[\w-]+/)?.[0]?.toLowerCase() ?? '';
      i += name.length;
      let arg: string | null = null;
      if (s[i] === '(') {
        const read = readArgument(s, i);
        arg = read.arg;
        i = read.end;
      }
      if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) total = add(total, [0, 0, 1]);
      else if (name === 'where') { /* zero specificity */ }
      else if ((name === 'is' || name === 'not' || name === 'has' || name === 'matches' || name === '-webkit-any') && arg !== null) total = add(total, maxOf(arg));
      else if ((name === 'nth-child' || name === 'nth-last-child') && arg !== null && /\bof\b/.test(arg)) total = add(add(total, [0, 1, 0]), maxOf(arg.split(/\bof\b/)[1] ?? ''));
      else total = add(total, [0, 1, 0]);
    } else if (/[a-zA-Z_]|[^\x00-\x7F]/.test(ch)) {
      total = add(total, [0, 0, 1]);
      while (i < s.length && /[\w-]|[^\x00-\x7F]|\\/.test(s[i]!)) i += s[i] === '\\' ? 2 : 1;
    } else {
      i++; // combinators, whitespace, `*`, `|`
    }
  }
  return total;
}

export interface AuthoredDeclaration {
  prop: string;
  value: string;
  important: boolean;
  /** The selector branch that matched, or `style=""` for inline styles. */
  selector: string;
  specificity: Specificity;
  /** Document order of the rule; later wins at equal specificity. */
  order: number;
  /** Where it came from, e.g. `styles.css` or `inline`. */
  source: string;
  inline?: boolean;
}

/** Cascade rank: importance and origin first, then specificity, then order. Inline beats any selector. */
function outranks(a: AuthoredDeclaration, b: AuthoredDeclaration): boolean {
  if (a.important !== b.important) return a.important;
  if (Boolean(a.inline) !== Boolean(b.inline)) return Boolean(a.inline);
  const spec = compareSpecificity(a.specificity, b.specificity);
  if (spec !== 0) return spec > 0;
  return a.order >= b.order;
}

/** The declaration that wins for each property among those matching an element. */
export function winningDeclarations(decls: AuthoredDeclaration[]): Map<string, AuthoredDeclaration> {
  const winners = new Map<string, AuthoredDeclaration>();
  for (const decl of decls) {
    const current = winners.get(decl.prop);
    if (!current || outranks(decl, current)) winners.set(decl.prop, decl);
  }
  return winners;
}

/** A short source label for a stylesheet URL: the file name, or `<style>` for inline sheets. */
export function sheetLabel(href: string | null | undefined): string {
  if (!href) return '<style>';
  try {
    const url = new URL(href);
    return url.pathname.split('/').filter(Boolean).pop() || url.hostname;
  } catch {
    return href;
  }
}

/**
 * Shorthands that can set a longhand. A rule written as `padding: var(--x)` leaves its
 * longhands empty in CSSOM (pending substitution), so the shorthand text is the authored value.
 */
export function shorthandCandidates(prop: string): string[] {
  const special: Record<string, string[]> = {
    'row-gap': ['gap'],
    'column-gap': ['gap'],
    'overflow-x': ['overflow'],
    'overflow-y': ['overflow'],
    'border-top-left-radius': ['border-radius'],
    'border-top-right-radius': ['border-radius'],
    'border-bottom-right-radius': ['border-radius'],
    'border-bottom-left-radius': ['border-radius'],
    top: ['inset'],
    right: ['inset'],
    bottom: ['inset'],
    left: ['inset'],
  };
  if (special[prop]) return special[prop]!;
  const border = prop.match(/^border-(top|right|bottom|left)-(width|style|color)$/);
  if (border) return [`border-${border[1]}`, `border-${border[2]}`, 'border'];
  const parts = prop.split('-');
  const out: string[] = [];
  for (let i = parts.length - 1; i > 0; i--) out.push(parts.slice(0, i).join('-'));
  return out;
}
