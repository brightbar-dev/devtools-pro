import '@/assets/inspector.css';
import { parseColor, toHex, toRgb, toHsl, contrastRatio, wcagRating } from '@/utils/colors';
import { PROPERTY_CATEGORIES, isDefaultValue, isCategoryRelevant, formatCssRule } from '@/utils/css';
import { parseFontStack, weightName, formatSizeLineHeight, isGenericFont } from '@/utils/fonts';
import type { CssVariable } from '@/utils/css-vars';
import { parsePx, formatPx, formatSides } from '@/utils/spacing';
import { elementSelector, formatDimensions, textPreview, escapeHtml } from '@/utils/dom';
import type { BoxModel, BoxSides } from '@/utils/spacing';
import type { FontInfo } from '@/utils/fonts';
import type { RGBA } from '@/utils/colors';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let activeTool: string | null = null;
    let hoveredEl: Element | null = null;
    let overlay: HTMLDivElement | null = null;
    let panel: HTMLDivElement | null = null;
    let isActive = false;

    function createOverlay(): HTMLDivElement {
      const el = document.createElement('div');
      el.id = 'dtp-overlay';
      el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #4f46e5;background:rgba(79,70,229,0.1);transition:all 0.05s ease;display:none;';
      document.documentElement.appendChild(el);
      return el;
    }

    function createPanel(): HTMLDivElement {
      const el = document.createElement('div');
      el.id = 'dtp-panel';
      document.documentElement.appendChild(el);
      return el;
    }

    function positionPanel(target: Element) {
      if (!panel) return;
      const rect = target.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      let top = rect.bottom + 8;
      let left = rect.left;

      // If panel would go off bottom, place above
      if (top + panelRect.height > window.innerHeight) {
        top = rect.top - panelRect.height - 8;
      }
      // If panel would go off right, shift left
      if (left + panelRect.width > window.innerWidth) {
        left = window.innerWidth - panelRect.width - 8;
      }
      // Clamp
      if (left < 8) left = 8;
      if (top < 8) top = 8;

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    function updateOverlay(el: Element) {
      if (!overlay) return;
      const rect = el.getBoundingClientRect();
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = 'block';
    }

    function getBoxModel(el: Element): BoxModel {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const padding: BoxSides = {
        top: parsePx(cs.paddingTop), right: parsePx(cs.paddingRight),
        bottom: parsePx(cs.paddingBottom), left: parsePx(cs.paddingLeft),
      };
      const border: BoxSides = {
        top: parsePx(cs.borderTopWidth), right: parsePx(cs.borderRightWidth),
        bottom: parsePx(cs.borderBottomWidth), left: parsePx(cs.borderLeftWidth),
      };
      const margin: BoxSides = {
        top: parsePx(cs.marginTop), right: parsePx(cs.marginRight),
        bottom: parsePx(cs.marginBottom), left: parsePx(cs.marginLeft),
      };
      return {
        content: { width: rect.width - padding.left - padding.right - border.left - border.right,
                    height: rect.height - padding.top - padding.bottom - border.top - border.bottom },
        padding, border, margin,
      };
    }

    function getFontInfo(el: Element): FontInfo {
      const cs = window.getComputedStyle(el);
      const stack = parseFontStack(cs.fontFamily);
      return {
        family: stack[0] || cs.fontFamily,
        stack,
        size: cs.fontSize,
        weight: cs.fontWeight,
        weightName: weightName(cs.fontWeight),
        style: cs.fontStyle,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        color: cs.color,
      };
    }

    function getElementColors(el: Element): { color: RGBA | null; bg: RGBA | null; borderColor: RGBA | null } {
      const cs = window.getComputedStyle(el);
      return {
        color: parseColor(cs.color),
        bg: parseColor(cs.backgroundColor),
        borderColor: parseColor(cs.borderTopColor),
      };
    }

    function buildCssPanel(el: Element): string {
      const cs = window.getComputedStyle(el);
      const selector = elementSelector(el as HTMLElement);
      const display = cs.display;
      let html = `<div class="dtp-section-header">${escapeHtml(selector)}</div>`;

      for (const [catName, props] of Object.entries(PROPERTY_CATEGORIES)) {
        if (!isCategoryRelevant(catName, display)) continue;
        const rows: string[] = [];
        for (const prop of props) {
          const val = cs.getPropertyValue(prop);
          if (!val) continue;
          if (isDefaultValue(prop, val)) continue;
          const colorParsed = parseColor(val);
          const swatch = colorParsed ? `<span class="dtp-swatch" style="background:${val}"></span>` : '';
          rows.push(`<div class="dtp-prop"><span class="dtp-prop-name">${prop}</span><span class="dtp-prop-val">${swatch}${escapeHtml(val)}</span></div>`);
        }
        if (rows.length > 0) {
          html += `<div class="dtp-category"><div class="dtp-cat-name">${catName}</div>${rows.join('')}</div>`;
        }
      }
      return html;
    }

    function buildColorPanel(el: Element): string {
      const { color, bg, borderColor } = getElementColors(el);
      let html = '<div class="dtp-section-header">Colors</div>';

      const renderColor = (label: string, c: RGBA | null) => {
        if (!c) return '';
        const hex = toHex(c);
        const rgb = toRgb(c);
        const hsl = toHsl(c);
        return `<div class="dtp-color-row">
          <span class="dtp-swatch-lg" style="background:${hex}"></span>
          <div class="dtp-color-info">
            <div class="dtp-color-label">${label}</div>
            <div class="dtp-color-value" data-copy="${hex}">${hex}</div>
            <div class="dtp-color-value" data-copy="${rgb}">${rgb}</div>
            <div class="dtp-color-value" data-copy="${hsl}">${hsl}</div>
          </div>
        </div>`;
      };

      html += renderColor('Text', color);
      html += renderColor('Background', bg);
      if (borderColor && !isTransparentRgba(borderColor)) {
        html += renderColor('Border', borderColor);
      }

      // Contrast ratio if we have both fg and bg
      if (color && bg && !isTransparentRgba(bg)) {
        const ratio = contrastRatio(color, bg);
        const rating = wcagRating(ratio);
        const ratingClass = rating === 'Fail' ? 'dtp-fail' : rating === 'AAA' ? 'dtp-aaa' : 'dtp-aa';
        html += `<div class="dtp-contrast">
          <span>Contrast: ${ratio.toFixed(2)}:1</span>
          <span class="dtp-badge ${ratingClass}">${rating}</span>
        </div>`;
      }

      return html;
    }

    function isTransparentRgba(c: RGBA): boolean {
      return c.a === 0;
    }

    function buildFontPanel(el: Element): string {
      const info = getFontInfo(el);
      let html = '<div class="dtp-section-header">Typography</div>';
      html += `<div class="dtp-font-preview" style="font-family:${info.stack.join(',')};font-size:${info.size};font-weight:${info.weight};font-style:${info.style};color:${info.color}">The quick brown fox</div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Font</span><span class="dtp-prop-val">${escapeHtml(info.family)}</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Stack</span><span class="dtp-prop-val">${info.stack.map(f => escapeHtml(f) + (isGenericFont(f) ? ' <em>(generic)</em>' : '')).join(', ')}</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Size</span><span class="dtp-prop-val">${formatSizeLineHeight(info.size, info.lineHeight)}</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Weight</span><span class="dtp-prop-val">${info.weight} (${info.weightName})</span></div>`;
      if (info.style !== 'normal') {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Style</span><span class="dtp-prop-val">${info.style}</span></div>`;
      }
      if (info.letterSpacing !== 'normal') {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Letter Spacing</span><span class="dtp-prop-val">${info.letterSpacing}</span></div>`;
      }
      return html;
    }

    function buildSpacingPanel(el: Element): string {
      const box = getBoxModel(el);
      let html = '<div class="dtp-section-header">Box Model</div>';
      html += '<div class="dtp-box-model">';
      html += `<div class="dtp-box-layer dtp-margin-box"><span class="dtp-box-label">margin</span>`;
      html += `<div class="dtp-box-values"><span>${formatPx(box.margin.top)}</span><span>${formatPx(box.margin.right)}</span><span>${formatPx(box.margin.bottom)}</span><span>${formatPx(box.margin.left)}</span></div>`;
      html += `<div class="dtp-box-layer dtp-border-box"><span class="dtp-box-label">border</span>`;
      html += `<div class="dtp-box-values"><span>${formatPx(box.border.top)}</span><span>${formatPx(box.border.right)}</span><span>${formatPx(box.border.bottom)}</span><span>${formatPx(box.border.left)}</span></div>`;
      html += `<div class="dtp-box-layer dtp-padding-box"><span class="dtp-box-label">padding</span>`;
      html += `<div class="dtp-box-values"><span>${formatPx(box.padding.top)}</span><span>${formatPx(box.padding.right)}</span><span>${formatPx(box.padding.bottom)}</span><span>${formatPx(box.padding.left)}</span></div>`;
      html += `<div class="dtp-box-layer dtp-content-box">${Math.round(box.content.width)} x ${Math.round(box.content.height)}</div>`;
      html += '</div></div></div></div>';
      return html;
    }

    function buildElementPanel(el: Element): string {
      const htmlEl = el as HTMLElement;
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const selector = elementSelector(htmlEl);

      let html = '<div class="dtp-section-header">Element</div>';
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Tag</span><span class="dtp-prop-val">&lt;${el.tagName.toLowerCase()}&gt;</span></div>`;
      if (htmlEl.id) {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">ID</span><span class="dtp-prop-val">#${escapeHtml(htmlEl.id)}</span></div>`;
      }
      if (htmlEl.className && typeof htmlEl.className === 'string') {
        const classes = htmlEl.className.trim().split(/\s+/).filter(Boolean);
        if (classes.length > 0) {
          html += `<div class="dtp-prop"><span class="dtp-prop-name">Classes</span><span class="dtp-prop-val">${classes.map(c => '.' + escapeHtml(c)).join(' ')}</span></div>`;
        }
      }
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Size</span><span class="dtp-prop-val">${formatDimensions(rect.width, rect.height)}</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Position</span><span class="dtp-prop-val">${cs.position} (${Math.round(rect.left)}, ${Math.round(rect.top)})</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Display</span><span class="dtp-prop-val">${cs.display}</span></div>`;

      // Text preview
      const text = htmlEl.textContent || '';
      if (text.trim()) {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Text</span><span class="dtp-prop-val">${escapeHtml(textPreview(text))}</span></div>`;
      }

      // Selector for copy
      html += `<div class="dtp-prop dtp-copyable" data-copy="${escapeHtml(selector)}"><span class="dtp-prop-name">Selector</span><span class="dtp-prop-val">${escapeHtml(selector)}</span></div>`;
      return html;
    }

    function buildRulersPanel(el: Element): string {
      const rect = el.getBoundingClientRect();
      let html = '<div class="dtp-section-header">Measurements</div>';
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Width</span><span class="dtp-prop-val">${Math.round(rect.width)}px</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Height</span><span class="dtp-prop-val">${Math.round(rect.height)}px</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Top</span><span class="dtp-prop-val">${Math.round(rect.top)}px from viewport</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Left</span><span class="dtp-prop-val">${Math.round(rect.left)}px from viewport</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Bottom</span><span class="dtp-prop-val">${Math.round(window.innerHeight - rect.bottom)}px to bottom</span></div>`;
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Right</span><span class="dtp-prop-val">${Math.round(window.innerWidth - rect.right)}px to right</span></div>`;

      // Distance to parent
      const parent = el.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        html += '<div class="dtp-section-header" style="margin-top:8px">Distance to Parent</div>';
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Top</span><span class="dtp-prop-val">${Math.round(rect.top - parentRect.top)}px</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Left</span><span class="dtp-prop-val">${Math.round(rect.left - parentRect.left)}px</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Bottom</span><span class="dtp-prop-val">${Math.round(parentRect.bottom - rect.bottom)}px</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Right</span><span class="dtp-prop-val">${Math.round(parentRect.right - rect.right)}px</span></div>`;
      }

      // Adjacent siblings
      const prev = el.previousElementSibling;
      const next = el.nextElementSibling;
      if (prev || next) {
        html += '<div class="dtp-section-header" style="margin-top:8px">Sibling Gaps</div>';
        if (prev) {
          const prevRect = prev.getBoundingClientRect();
          const gap = Math.round(rect.top - prevRect.bottom);
          html += `<div class="dtp-prop"><span class="dtp-prop-name">Above</span><span class="dtp-prop-val">${gap}px gap</span></div>`;
        }
        if (next) {
          const nextRect = next.getBoundingClientRect();
          const gap = Math.round(nextRect.top - rect.bottom);
          html += `<div class="dtp-prop"><span class="dtp-prop-name">Below</span><span class="dtp-prop-val">${gap}px gap</span></div>`;
        }
      }

      return html;
    }

    function buildGridPanel(el: Element): string {
      const cs = window.getComputedStyle(el);
      const display = cs.display;
      let html = '<div class="dtp-section-header">Layout</div>';
      html += `<div class="dtp-prop"><span class="dtp-prop-name">Display</span><span class="dtp-prop-val">${display}</span></div>`;

      if (display.includes('grid')) {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Columns</span><span class="dtp-prop-val">${cs.gridTemplateColumns}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Rows</span><span class="dtp-prop-val">${cs.gridTemplateRows}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Gap</span><span class="dtp-prop-val">${cs.gap || cs.gridGap || 'none'}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Areas</span><span class="dtp-prop-val">${cs.gridTemplateAreas || 'none'}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Auto Flow</span><span class="dtp-prop-val">${cs.gridAutoFlow}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Align Items</span><span class="dtp-prop-val">${cs.alignItems}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Justify Items</span><span class="dtp-prop-val">${cs.justifyItems}</span></div>`;

        // Count children
        const children = el.children.length;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Children</span><span class="dtp-prop-val">${children}</span></div>`;
      } else if (display.includes('flex')) {
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Direction</span><span class="dtp-prop-val">${cs.flexDirection}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Wrap</span><span class="dtp-prop-val">${cs.flexWrap}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Gap</span><span class="dtp-prop-val">${cs.gap || 'none'}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Justify Content</span><span class="dtp-prop-val">${cs.justifyContent}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Align Items</span><span class="dtp-prop-val">${cs.alignItems}</span></div>`;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Align Content</span><span class="dtp-prop-val">${cs.alignContent}</span></div>`;

        const children = el.children.length;
        html += `<div class="dtp-prop"><span class="dtp-prop-name">Children</span><span class="dtp-prop-val">${children}</span></div>`;

        // Show child flex properties
        if (children > 0 && children <= 12) {
          html += '<div class="dtp-section-header" style="margin-top:8px">Child Items</div>';
          for (let i = 0; i < children; i++) {
            const child = el.children[i] as HTMLElement;
            const childCs = window.getComputedStyle(child);
            const grow = childCs.flexGrow;
            const shrink = childCs.flexShrink;
            const basis = childCs.flexBasis;
            const tag = child.tagName.toLowerCase();
            html += `<div class="dtp-prop"><span class="dtp-prop-name">${tag}[${i}]</span><span class="dtp-prop-val">${grow} ${shrink} ${basis}</span></div>`;
          }
        }
      } else {
        html += '<div class="dtp-prop"><span class="dtp-prop-name">Note</span><span class="dtp-prop-val">Not a grid or flex container</span></div>';

        // Check if element is a flex/grid child
        const parentCs = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
        if (parentCs) {
          const parentDisplay = parentCs.display;
          if (parentDisplay.includes('flex')) {
            html += '<div class="dtp-section-header" style="margin-top:8px">Flex Item Properties</div>';
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Flex</span><span class="dtp-prop-val">${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}</span></div>`;
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Align Self</span><span class="dtp-prop-val">${cs.alignSelf}</span></div>`;
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Order</span><span class="dtp-prop-val">${cs.order}</span></div>`;
          } else if (parentDisplay.includes('grid')) {
            html += '<div class="dtp-section-header" style="margin-top:8px">Grid Item Properties</div>';
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Column</span><span class="dtp-prop-val">${cs.gridColumn}</span></div>`;
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Row</span><span class="dtp-prop-val">${cs.gridRow}</span></div>`;
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Align Self</span><span class="dtp-prop-val">${cs.alignSelf}</span></div>`;
            html += `<div class="dtp-prop"><span class="dtp-prop-name">Justify Self</span><span class="dtp-prop-val">${cs.justifySelf}</span></div>`;
          }
        }
      }

      return html;
    }

    function buildPanelContent(el: Element): string {
      switch (activeTool) {
        case 'css-inspect': return buildCssPanel(el);
        case 'color-picker': return buildColorPanel(el);
        case 'font-detect': return buildFontPanel(el);
        case 'spacing': return buildSpacingPanel(el);
        case 'element-info': return buildElementPanel(el);
        case 'rulers': return buildRulersPanel(el);
        case 'grid-overlay': return buildGridPanel(el);
        default: return buildCssPanel(el);
      }
    }

    function onMouseMove(e: MouseEvent) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || target === overlay || target === panel || panel?.contains(target)) return;
      if (target.id?.startsWith('dtp-')) return;

      hoveredEl = target;
      updateOverlay(target);

      if (panel) {
        panel.innerHTML = buildPanelContent(target);
        panel.style.display = 'block';
        positionPanel(target);
      }
    }

    function onClick(e: MouseEvent) {
      if (!isActive) return;
      e.preventDefault();
      e.stopPropagation();

      // Copy on click for color values
      const target = e.target as HTMLElement;
      const copyVal = target.closest('[data-copy]')?.getAttribute('data-copy');
      if (copyVal) {
        navigator.clipboard.writeText(copyVal).catch(() => {});
        // Flash feedback
        const el = target.closest('[data-copy]') as HTMLElement;
        el.classList.add('dtp-copied');
        setTimeout(() => el.classList.remove('dtp-copied'), 800);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        deactivate();
      }
    }

    function activate(toolId: string) {
      if (isActive && activeTool === toolId) {
        deactivate();
        return;
      }

      activeTool = toolId;
      isActive = true;

      if (!overlay) overlay = createOverlay();
      if (!panel) panel = createPanel();

      overlay.style.display = 'none';
      panel.style.display = 'none';

      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.body.style.cursor = 'crosshair';
    }

    function deactivate() {
      isActive = false;
      activeTool = null;
      hoveredEl = null;

      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.cursor = '';

      if (overlay) overlay.style.display = 'none';
      if (panel) panel.style.display = 'none';

      browser.runtime.sendMessage({ action: 'setActiveTool', toolId: null }).catch(() => {});
    }

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'activateTool') {
        activate(msg.toolId);
        return;
      }
      if (msg.action === 'deactivate') {
        deactivate();
        return;
      }
      if (msg.action === 'getMetaTags') {
        return Promise.resolve(collectMetaTags());
      }
      if (msg.action === 'getPageAssets') {
        return Promise.resolve(collectPageAssets());
      }
      if (msg.action === 'getCssVariables') {
        return Promise.resolve(collectCssVariables());
      }
      if (msg.action === 'getAccessibilityData') {
        return Promise.resolve(collectAccessibilityData());
      }
    });

    function collectMetaTags(): Array<{ name: string; content: string; type: string }> {
      const tags: Array<{ name: string; content: string; type: string }> = [];

      // Title
      tags.push({ name: 'title', content: document.title, type: 'meta' });

      // Meta tags
      document.querySelectorAll('meta[name], meta[property]').forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
        const content = meta.getAttribute('content') || '';
        if (name && content) {
          let type = 'other';
          if (name.startsWith('og:') || name.startsWith('article:')) type = 'og';
          else if (name.startsWith('twitter:')) type = 'twitter';
          else type = 'meta';
          tags.push({ name, content, type });
        }
      });

      // Charset
      const charset = document.querySelector('meta[charset]');
      if (charset) {
        tags.push({ name: 'charset', content: charset.getAttribute('charset') || '', type: 'meta' });
      }

      // Viewport
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        tags.push({ name: 'viewport', content: viewport.getAttribute('content') || '', type: 'meta' });
      }

      return tags;
    }

    function collectCssVariables(): CssVariable[] {
      const vars: CssVariable[] = [];
      const seen = new Set<string>();

      // Collect from stylesheets
      try {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSStyleRule) {
                const style = rule.style;
                for (let i = 0; i < style.length; i++) {
                  const prop = style[i];
                  if (prop.startsWith('--')) {
                    const key = `${rule.selectorText}::${prop}`;
                    if (!seen.has(key)) {
                      seen.add(key);
                      vars.push({
                        name: prop,
                        value: style.getPropertyValue(prop).trim(),
                        scope: rule.selectorText,
                      });
                    }
                  }
                }
              }
            }
          } catch {
            // CORS — can't read cross-origin stylesheets
          }
        }
      } catch {
        // No stylesheets accessible
      }

      // Collect from inline styles on root/body
      const rootStyle = document.documentElement.style;
      for (let i = 0; i < rootStyle.length; i++) {
        const prop = rootStyle[i];
        if (prop.startsWith('--')) {
          const key = `:root::${prop}`;
          if (!seen.has(key)) {
            seen.add(key);
            vars.push({
              name: prop,
              value: rootStyle.getPropertyValue(prop).trim(),
              scope: ':root (inline)',
            });
          }
        }
      }

      return vars;
    }

    function collectAccessibilityData() {
      // Images
      const images = document.querySelectorAll('img');
      const imagesTotal = images.length;
      let imagesWithoutAlt = 0;
      images.forEach(img => {
        if (!img.hasAttribute('alt')) imagesWithoutAlt++;
      });

      // Headings
      const headingEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headings: Array<{ level: number; text: string }> = [];
      headingEls.forEach(h => {
        const level = parseInt(h.tagName[1], 10);
        headings.push({ level, text: (h.textContent || '').trim().slice(0, 80) });
      });

      // Landmarks
      const hasMainLandmark = document.querySelector('main, [role="main"]') !== null;
      const hasNavLandmark = document.querySelector('nav, [role="navigation"]') !== null;
      const hasSkipLink = (() => {
        const firstLink = document.querySelector('a');
        if (!firstLink) return false;
        const href = firstLink.getAttribute('href') || '';
        return href.startsWith('#') && (firstLink.textContent || '').toLowerCase().includes('skip');
      })();

      // Links without text
      let linksWithoutText = 0;
      document.querySelectorAll('a').forEach(a => {
        const text = (a.textContent || '').trim();
        const ariaLabel = a.getAttribute('aria-label') || '';
        const title = a.getAttribute('title') || '';
        const img = a.querySelector('img[alt]');
        if (!text && !ariaLabel && !title && !img) linksWithoutText++;
      });

      // Buttons without text
      let buttonsWithoutText = 0;
      document.querySelectorAll('button, [role="button"]').forEach(btn => {
        const text = (btn.textContent || '').trim();
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const title = btn.getAttribute('title') || '';
        if (!text && !ariaLabel && !title) buttonsWithoutText++;
      });

      // Form inputs without labels
      let formInputsWithoutLabel = 0;
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach(input => {
        const id = input.getAttribute('id');
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;
        const hasAriaLabel = !!input.getAttribute('aria-label');
        const hasAriaLabelledby = !!input.getAttribute('aria-labelledby');
        const parentLabel = input.closest('label') !== null;
        if (!hasLabel && !hasAriaLabel && !hasAriaLabelledby && !parentLabel) formInputsWithoutLabel++;
      });

      // Positive tabindex
      let tabindexPositive = 0;
      document.querySelectorAll('[tabindex]').forEach(el => {
        const val = parseInt(el.getAttribute('tabindex') || '0', 10);
        if (val > 0) tabindexPositive++;
      });

      // ARIA roles used
      const ariaRoles = new Set<string>();
      document.querySelectorAll('[role]').forEach(el => {
        const role = el.getAttribute('role');
        if (role) ariaRoles.add(role);
      });

      // Document
      const htmlLang = document.documentElement.getAttribute('lang') || '';
      const titleText = document.title || '';

      // Landmark count
      const landmarkCount = document.querySelectorAll('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]').length;

      return {
        imagesTotal,
        imagesWithoutAlt,
        headings,
        hasMainLandmark,
        hasNavLandmark,
        hasSkipLink,
        linksWithoutText,
        buttonsWithoutText,
        formInputsWithoutLabel,
        tabindexPositive,
        ariaRolesUsed: [...ariaRoles].sort(),
        htmlLang,
        titleText,
        landmarkCount,
      };
    }

    function collectPageAssets(): { images: number; scripts: number; stylesheets: number; fonts: string[] } {
      const fonts = new Set<string>();
      document.querySelectorAll('*').forEach(el => {
        const cs = window.getComputedStyle(el);
        const stack = cs.fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
        stack.forEach(f => { if (f && !isGenericFont(f)) fonts.add(f); });
      });

      return {
        images: document.querySelectorAll('img, picture, svg').length,
        scripts: document.querySelectorAll('script[src]').length,
        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
        fonts: [...fonts].sort(),
      };
    }
  },
});
