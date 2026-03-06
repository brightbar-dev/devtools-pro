import '@/assets/inspector.css';
import { parseColor, toHex, toRgb, toHsl, contrastRatio, wcagRating } from '@/utils/colors';
import { PROPERTY_CATEGORIES, isDefaultValue, isCategoryRelevant, formatCssRule } from '@/utils/css';
import { parseFontStack, weightName, formatSizeLineHeight, isGenericFont } from '@/utils/fonts';
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

    function buildPanelContent(el: Element): string {
      switch (activeTool) {
        case 'css-inspect': return buildCssPanel(el);
        case 'color-picker': return buildColorPanel(el);
        case 'font-detect': return buildFontPanel(el);
        case 'spacing': return buildSpacingPanel(el);
        case 'element-info': return buildElementPanel(el);
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
