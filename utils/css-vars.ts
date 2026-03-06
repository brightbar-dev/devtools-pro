/** CSS custom property (variable) extraction and categorization. */

export interface CssVariable {
  name: string;
  value: string;
  scope: string; // ':root', '.class', '#id', etc.
}

export interface CssVariableGroup {
  scope: string;
  variables: CssVariable[];
}

/** Extract CSS variables from an array of raw variable data. */
export function groupVariablesByScope(vars: CssVariable[]): CssVariableGroup[] {
  const map = new Map<string, CssVariable[]>();
  for (const v of vars) {
    const existing = map.get(v.scope) || [];
    existing.push(v);
    map.set(v.scope, existing);
  }
  // Sort: :root first, then alphabetical
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === ':root') return -1;
      if (b === ':root') return 1;
      return a.localeCompare(b);
    })
    .map(([scope, variables]) => ({ scope, variables }));
}

/** Categorize a CSS variable by its name prefix. */
export function categorizeVariable(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('color') || lower.includes('bg') || lower.includes('fg') || lower.includes('text-')) return 'Colors';
  if (lower.includes('font') || lower.includes('text-size') || lower.includes('line-height') || lower.includes('letter-spacing')) return 'Typography';
  if (lower.includes('spacing') || lower.includes('gap') || lower.includes('margin') || lower.includes('padding') || lower.includes('size') || lower.includes('width') || lower.includes('height') || lower.includes('radius')) return 'Sizing';
  if (lower.includes('shadow') || lower.includes('border-color') || lower.includes('border-style') || lower.includes('outline')) return 'Effects';
  if (lower.includes('z-') || lower.includes('z_')) return 'Z-Index';
  if (lower.includes('transition') || lower.includes('duration') || lower.includes('delay') || lower.includes('ease') || lower.includes('animation')) return 'Motion';
  return 'Other';
}

/** Group variables by their inferred category. */
export function groupVariablesByCategory(vars: CssVariable[]): Record<string, CssVariable[]> {
  const groups: Record<string, CssVariable[]> = {};
  for (const v of vars) {
    const cat = categorizeVariable(v.name);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(v);
  }
  return groups;
}

/** Check if a value looks like a color value. */
export function isColorValue(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('#')) return true;
  if (v.startsWith('rgb') || v.startsWith('hsl') || v.startsWith('oklch') || v.startsWith('lch') || v.startsWith('lab')) return true;
  // Named colors — check common ones
  const named = ['transparent', 'currentcolor', 'inherit', 'white', 'black', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'gray', 'grey'];
  if (named.includes(v.toLowerCase())) return true;
  return false;
}

/** Deduplicate variables with the same name (keep first occurrence / most specific scope). */
export function deduplicateVariables(vars: CssVariable[]): CssVariable[] {
  const seen = new Map<string, CssVariable>();
  for (const v of vars) {
    if (!seen.has(v.name)) {
      seen.set(v.name, v);
    }
  }
  return [...seen.values()];
}

/** Sort variables alphabetically by name. */
export function sortVariables(vars: CssVariable[]): CssVariable[] {
  return [...vars].sort((a, b) => a.name.localeCompare(b.name));
}

/** Filter variables matching a search query. */
export function filterVariables(vars: CssVariable[], query: string): CssVariable[] {
  const lower = query.toLowerCase();
  return vars.filter(v =>
    v.name.toLowerCase().includes(lower) ||
    v.value.toLowerCase().includes(lower)
  );
}
