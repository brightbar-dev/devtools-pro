/** Tool definitions for DevTools Pro. All 12 tools are available to everyone. */

/**
 * How a tool runs:
 * - `hover`: an on-page inspector, injected into every frame; the panel follows the pointer.
 * - `page`: a whole-page report shown in the popup; a collector is injected, then asked.
 * - `capture`: runs from the popup without reading the page's DOM.
 */
export type ToolKind = 'hover' | 'page' | 'capture';

/** An on-page action a hover tool offers in the tool bar, with a single-key shortcut. */
export interface ToolAction {
  id: string;
  label: string;
  key: string;
  description: string;
}

export interface Tool {
  id: string;
  name: string;
  /** Label for the compact on-page toolbar. */
  shortName: string;
  icon: string;
  description: string;
  kind: ToolKind;
  actions?: ToolAction[];
}

export const TOOLS: Tool[] = [
  { id: 'css-inspect', name: 'CSS Inspector', shortName: 'CSS', icon: '{}', description: 'Inspect computed CSS on any element', kind: 'hover' },
  {
    id: 'color-picker', name: 'Color Picker', shortName: 'Color', icon: '🎨', kind: 'hover',
    description: 'Hover colours with AA/AAA contrast, eyedropper any pixel, page palette',
    actions: [
      { id: 'eyedropper', label: 'Eyedropper', key: 'e', description: 'Pick any pixel on the screen' },
      { id: 'palette', label: 'Palette', key: 'p', description: 'Every colour used on this page' },
    ],
  },
  { id: 'font-detect', name: 'Font Detector', shortName: 'Font', icon: 'Aa', description: 'Detect fonts, sizes, weights on any element', kind: 'hover' },
  { id: 'spacing', name: 'Spacing', shortName: 'Spacing', icon: '⬜', description: 'Visualize margins, padding, and borders', kind: 'hover' },
  { id: 'element-info', name: 'Element Info', shortName: 'Element', icon: '<>', description: 'Tag, classes, dimensions, position', kind: 'hover' },
  { id: 'meta-tags', name: 'Page Meta', shortName: 'Meta', icon: 'ℹ', description: 'View meta tags, Open Graph, viewport', kind: 'page' },
  { id: 'screenshot', name: 'Screenshot', shortName: 'Shot', icon: '📸', description: 'Capture the visible part of the page as PNG', kind: 'capture' },
  { id: 'accessibility', name: 'Accessibility', shortName: 'A11y', icon: 'A11y', description: 'Audit contrast, alt text, labels, headings and landmarks, with WCAG references', kind: 'page' },
  { id: 'css-vars', name: 'CSS Variables', shortName: 'Vars', icon: '--', description: 'List all CSS custom properties', kind: 'page' },
  { id: 'rulers', name: 'Rulers', shortName: 'Rulers', icon: '📏', description: 'Measure distances between elements', kind: 'hover' },
  { id: 'grid-overlay', name: 'Grid Overlay', shortName: 'Grid', icon: '▦', description: 'Visualize grid and flexbox layouts', kind: 'hover' },
  { id: 'assets', name: 'Page Assets', shortName: 'Assets', icon: '📦', description: 'List images, fonts, scripts, stylesheets', kind: 'page' },
];

/** The on-page inspectors, in toolbar order. */
export const HOVER_TOOLS: Tool[] = TOOLS.filter(t => t.kind === 'hover');

export class UnknownToolError extends Error {
  readonly toolId: string;

  constructor(toolId: string, detail = 'is not a tool') {
    super(`Tool id "${toolId}" ${detail}`);
    this.name = 'UnknownToolError';
    this.toolId = toolId;
  }
}

export function findTool(id: string): Tool | undefined {
  return TOOLS.find(t => t.id === id);
}

/** Look a tool up by id. Throws for an unknown id, so a typo fails loudly instead of quietly becoming another tool. */
export function getTool(id: string): Tool {
  const tool = findTool(id);
  if (!tool) throw new UnknownToolError(id);
  return tool;
}

/** Look up an on-page inspector. Throws for unknown ids and for tools that are not hover tools. */
export function getHoverTool(id: string): Tool {
  const tool = getTool(id);
  if (tool.kind !== 'hover') throw new UnknownToolError(id, `is a ${tool.kind} tool, not an on-page inspector`);
  return tool;
}
