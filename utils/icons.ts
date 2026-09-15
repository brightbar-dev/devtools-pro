/**
 * Tool icons as inline SVG: 24×24, stroked in `currentColor`, so they follow the theme and
 * render the same on every OS (emoji do not). Drawn for DevTools Pro.
 */

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const TOOL_ICONS: Record<string, string> = {
  // curly braces
  'css-inspect': svg('<path d="M8 4c-2 0-3 1-3 3v2.5c0 1.2-.8 2-2 2.5 1.2.5 2 1.3 2 2.5V17c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2.5c0 1.2.8 2 2 2.5-1.2.5-2 1.3-2 2.5V17c0 2-1 3-3 3"/>'),
  // pipette
  'color-picker': svg('<path d="M14.5 5.5l4 4"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L17 9l-3-3z"/><path d="M14 6L5.5 14.5 4 20l5.5-1.5L18 10"/>'),
  // capital A with a baseline
  'font-detect': svg('<path d="M4 19L10 5h1.5l6 14"/><path d="M6.5 14h8.5"/><path d="M19 19h2"/>'),
  // box model: margin, border and content boxes
  spacing: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2.5 2.5"/><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'),
  // angle brackets around a slash
  'element-info': svg('<path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 5l-3 14"/>'),
  // price tag
  'meta-tags': svg('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  // camera
  screenshot: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  // figure in a circle
  accessibility: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.5" r="1.25"/><path d="M7.5 10.5l4.5 1 4.5-1"/><path d="M12 11.5v3l-2.5 4M12 14.5l2.5 4"/>'),
  // double dash between parentheses
  'css-vars': svg('<path d="M7 4c-2.5 2-3.5 5-3.5 8s1 6 3.5 8"/><path d="M17 4c2.5 2 3.5 5 3.5 8s-1 6-3.5 8"/><path d="M8.5 12h2.5M13 12h2.5"/>'),
  // ruler with ticks
  rulers: svg('<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5M20 8v3"/>'),
  // three-by-three grid
  'grid-overlay': svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
  // stacked layers
  assets: svg('<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5L12 21l9-4.5"/>'),
  // pencil
  'live-edit': svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
};

/** The icon for a tool id; a neutral square for anything unknown, so a missing icon is visible, not blank. */
export function toolIcon(id: string): string {
  return TOOL_ICONS[id] ?? svg('<rect x="4" y="4" width="16" height="16" rx="3"/>');
}
