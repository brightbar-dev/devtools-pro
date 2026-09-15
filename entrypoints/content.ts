import inspectorCss from '@/assets/inspector.css?inline';
import { buildPanelModel, type InspectTarget, type PanelModel } from '@/utils/inspect';
import { renderPanelHtml } from '@/utils/panel-render';
import { HOVER_TOOLS, getHoverTool } from '@/utils/tools';
import { coalesceToFrames } from '@/utils/schedule';
import { frameContentOffset, placePanel, sameRect, toRect, translateRect, type Rect } from '@/utils/geometry';
import { elementSelector, escapeHtml, type PathSegment } from '@/utils/dom';
import { parsePx } from '@/utils/spacing';
import { isGenericFont } from '@/utils/fonts';
import type { CssVariable } from '@/utils/css-vars';
import {
  FRAME_PROTOCOL, parseFrameMessage,
  type BroadcastRequest, type CollectKind, type FrameMessage, type InspectorMessage, type InspectorReply,
} from '@/utils/messages';

type FrameElement = HTMLIFrameElement | HTMLFrameElement;

interface Ui {
  host: HTMLElement;
  root: ShadowRoot;
  overlay: HTMLDivElement;
  panel: HTMLDivElement;
  bar: HTMLDivElement;
}

type Shown =
  | { source: 'self'; el: Element; model: PanelModel }
  | { source: 'frame'; frame: FrameElement; rect: Rect; model: PanelModel };

type InspectorGlobal = typeof globalThis & {
  __dtpInspector?: { alive(): boolean; destroy(): void };
};

/** Inline host styles: `!important` inline declarations beat any page stylesheet. */
const HOST_STYLE = [
  'all: initial !important', 'position: fixed !important', 'top: 0 !important', 'left: 0 !important',
  'width: 0 !important', 'height: 0 !important', 'margin: 0 !important', 'padding: 0 !important',
  'border: 0 !important', 'overflow: visible !important', 'display: block !important',
  'z-index: 2147483647 !important', 'pointer-events: none !important', 'background: transparent !important',
].join(';');

export default defineContentScript({
  // Never listed in the manifest: the popup injects this with scripting.executeScript into the
  // tab the user opened it on (activeTab), so there is no host permission and nothing runs on
  // pages where no tool was picked. No `matches`, or WXT would add them as host permissions.
  registration: 'runtime',
  main() {
    const g = globalThis as InspectorGlobal;
    // executeScript runs this file again on every tool pick; keep the first live instance.
    if (g.__dtpInspector?.alive()) return;
    g.__dtpInspector?.destroy();

    const isTop = window === window.top;
    // A frame whose parent is same-origin reports to the parent's inspector, which draws in the
    // top document. A frame we cannot report from (cross-origin parent) draws for itself.
    const renderHere = isTop || !parentOrigin();

    let activeTool: string | null = null;
    let hovered: Element | null = null;
    let pointer: { x: number; y: number } | null = null;
    let pinned = false;
    let lastPostedRect: Rect | null = null;
    let savedCursor: { value: string; priority: string } | null = null;
    let shown: Shown | null = null;
    let renderedModel: PanelModel | null = null;
    let ui: Ui | null = null;
    let hint = '';
    let hintTimer: number | undefined;
    const frameCache = new WeakMap<object, FrameElement>();

    const raf = (cb: () => void) => window.requestAnimationFrame(cb);
    const caf = (handle: number) => window.cancelAnimationFrame(handle);
    const hoverFrame = coalesceToFrames(processHover, raf, caf);
    const scrollFrame = coalesceToFrames(refreshGeometry, raf, caf);

    // ── Frames ──────────────────────────────────────────────────────────────

    /** The parent's origin when it is reachable (same-origin), else null. */
    function parentOrigin(): string | null {
      if (window === window.parent) return null;
      try {
        const origin = window.parent.location.origin;
        return origin === 'null' ? '*' : origin;
      } catch {
        return null;
      }
    }

    function postToParent(message: FrameMessage) {
      const origin = parentOrigin();
      if (origin) window.parent.postMessage(message, origin);
    }

    function frameOffset(frame: Element): { dx: number; dy: number } {
      const cs = window.getComputedStyle(frame);
      return frameContentOffset(
        frame.getBoundingClientRect(),
        { left: parsePx(cs.borderLeftWidth), top: parsePx(cs.borderTopWidth) },
        { left: parsePx(cs.paddingLeft), top: parsePx(cs.paddingTop) },
      );
    }

    function findFrameIn(root: Document | ShadowRoot, source: object): FrameElement | null {
      for (const frame of root.querySelectorAll<FrameElement>('iframe, frame')) {
        if (frame.contentWindow === source) return frame;
      }
      for (const el of root.querySelectorAll('*')) {
        const shadow = shadowRootOf(el);
        const found = shadow ? findFrameIn(shadow, source) : null;
        if (found) return found;
      }
      return null;
    }

    function frameElementFor(source: MessageEventSource | null): FrameElement | null {
      if (!source) return null;
      const cached = frameCache.get(source);
      if (cached?.isConnected && cached.contentWindow === source) return cached;
      const frame = findFrameIn(document, source);
      if (frame) frameCache.set(source, frame);
      return frame;
    }

    function onWindowMessage(event: MessageEvent) {
      if (!activeTool) return;
      const message = parseFrameMessage(event.data);
      if (!message) return;
      const frame = frameElementFor(event.source);
      if (!frame) return; // only a real child frame of this document may report

      if (message.type === 'hover') {
        hovered = null; // the pointer left this document's elements
        const childPath = message.model.path.map((s, i) => (i === 0 ? { ...s, boundary: 'frame' as const } : s));
        const model: PanelModel = { ...message.model, path: [...pathOf(frame), ...childPath] };
        if (renderHere) {
          shown = { source: 'frame', frame, rect: message.rect, model };
          draw();
        } else {
          const { dx, dy } = frameOffset(frame);
          postToParent({ ...message, rect: translateRect(message.rect, dx, dy), model });
        }
      } else if (renderHere) {
        if (shown?.source === 'frame' && shown.frame === frame) {
          shown.rect = message.rect;
          draw();
        }
      } else {
        const { dx, dy } = frameOffset(frame);
        postToParent({ ...message, rect: translateRect(message.rect, dx, dy) });
      }
    }

    // ── Hit-testing and the element view ───────────────────────────────────

    /** Open or closed shadow root of an element. Content scripts may see closed roots. */
    function shadowRootOf(el: Element): ShadowRoot | null {
      if (el === ui?.host) return null;
      try {
        const chromeDom = (globalThis as { chrome?: { dom?: { openOrClosedShadowRoot?: (e: Element) => ShadowRoot | null } } }).chrome?.dom;
        if (chromeDom?.openOrClosedShadowRoot) return chromeDom.openOrClosedShadowRoot(el) ?? null;
        const firefox = (el as Element & { openOrClosedShadowRoot?: () => ShadowRoot | null }).openOrClosedShadowRoot;
        if (typeof firefox === 'function') return firefox.call(el) ?? null;
      } catch {
        // fall through to the open root
      }
      return el.shadowRoot;
    }

    /** elementFromPoint stops at a shadow host; keep descending into shadow roots. */
    function deepElementFromPoint(x: number, y: number): Element | null {
      let el = document.elementFromPoint(x, y);
      for (let depth = 0; el && depth < 32; depth++) {
        if (el === ui?.host) return null;
        const shadow = shadowRootOf(el);
        if (!shadow) break;
        const inner = shadow.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el === ui?.host ? null : el;
    }

    function classNameOf(el: Element): string {
      const cls = (el as HTMLElement).className;
      return typeof cls === 'string' ? cls : el.getAttribute('class') ?? '';
    }

    function composedParent(el: Element): Element | null {
      if (el.parentElement) return el.parentElement;
      const node = el.parentNode;
      return node && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node ? (node as ShadowRoot).host : null;
    }

    /** The element's composed path below <body>, crossing shadow roots. */
    function pathOf(el: Element): PathSegment[] {
      const out: PathSegment[] = [];
      let node: Element | null = el;
      while (node) {
        if ((node === document.body || node === document.documentElement) && out.length > 0) break;
        const segment: PathSegment = { label: elementSelector({ tagName: node.tagName, id: node.id, className: classNameOf(node) }) };
        const parentNode: ParentNode | null = node.parentNode;
        if (parentNode && parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in parentNode) {
          segment.boundary = 'shadow';
        }
        out.unshift(segment);
        node = composedParent(node);
      }
      return out;
    }

    function targetOf(el: Element): InspectTarget {
      let computed: CSSStyleDeclaration | null = null;
      let rect: Rect | null = null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: classNameOf(el),
        get rect() {
          return (rect ??= toRect(el.getBoundingClientRect()));
        },
        style: prop => (computed ??= window.getComputedStyle(el)).getPropertyValue(prop),
        text: () => el.textContent ?? '',
        parent: () => {
          const p = composedParent(el);
          return p ? targetOf(p) : null;
        },
        previous: () => (el.previousElementSibling ? targetOf(el.previousElementSibling) : null),
        next: () => (el.nextElementSibling ? targetOf(el.nextElementSibling) : null),
        children: () => Array.from(el.children, targetOf),
      };
    }

    function modelFor(el: Element, toolId: string): PanelModel {
      try {
        return buildPanelModel(toolId, targetOf(el), {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          path: pathOf(el),
        });
      } catch (err) {
        return { toolId, title: 'DevTools Pro', path: pathOf(el), blocks: [{ kind: 'note', text: `Could not inspect this element: ${(err as Error).message}` }] };
      }
    }

    // ── Hover pipeline: at most one update per animation frame ──────────────

    function onPointerMove(e: MouseEvent) {
      pointer = { x: e.clientX, y: e.clientY };
      if (!pinned) hoverFrame.schedule();
    }

    function processHover() {
      if (!activeTool || !pointer || pinned) return;
      const el = deepElementFromPoint(pointer.x, pointer.y);
      if (!el) return;
      if (el === hovered) {
        refreshGeometry(); // same element: no rebuild, just follow it if it moved
        return;
      }
      hovered = el;
      const model = modelFor(el, activeTool);
      if (renderHere) {
        shown = { source: 'self', el, model };
        draw();
      } else {
        lastPostedRect = toRect(el.getBoundingClientRect());
        postToParent({ protocol: FRAME_PROTOCOL, type: 'hover', rect: lastPostedRect, model });
      }
    }

    function refreshGeometry() {
      if (renderHere) {
        draw();
        return;
      }
      if (!hovered) return;
      const rect = toRect(hovered.getBoundingClientRect());
      if (sameRect(rect, lastPostedRect)) return;
      lastPostedRect = rect;
      postToParent({ protocol: FRAME_PROTOCOL, type: 'rect', rect });
    }

    function onPointerOut(e: MouseEvent) {
      // Leaving this document (into a frame or out of the window): re-report on return.
      if (!e.relatedTarget) hovered = null;
    }

    // ── Drawing (render root only) ──────────────────────────────────────────

    function mountUi(): Ui {
      const host = document.createElement('dtp-inspector');
      host.setAttribute('style', HOST_STYLE);
      const root = host.attachShadow({ mode: 'closed' });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(inspectorCss);
        root.adoptedStyleSheets = [sheet]; // constructed sheets are not subject to page CSP
      } catch {
        const style = document.createElement('style');
        style.textContent = inspectorCss;
        root.append(style);
      }
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'DevTools Pro inspector panel');
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'DevTools Pro tools');
      root.append(overlay, panel, bar);
      root.addEventListener('click', onUiClick);
      return { host, root, overlay, panel, bar };
    }

    function attachUi() {
      ui ??= mountUi();
      if (!ui.host.isConnected) document.documentElement.append(ui.host);
      // The top layer keeps the inspector above modal dialogs and popovers the page opens.
      try {
        if ('showPopover' in ui.host) {
          ui.host.popover = 'manual';
          if (ui.host.matches(':popover-open')) ui.host.hidePopover();
          ui.host.showPopover();
        }
      } catch {
        // top layer unavailable; the max z-index still applies
      }
    }

    /** A modal dialog opened after us sits above us in the top layer; step back on top of it. */
    function raiseAboveModal() {
      if (!ui?.host.matches(':popover-open')) return;
      try {
        if (!document.querySelector(':modal')) return;
        ui.host.hidePopover();
        ui.host.showPopover();
      } catch {
        // not in the top layer
      }
    }

    function detachUi() {
      if (!ui) return;
      ui.host.remove();
      ui.overlay.style.display = 'none';
      ui.panel.style.display = 'none';
      renderedModel = null;
    }

    function applyStyles(container: HTMLElement) {
      for (const el of container.querySelectorAll<HTMLElement>('[data-dtp-style]')) {
        try {
          const style = JSON.parse(el.dataset.dtpStyle ?? '{}') as Record<string, string>;
          for (const [prop, value] of Object.entries(style)) el.style.setProperty(prop, value);
        } catch {
          // a malformed style map only costs the swatch
        }
      }
    }

    function draw() {
      if (!ui || !shown) return;
      let rect: Rect;
      if (shown.source === 'self') {
        if (!shown.el.isConnected) return hideHighlight();
        rect = toRect(shown.el.getBoundingClientRect());
      } else {
        if (!shown.frame.isConnected) return hideHighlight();
        const { dx, dy } = frameOffset(shown.frame);
        rect = translateRect(shown.rect, dx, dy);
      }

      const o = ui.overlay.style;
      o.transform = `translate(${rect.left}px, ${rect.top}px)`;
      o.width = `${rect.width}px`;
      o.height = `${rect.height}px`;
      o.display = 'block';

      if (renderedModel !== shown.model) {
        raiseAboveModal();
        try {
          ui.panel.innerHTML = renderPanelHtml(shown.model);
          applyStyles(ui.panel);
        } catch {
          ui.panel.textContent = 'Could not render this element.';
        }
        renderedModel = shown.model;
      }
      ui.panel.classList.toggle('pinned', pinned);
      ui.panel.style.display = 'block';
      const viewport = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight,
      };
      const pos = placePanel(rect, { width: ui.panel.offsetWidth, height: ui.panel.offsetHeight }, viewport);
      ui.panel.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
    }

    function hideHighlight() {
      shown = null;
      if (!ui) return;
      ui.overlay.style.display = 'none';
      ui.panel.style.display = 'none';
    }

    function renderBar() {
      if (!ui) return;
      const tool = activeTool ? getHoverTool(activeTool) : null;
      const status = hint || (pinned ? 'Pinned · click the page to release' : 'Click to pin · Esc to exit');
      ui.bar.innerHTML = `<span class="chip" title="Active tool"><span class="dot" aria-hidden="true"></span>${escapeHtml(tool?.name ?? '')}</span>`
        + HOVER_TOOLS.map(t => `<button type="button" class="tb-btn${t.id === activeTool ? ' active' : ''}" data-tool="${t.id}"`
          + ` aria-pressed="${t.id === activeTool}" title="${escapeHtml(t.name)}">${escapeHtml(t.shortName)}</button>`).join('')
        + `<span class="hint" aria-live="polite">${escapeHtml(status)}</span>`
        + '<button type="button" class="tb-close" data-close aria-label="Close DevTools Pro (Esc)" title="Close (Esc)">✕</button>';
    }

    function flashHint(text: string) {
      hint = text;
      renderBar();
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hint = '';
        renderBar();
      }, 1200);
    }

    async function copyText(text: string): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Clipboard API refused (permissions policy, focus): fall back to a selection copy.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        (ui?.root ?? document.documentElement).append(area);
        area.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        area.remove();
        return ok;
      }
    }

    function onUiClick(e: Event) {
      const target = e.target as Element | null;
      if (!target) return;
      const copyEl = target.closest<HTMLElement>('[data-copy]');
      if (copyEl) {
        void copyText(copyEl.dataset.copy ?? '').then(ok => {
          copyEl.classList.add(ok ? 'copied' : 'copy-failed');
          window.setTimeout(() => copyEl.classList.remove('copied', 'copy-failed'), 800);
          flashHint(ok ? 'Copied' : 'Copy blocked by this page');
        });
        return;
      }
      const toolBtn = target.closest<HTMLElement>('[data-tool]');
      if (toolBtn?.dataset.tool) {
        broadcast({ action: 'dtp:activate', toolId: toolBtn.dataset.tool });
        activate(toolBtn.dataset.tool);
        return;
      }
      if (target.closest('[data-close]')) exitEverywhere();
    }

    // ── Activation ──────────────────────────────────────────────────────────

    function broadcast(message: InspectorMessage) {
      const request: BroadcastRequest = { action: 'dtp:broadcast', message };
      browser.runtime.sendMessage(request).catch(() => {});
    }

    function exitEverywhere() {
      deactivate();
      broadcast({ action: 'dtp:deactivate' });
    }

    function onClick(e: MouseEvent) {
      if (ui && e.composedPath().includes(ui.host)) return; // our own toolbar and panel
      e.preventDefault();
      e.stopPropagation();
      setPinned(!pinned);
      broadcast({ action: 'dtp:pin', pinned });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      exitEverywhere();
    }

    function onScroll() {
      scrollFrame.schedule();
    }

    function setPinned(value: boolean) {
      pinned = value;
      if (!pinned) {
        hovered = null;
        hoverFrame.schedule();
      }
      if (renderHere) {
        renderBar();
        ui?.panel.classList.toggle('pinned', pinned);
      }
    }

    function setCursor() {
      const style = document.documentElement.style;
      savedCursor ??= { value: style.getPropertyValue('cursor'), priority: style.getPropertyPriority('cursor') };
      style.setProperty('cursor', 'crosshair', 'important');
    }

    function restoreCursor() {
      if (!savedCursor) return;
      const style = document.documentElement.style;
      if (savedCursor.value) style.setProperty('cursor', savedCursor.value, savedCursor.priority);
      else style.removeProperty('cursor');
      savedCursor = null;
    }

    /** Start or switch the hover tool in this frame. Throws for ids that are not hover tools. */
    function activate(toolId: string) {
      getHoverTool(toolId);
      const wasActive = activeTool !== null;
      activeTool = toolId;
      hovered = null;
      if (!wasActive) {
        window.addEventListener('mousemove', onPointerMove, { capture: true, passive: true });
        window.addEventListener('mouseout', onPointerOut, { capture: true, passive: true });
        window.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        pinned = false;
        setCursor();
      }
      if (renderHere) {
        attachUi();
        renderBar();
      }
      if (pointer) hoverFrame.schedule();
    }

    function deactivate() {
      if (activeTool === null) return;
      activeTool = null;
      hovered = null;
      pinned = false;
      shown = null;
      lastPostedRect = null;
      hoverFrame.cancel();
      scrollFrame.cancel();
      window.removeEventListener('mousemove', onPointerMove, true);
      window.removeEventListener('mouseout', onPointerOut, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      restoreCursor();
      detachUi();
    }

    // ── Page collectors (top frame, for the popup's page tools) ─────────────

    function collect(what: CollectKind): unknown {
      switch (what) {
        case 'meta': return collectMetaTags();
        case 'css-vars': return collectCssVariables();
        case 'accessibility': return collectAccessibilityData();
        case 'assets': return collectPageAssets();
      }
    }

    function collectMetaTags(): Array<{ name: string; content: string; type: string }> {
      const tags: Array<{ name: string; content: string; type: string }> = [];
      tags.push({ name: 'title', content: document.title, type: 'meta' });
      document.querySelectorAll('meta[name], meta[property]').forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
        const content = meta.getAttribute('content') || '';
        if (name && content) {
          let type = 'meta';
          if (name.startsWith('og:') || name.startsWith('article:')) type = 'og';
          else if (name.startsWith('twitter:')) type = 'twitter';
          tags.push({ name, content, type });
        }
      });
      const charset = document.querySelector('meta[charset]');
      if (charset) tags.push({ name: 'charset', content: charset.getAttribute('charset') || '', type: 'meta' });
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) tags.push({ name: 'viewport', content: viewport.getAttribute('content') || '', type: 'meta' });
      return tags;
    }

    function collectCssVariables(): { vars: CssVariable[]; sheetsTotal: number; sheetsSkipped: number } {
      const vars: CssVariable[] = [];
      const seen = new Set<string>();
      let sheetsTotal = 0;
      let sheetsSkipped = 0;
      const add = (name: string, value: string, scope: string) => {
        const key = `${scope}::${name}`;
        if (seen.has(key)) return;
        seen.add(key);
        vars.push({ name, value: value.trim(), scope });
      };
      for (const sheet of document.styleSheets) {
        sheetsTotal++;
        try {
          for (const rule of sheet.cssRules) {
            if (!(rule instanceof CSSStyleRule)) continue;
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style.item(i);
              if (prop.startsWith('--')) add(prop, rule.style.getPropertyValue(prop), rule.selectorText);
            }
          }
        } catch {
          sheetsSkipped++; // cross-origin stylesheet
        }
      }
      const rootStyle = document.documentElement.style;
      for (let i = 0; i < rootStyle.length; i++) {
        const prop = rootStyle.item(i);
        if (prop.startsWith('--')) add(prop, rootStyle.getPropertyValue(prop), ':root (inline)');
      }
      return { vars, sheetsTotal, sheetsSkipped };
    }

    function collectAccessibilityData() {
      const images = document.querySelectorAll('img');
      let imagesWithoutAlt = 0;
      images.forEach(img => {
        if (!img.hasAttribute('alt')) imagesWithoutAlt++;
      });

      const headings: Array<{ level: number; text: string }> = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        headings.push({ level: parseInt(h.tagName.charAt(1), 10), text: (h.textContent || '').trim().slice(0, 80) });
      });

      const firstLink = document.querySelector('a');
      const hasSkipLink = !!firstLink
        && (firstLink.getAttribute('href') || '').startsWith('#')
        && (firstLink.textContent || '').toLowerCase().includes('skip');

      let linksWithoutText = 0;
      document.querySelectorAll('a').forEach(a => {
        const text = (a.textContent || '').trim();
        if (!text && !a.getAttribute('aria-label') && !a.getAttribute('title') && !a.querySelector('img[alt]')) linksWithoutText++;
      });

      let buttonsWithoutText = 0;
      document.querySelectorAll('button, [role="button"]').forEach(btn => {
        const text = (btn.textContent || '').trim();
        if (!text && !btn.getAttribute('aria-label') && !btn.getAttribute('title')) buttonsWithoutText++;
      });

      let formInputsWithoutLabel = 0;
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach(input => {
        const id = input.getAttribute('id');
        const hasLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) !== null : false;
        if (!hasLabel && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby') && !input.closest('label')) {
          formInputsWithoutLabel++;
        }
      });

      let tabindexPositive = 0;
      document.querySelectorAll('[tabindex]').forEach(el => {
        if (parseInt(el.getAttribute('tabindex') || '0', 10) > 0) tabindexPositive++;
      });

      const ariaRoles = new Set<string>();
      document.querySelectorAll('[role]').forEach(el => {
        const role = el.getAttribute('role');
        if (role) ariaRoles.add(role);
      });

      return {
        imagesTotal: images.length,
        imagesWithoutAlt,
        headings,
        hasMainLandmark: document.querySelector('main, [role="main"]') !== null,
        hasNavLandmark: document.querySelector('nav, [role="navigation"]') !== null,
        hasSkipLink,
        linksWithoutText,
        buttonsWithoutText,
        formInputsWithoutLabel,
        tabindexPositive,
        ariaRolesUsed: [...ariaRoles].sort(),
        htmlLang: document.documentElement.getAttribute('lang') || '',
        titleText: document.title || '',
        landmarkCount: document.querySelectorAll('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]').length,
      };
    }

    function collectPageAssets(): { images: number; scripts: number; stylesheets: number; fonts: string[] } {
      const fonts = new Set<string>();
      document.querySelectorAll('*').forEach(el => {
        window.getComputedStyle(el).fontFamily
          .split(',')
          .map(f => f.trim().replace(/^["']|["']$/g, ''))
          .forEach(f => {
            if (f && !isGenericFont(f)) fonts.add(f);
          });
      });
      return {
        images: document.querySelectorAll('img, picture, svg').length,
        scripts: document.querySelectorAll('script[src]').length,
        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
        fonts: [...fonts].sort(),
      };
    }

    // ── Wiring ──────────────────────────────────────────────────────────────

    function onRuntimeMessage(msg: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): boolean {
      const message = msg as InspectorMessage | undefined;
      switch (message?.action) {
        case 'dtp:activate':
          try {
            activate(message.toolId);
            sendResponse({ ok: true, activeTool } satisfies InspectorReply);
          } catch (err) {
            sendResponse({ ok: false, error: (err as Error).message } satisfies InspectorReply);
          }
          return false;
        case 'dtp:deactivate':
          deactivate();
          sendResponse({ ok: true, activeTool } satisfies InspectorReply);
          return false;
        case 'dtp:pin':
          if (activeTool) setPinned(message.pinned);
          return false;
        case 'dtp:state':
          if (isTop) sendResponse({ ok: true, activeTool } satisfies InspectorReply);
          return false;
        case 'dtp:collect':
          if (isTop) sendResponse(collect(message.what));
          return false;
        default:
          return false;
      }
    }

    browser.runtime.onMessage.addListener(onRuntimeMessage);
    window.addEventListener('message', onWindowMessage);

    g.__dtpInspector = {
      alive: () => {
        try {
          return Boolean(browser.runtime?.id);
        } catch {
          return false; // the extension was reloaded or updated; this instance is orphaned
        }
      },
      destroy: () => {
        deactivate();
        window.removeEventListener('message', onWindowMessage);
        try {
          browser.runtime.onMessage.removeListener(onRuntimeMessage);
        } catch {
          // orphaned runtime
        }
      },
    };
  },
});
