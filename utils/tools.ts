/** Tool definitions for DevTools Pro. All 12 tools are available to everyone. */

export interface Tool {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const TOOLS: Tool[] = [
  { id: 'css-inspect', name: 'CSS Inspector', icon: '{}', description: 'Inspect computed CSS on any element' },
  { id: 'color-picker', name: 'Color Picker', icon: '🎨', description: 'Pick colors and copy as hex/rgb/hsl' },
  { id: 'font-detect', name: 'Font Detector', icon: 'Aa', description: 'Detect fonts, sizes, weights on any element' },
  { id: 'spacing', name: 'Spacing', icon: '⬜', description: 'Visualize margins, padding, and borders' },
  { id: 'element-info', name: 'Element Info', icon: '<>', description: 'Tag, classes, dimensions, position' },
  { id: 'meta-tags', name: 'Page Meta', icon: 'ℹ', description: 'View meta tags, Open Graph, viewport' },
  { id: 'screenshot', name: 'Screenshot', icon: '📸', description: 'Capture element, viewport, or full page' },
  { id: 'accessibility', name: 'Accessibility', icon: 'A11y', description: 'Contrast ratios, ARIA roles, alt text' },
  { id: 'css-vars', name: 'CSS Variables', icon: '--', description: 'List all CSS custom properties' },
  { id: 'rulers', name: 'Rulers', icon: '📏', description: 'Measure distances between elements' },
  { id: 'grid-overlay', name: 'Grid Overlay', icon: '▦', description: 'Visualize grid and flexbox layouts' },
  { id: 'assets', name: 'Page Assets', icon: '📦', description: 'List images, fonts, scripts, stylesheets' },
];
