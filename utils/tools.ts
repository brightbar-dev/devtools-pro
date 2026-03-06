/** Tool definitions for DevTools Pro. Free vs Pro tier. */

export interface Tool {
  id: string;
  name: string;
  icon: string;
  description: string;
  tier: 'free' | 'pro';
}

export const TOOLS: Tool[] = [
  // Free tier
  { id: 'css-inspect', name: 'CSS Inspector', icon: '{}', description: 'Inspect computed CSS on any element', tier: 'free' },
  { id: 'color-picker', name: 'Color Picker', icon: '🎨', description: 'Pick colors and copy as hex/rgb/hsl', tier: 'free' },
  { id: 'font-detect', name: 'Font Detector', icon: 'Aa', description: 'Detect fonts, sizes, weights on any element', tier: 'free' },
  { id: 'spacing', name: 'Spacing', icon: '⬜', description: 'Visualize margins, padding, and borders', tier: 'free' },
  { id: 'element-info', name: 'Element Info', icon: '<>', description: 'Tag, classes, dimensions, position', tier: 'free' },
  { id: 'meta-tags', name: 'Page Meta', icon: 'ℹ', description: 'View meta tags, Open Graph, viewport', tier: 'free' },

  // Pro tier
  { id: 'screenshot', name: 'Screenshot', icon: '📸', description: 'Capture element, viewport, or full page', tier: 'pro' },
  { id: 'accessibility', name: 'Accessibility', icon: 'A11y', description: 'Contrast ratios, ARIA roles, alt text', tier: 'pro' },
  { id: 'css-vars', name: 'CSS Variables', icon: '--', description: 'List all CSS custom properties', tier: 'pro' },
  { id: 'rulers', name: 'Rulers', icon: '📏', description: 'Measure distances between elements', tier: 'pro' },
  { id: 'grid-overlay', name: 'Grid Overlay', icon: '▦', description: 'Visualize grid and flexbox layouts', tier: 'pro' },
  { id: 'assets', name: 'Page Assets', icon: '📦', description: 'List images, fonts, scripts, stylesheets', tier: 'pro' },
];

export function getFreeTool(id: string): Tool | undefined {
  return TOOLS.find(t => t.id === id && t.tier === 'free');
}

export function getProTool(id: string): Tool | undefined {
  return TOOLS.find(t => t.id === id && t.tier === 'pro');
}

export function freeTools(): Tool[] {
  return TOOLS.filter(t => t.tier === 'free');
}

export function proTools(): Tool[] {
  return TOOLS.filter(t => t.tier === 'pro');
}

export function isProTool(id: string): boolean {
  return TOOLS.some(t => t.id === id && t.tier === 'pro');
}
