/** DOM utility functions for element identification and info extraction. */

/** Generate a concise CSS selector for an element. */
export function elementSelector(el: { tagName: string; id?: string; className?: string }): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (classes.length > 0) return `${tag}.${classes.join('.')}`;
  }
  return tag;
}

/** Build a breadcrumb path from element to root. */
export function elementPath(selectors: string[]): string {
  return selectors.join(' > ');
}

/** Format element dimensions for display. */
export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} x ${Math.round(height)}`;
}

/** Extract text content preview from an element. */
export function textPreview(text: string, maxLength = 50): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + '...';
}

/** Escape HTML entities for safe display. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Generate a copyable CSS selector path. */
export function uniqueSelector(parts: Array<{ tag: string; id?: string; nth?: number }>): string {
  return parts.map(p => {
    if (p.id) return `${p.tag}#${p.id}`;
    if (p.nth !== undefined) return `${p.tag}:nth-child(${p.nth})`;
    return p.tag;
  }).join(' > ');
}

export interface MetaTag {
  name: string;
  content: string;
  type: 'meta' | 'og' | 'twitter' | 'other';
}

/** Categorize a meta tag by its name/property. */
export function categorizeMeta(name: string): MetaTag['type'] {
  if (name.startsWith('og:') || name.startsWith('article:')) return 'og';
  if (name.startsWith('twitter:')) return 'twitter';
  if (['description', 'keywords', 'author', 'viewport', 'robots', 'theme-color', 'charset'].includes(name)) return 'meta';
  return 'other';
}
