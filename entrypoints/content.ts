import inspectorCss from '@/assets/inspector.css?inline';
import { buildPanelModel, type InspectTarget, type PanelModel } from '@/utils/inspect';
import { renderPanelHtml } from '@/utils/panel-render';
import { HOVER_TOOLS, findTool, getHoverTool } from '@/utils/tools';
import { coalesceToFrames } from '@/utils/schedule';
import { frameContentOffset, placePanel, sameRect, toRect, translateRect, type Rect } from '@/utils/geometry';
import { elementSelector, escapeHtml, formatPath, textPreview, type PathSegment } from '@/utils/dom';
import { parsePx } from '@/utils/spacing';
import { parseFontStack, renderedFamily } from '@/utils/fonts';
import { fontInventoryModel, summarizeFonts, type FontUse } from '@/utils/font-inventory';
import { isGenericFont } from '@/utils/fonts';
import type { CssVariable } from '@/utils/css-vars';
import { parseColor, type RGBA } from '@/utils/colors';
import { auditTextContrast, type BackgroundLayer, type TextSample } from '@/utils/contrast';
import { analyzeHeadings, type AccessibilityData, type HighlightGroup } from '@/utils/accessibility';
import { addRecentColor, buildPalette, type ColorUse } from '@/utils/palette';
import { paletteModel, pickedColorModel } from '@/utils/color-panels';
import { boxModelOf, type AuthoredValue } from '@/utils/inspect';
import { compareSpecificity, sheetLabel, shorthandCandidates, specificity, splitSelectorList, winningDeclarations, type AuthoredDeclaration, type Specificity } from '@/utils/cascade';
import { nonDefaultDeclarations } from '@/utils/css';
import { copiedCssModel, copiedTailwindModel, cssRuleText, tailwindText } from '@/utils/copy-formats';
import { toTailwind } from '@/utils/tailwind';
import { CAPTURE_INTERVAL_MS, MAX_CAPTURE_HEIGHT, captureTiles, dataUrlBytes, deviceCrop, screenshotFilename, type CaptureKind } from '@/utils/capture';
import { changesAsCss, emptyHistory, netChanges, recordEdit, redo, resetEdits, TEXT_PROP, undo, type Edit } from '@/utils/edits';
import { SIDES, editValue, toColorInput, type EditFormState } from '@/utils/edit-form';
import { distanceGuides, formatLength, isDrag, rulerRect } from '@/utils/measure';
import { boxRegions, flexGaps, gridOverlay, parseTrackList } from '@/utils/overlay-geometry';
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
  highlights: HTMLDivElement;
  drawings: HTMLDivElement;
  toast: HTMLDivElement;
}

type Shown =
  | { source: 'static'; model: PanelModel }
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
    let compact = false;
    // Measure and Grid Overlay state (render root only)
    let anchorEl: Element | null = null;
    let altHeld = false;
    let dragStart: { left: number; top: number } | null = null;
    let ruler: Rect | null = null;
    let suppressClick = false;
    const pinnedContainers = new Set<Element>();
    // Live Edit state (render root only). The history outlives tool switches until the page reloads.
    let editHistory = emptyHistory();
    const editTargets: Element[] = [];
    let editTarget: Element | null = null;
    let editGesture = 0;
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
        const anchor = toolId === 'rulers' && anchorEl?.isConnected && anchorEl !== el ? toRect(anchorEl.getBoundingClientRect()) : undefined;
        return buildPanelModel(toolId, targetOf(el), {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          path: pathOf(el),
          anchor,
          authored: toolId === 'css-inspect' ? authoredFor(el) : undefined,
          rootFontSize: parsePx(window.getComputedStyle(document.documentElement).fontSize) || 16,
          renderedFont: toolId === 'font-detect' ? renderedFamily(parseFontStack(window.getComputedStyle(el).fontFamily), fontAvailable) : undefined,
        });
      } catch (err) {
        return { toolId, title: 'Brightbar DevTools', path: pathOf(el), blocks: [{ kind: 'note', text: `Could not inspect this element: ${(err as Error).message}` }] };
      }
    }

    // ── Hover pipeline: at most one update per animation frame ──────────────

    function onPointerMove(e: MouseEvent) {
      pointer = { x: e.clientX, y: e.clientY };
      if (altHeld !== e.altKey) {
        altHeld = e.altKey;
        hoverFrame.schedule();
      }
      if (dragStart && isDrag(dragStart, { left: e.clientX, top: e.clientY })) {
        ruler = rulerRect(dragStart, { left: e.clientX, top: e.clientY });
      }
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
      panel.setAttribute('aria-label', 'Brightbar DevTools inspector panel');
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Brightbar DevTools tools');
      const highlights = document.createElement('div');
      highlights.className = 'highlights';
      highlights.setAttribute('aria-hidden', 'true');
      const drawings = document.createElement('div');
      drawings.className = 'drawings';
      drawings.setAttribute('aria-hidden', 'true');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      root.append(drawings, highlights, overlay, panel, bar, toast);
      root.addEventListener('click', onUiClick);
      root.addEventListener('input', onUiInput);
      root.addEventListener('focusin', onUiGestureStart);
      root.addEventListener('pointerdown', onUiGestureStart);
      return { host, root, overlay, panel, bar, highlights, drawings, toast };
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
      ui.bar.replaceChildren();
      ui.highlights.replaceChildren();
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
      if (!ui) return;
      if (!shown) {
        drawOverlays(null);
        return;
      }
      let rect: Rect;
      if (shown.source === 'static') {
        // Not about an element: sit above the tool bar.
        rect = toRect(ui.bar.getBoundingClientRect());
        ui.overlay.style.display = 'none';
      } else {
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
      }

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
      ui.panel.classList.toggle('compact', compact);
      ui.panel.style.display = 'block';
      const viewport = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight,
      };
      const barRect = ui.bar.childElementCount > 0 ? toRect(ui.bar.getBoundingClientRect()) : null;
      const pos = placePanel(rect, { width: ui.panel.offsetWidth, height: ui.panel.offsetHeight }, viewport, 8, 8, barRect ? [barRect] : []);
      ui.panel.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
      drawOverlays(shown.source === 'self' ? shown.el : null);
    }

    // ── Drawn overlays: spacing regions, grid and flex layout, measurements ─

    interface Drawing {
      box(cls: string, r: Rect): void;
      label(text: string, left: number, top: number, cls?: string): void;
    }

    function drawOverlays(el: Element | null) {
      if (!ui) return;
      const frag = document.createDocumentFragment();
      const drawing: Drawing = {
        box(cls, r) {
          if (r.width <= 0 && r.height <= 0) return;
          const d = document.createElement('div');
          d.className = `dw ${cls}`;
          Object.assign(d.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${Math.max(0, r.width)}px`, height: `${Math.max(0, r.height)}px` });
          frag.append(d);
        },
        label(text, left, top, cls = '') {
          const s = document.createElement('span');
          s.className = `dw-label ${cls}`;
          s.textContent = text;
          Object.assign(s.style, { left: `${Math.round(left)}px`, top: `${Math.round(Math.max(0, top))}px` });
          frag.append(s);
        },
      };
      if (activeTool === 'spacing' && el) drawSpacing(el, drawing);
      if (activeTool === 'grid-overlay') {
        const containers = new Set([...pinnedContainers].filter(c => c.isConnected));
        const hoveredContainer = el ? layoutContainerFor(el) : null;
        if (hoveredContainer) containers.add(hoveredContainer);
        for (const container of containers) drawLayout(container, drawing, pinnedContainers.has(container));
      }
      if (activeTool === 'rulers') drawMeasure(el, drawing);
      ui.drawings.replaceChildren(frag);
    }

    function drawSpacing(el: Element, d: Drawing) {
      const t = targetOf(el);
      const r = t.rect;
      const box = boxModelOf(t);
      const regions = boxRegions(r, box);
      regions.margin.forEach(band => d.box('dw-margin', band));
      regions.padding.forEach(band => d.box('dw-padding', band));
      d.box('dw-content', regions.content);
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      const { margin: m, padding: p, border: b } = box;
      const sideLabel = (value: number, left: number, top: number, cls: string) => {
        if (value > 0) d.label(formatLength(value), left, top, `center dw-small ${cls}`);
      };
      sideLabel(m.top, midX, r.top - m.top / 2, 'dw-margin-label');
      sideLabel(m.bottom, midX, r.top + r.height + m.bottom / 2, 'dw-margin-label');
      sideLabel(m.left, r.left - m.left / 2, midY, 'dw-margin-label');
      sideLabel(m.right, r.left + r.width + m.right / 2, midY, 'dw-margin-label');
      sideLabel(p.top, midX, r.top + b.top + p.top / 2, 'dw-padding-label');
      sideLabel(p.bottom, midX, r.top + r.height - b.bottom - p.bottom / 2, 'dw-padding-label');
      sideLabel(p.left, r.left + b.left + p.left / 2, midY, 'dw-padding-label');
      sideLabel(p.right, r.left + r.width - b.right - p.right / 2, midY, 'dw-padding-label');
      const c = regions.content;
      if (c.width >= 48 && c.height >= 16) d.label(`${Math.round(c.width)} × ${Math.round(c.height)}`, c.left + c.width / 2, c.top + c.height / 2, 'center dw-small dw-content-label');
    }

    /** The grid or flex container an element is, or belongs to. */
    function layoutContainerFor(el: Element): Element | null {
      if (/grid|flex/.test(window.getComputedStyle(el).display)) return el;
      const parent = composedParent(el);
      return parent && /grid|flex/.test(window.getComputedStyle(parent).display) ? parent : null;
    }

    function drawLayout(container: Element, d: Drawing, isPinned: boolean) {
      const cs = window.getComputedStyle(container);
      const t = targetOf(container);
      const rect = t.rect;
      const content = boxRegions(rect, boxModelOf(t)).content;
      d.box(isPinned ? 'dw-container dw-pinned' : 'dw-container', rect);
      if (cs.display.includes('grid')) {
        const grid = gridOverlay({
          content,
          columns: parseTrackList(cs.gridTemplateColumns),
          rows: parseTrackList(cs.gridTemplateRows),
          columnGap: parsePx(cs.columnGap),
          rowGap: parsePx(cs.rowGap),
          justifyContent: cs.justifyContent,
          alignContent: cs.alignContent,
          areas: cs.gridTemplateAreas,
        });
        grid.columns.forEach((col, i) => {
          d.box('dw-track', col);
          d.label(String(i + 1), col.left + col.width / 2, col.top - 10, 'center dw-num');
        });
        grid.rows.forEach((row, i) => {
          d.box('dw-track dw-row', row);
          if (grid.columns.length > 0) d.label(String(i + 1), row.left - 11, row.top + row.height / 2, 'center dw-num');
        });
        [...grid.columnGaps, ...grid.rowGaps].forEach(gap => d.box('dw-gap', gap));
        grid.areas.forEach(area => {
          d.box('dw-area', area);
          d.label(area.name, area.left + area.width / 2, area.top + area.height / 2, 'center dw-area-name');
        });
        d.label(`grid · ${grid.columns.length} × ${grid.rows.length}${isPinned ? ' · kept' : ''}`, rect.left, rect.top - 38, 'dw-title');
      } else {
        const items = Array.from(container.children)
          .filter(child => {
            const ccs = window.getComputedStyle(child);
            return ccs.display !== 'none' && ccs.position !== 'absolute' && ccs.position !== 'fixed';
          })
          .map(child => toRect(child.getBoundingClientRect()));
        items.forEach(item => d.box('dw-item', item));
        flexGaps(items, cs.flexDirection).forEach(gap => d.box('dw-gap', gap));
        const arrow: Record<string, string> = { row: '→', 'row-reverse': '←', column: '↓', 'column-reverse': '↑' };
        d.label(`flex · ${cs.flexDirection} ${arrow[cs.flexDirection] ?? ''}${cs.flexWrap === 'nowrap' ? '' : ' · wrap'}${isPinned ? ' · kept' : ''}`, rect.left, rect.top - 20, 'dw-title');
      }
    }

    function drawMeasure(el: Element | null, d: Drawing) {
      const sizeLabel = (r: Rect, cls: string) =>
        d.label(`${Number(r.width.toFixed(1))} × ${Number(r.height.toFixed(1))}`, r.left, r.top >= 22 ? r.top - 20 : r.top + r.height + 4, `dw-size ${cls}`);
      const anchor = anchorEl?.isConnected ? toRect(anchorEl.getBoundingClientRect()) : null;
      if (anchor) {
        d.box('dw-anchor', anchor);
        sizeLabel(anchor, 'dw-anchor-label');
      }
      if (el && el !== anchorEl) {
        const r = toRect(el.getBoundingClientRect());
        sizeLabel(r, '');
        if (anchor && altHeld) {
          for (const g of distanceGuides(anchor, r)) {
            d.box(g.axis === 'x' ? 'dw-guide' : 'dw-guide', g.axis === 'x'
              ? { left: g.x1, top: g.y1, width: g.length, height: 1 }
              : { left: g.x1, top: g.y1, width: 1, height: g.length });
            d.label(formatLength(g.length), (g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2, 'center dw-guide-label');
          }
        }
      }
      if (ruler) {
        d.box('dw-ruler', ruler);
        d.label(`${Math.round(ruler.width)} × ${Math.round(ruler.height)}`, ruler.left + ruler.width / 2, ruler.top + ruler.height / 2, 'center dw-ruler-label');
      }
    }

    function currentElement(): Element | null {
      return shown?.source === 'self' ? shown.el : null;
    }

    function toggleAnchor() {
      const el = currentElement();
      ruler = null;
      anchorEl = el && el !== anchorEl ? el : null;
      flashHint(anchorEl ? 'Anchored · hold Alt over another element' : 'Anchor cleared');
      hovered = null; // rebuild the panel with or without "To anchor"
      hoverFrame.schedule();
      draw();
    }

    function togglePinnedContainer() {
      const el = currentElement();
      const container = el ? layoutContainerFor(el) : null;
      if (!container) {
        flashHint('Not a grid or flex container');
        return;
      }
      if (pinnedContainers.has(container)) pinnedContainers.delete(container);
      else pinnedContainers.add(container);
      flashHint(`${pinnedContainers.size} overlay${pinnedContainers.size === 1 ? '' : 's'} kept`);
      draw();
    }

    function onMouseDown(e: MouseEvent) {
      if (activeTool !== 'rulers' || !renderHere || e.button !== 0) return;
      if (ui && e.composedPath().includes(ui.host)) return;
      e.preventDefault(); // no text selection while measuring
      dragStart = { left: e.clientX, top: e.clientY };
    }

    function onMouseUp(e: MouseEvent) {
      if (!dragStart) return;
      const end = { left: e.clientX, top: e.clientY };
      if (isDrag(dragStart, end)) {
        ruler = rulerRect(dragStart, end);
        suppressClick = true;
        flashHint(`${Math.round(ruler.width)} × ${Math.round(ruler.height)} · click to clear`);
        draw();
      }
      dragStart = null;
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt' && altHeld) {
        altHeld = false;
        draw();
      }
    }

    function hideHighlight() {
      shown = null;
      if (!ui) return;
      ui.overlay.style.display = 'none';
      ui.panel.style.display = 'none';
    }

    function renderBar() {
      if (!ui) return;
      if (!activeTool) {
        // No tool: no bar. A late hint timer must not bring it back.
        ui.bar.replaceChildren();
        return;
      }
      const tool = activeTool ? getHoverTool(activeTool) : null;
      const status = hint || (activeTool === 'live-edit' && editTarget
        ? 'Editing · ⌘/Ctrl+Z undo · click another element'
        : pinned ? 'Pinned · click the page to release' : `${tool?.hint ?? 'Click to pin'} · Esc to exit`);
      ui.bar.innerHTML = `<span class="chip" title="Active tool"><span class="dot" aria-hidden="true"></span>${escapeHtml(tool?.name ?? '')}</span>`
        + HOVER_TOOLS.map(t => `<button type="button" class="tb-btn${t.id === activeTool ? ' active' : ''}" data-tool="${t.id}"`
          + ` aria-pressed="${t.id === activeTool}" title="${escapeHtml(t.name)}">${escapeHtml(t.shortName)}</button>`).join('')
        + '<span class="sep" aria-hidden="true"></span>'
        + '<button type="button" class="tb-btn tb-action" data-action="capture-element" title="Screenshot the hovered element (S)" aria-keyshortcuts="S">Capture</button>'
        + (tool?.actions ?? []).map(a => `<button type="button" class="tb-btn tb-action" data-action="${a.id}"`
          + ` title="${escapeHtml(`${a.description} (${a.key.toUpperCase()})`)}" aria-keyshortcuts="${a.key.toUpperCase()}">${escapeHtml(a.label)}</button>`).join('')
        + `<span class="hint" aria-live="polite">${escapeHtml(status)}</span>`
        + '<button type="button" class="tb-close" data-close aria-label="Close Brightbar DevTools (Esc)" title="Close (Esc)">✕</button>';
    }

    function flashHint(text: string, ms = 1200) {
      hint = text;
      renderBar();
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hint = '';
        renderBar();
      }, ms);
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
      const editBtn = target.closest<HTMLElement>('[data-edit-action]');
      if (editBtn?.dataset.editAction) {
        void runEditAction(editBtn.dataset.editAction);
        return;
      }
      const copyEl = target.closest<HTMLElement>('[data-copy]');
      if (copyEl) {
        void copyText(copyEl.dataset.copy ?? '').then(ok => {
          copyEl.classList.add(ok ? 'copied' : 'copy-failed');
          window.setTimeout(() => copyEl.classList.remove('copied', 'copy-failed'), 800);
          flashHint(ok ? 'Copied' : 'Copy blocked by this page');
        });
        return;
      }
      const actionBtn = target.closest<HTMLElement>('[data-action]');
      if (actionBtn?.dataset.action) {
        void runAction(actionBtn.dataset.action);
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
      if (suppressClick) {
        suppressClick = false; // the click that ends a ruler drag
        return;
      }
      if (activeTool === 'live-edit') {
        if (renderHere) selectForEdit(deepElementFromPoint(e.clientX, e.clientY));
        return;
      }
      if (activeTool === 'rulers' || activeTool === 'grid-overlay') {
        if (renderHere) {
          if (activeTool === 'rulers') toggleAnchor();
          else togglePinnedContainer();
        }
        return;
      }
      setPinned(!pinned);
      broadcast({ action: 'dtp:pin', pinned });
    }

    function isEditable(node: EventTarget | undefined): boolean {
      return node instanceof HTMLElement && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitEverywhere();
        return;
      }
      if (activeTool === 'live-edit' && renderHere && (e.metaKey || e.ctrlKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        const ours = Boolean(ui && e.composedPath().includes(ui.host));
        if ((key === 'z' || key === 'y') && (ours || editHistory.done.length > 0 || editHistory.undone.length > 0)) {
          e.preventDefault();
          e.stopPropagation();
          if (key === 'y' || e.shiftKey) redoEdit();
          else undoEdit();
          return;
        }
      }
      if (e.key === 'Alt') {
        if (activeTool === 'rulers') e.preventDefault(); // keep the browser menu from taking focus
        if (!altHeld) {
          altHeld = true;
          draw();
        }
        return;
      }
      // Keys typed into our own panel (e.g. the Live Edit form) are text, not shortcuts.
      if (ui && e.composedPath().includes(ui.host)) return;
      if (!renderHere || !activeTool || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.composedPath()[0])) return;
      const key = e.key.toLowerCase();
      const actionId = key === 's' ? 'capture-element' : findTool(activeTool)?.actions?.find(a => a.key === key)?.id;
      if (!actionId) return;
      e.preventDefault();
      e.stopPropagation();
      void runAction(actionId);
    }

    // ── Tool actions (render root) ──────────────────────────────────────────

    async function runAction(id: string) {
      if (!renderHere || !activeTool) return;
      if (id === 'eyedropper') await pickPixel();
      else if (id === 'palette') showPalette();
      else if (id === 'copy-css') await copyStyles('css');
      else if (id === 'copy-tailwind') await copyStyles('tailwind');
      else if (id === 'capture-element') await captureElementAction();
      else if (id === 'fonts') showFontInventory();
      else flashHint(`Unknown action "${id}"`);
    }

    /** Copy the hovered (or pinned) element's computed styles, then show exactly what was copied. */
    async function copyStyles(format: 'css' | 'tailwind') {
      const el = currentElement();
      if (!el) {
        flashHint(shown?.source === 'frame' ? 'Copy works on elements of the top page' : 'Hover an element first');
        return;
      }
      const cs = window.getComputedStyle(el);
      const decls = nonDefaultDeclarations(prop => cs.getPropertyValue(prop)).map(({ prop, value }) => ({ prop, value }));
      const path = pathOf(el);
      if (format === 'css') {
        const text = cssRuleText(elementSelector({ tagName: el.tagName, id: el.id, className: classNameOf(el) }), decls, path);
        const ok = await copyText(text);
        showStatic(copiedCssModel(text, decls.length, path));
        flashHint(ok ? 'Copied as CSS · click the page to go back' : 'Copy blocked by this page');
      } else {
        const result = toTailwind(decls);
        const ok = await copyText(tailwindText(result));
        showStatic(copiedTailwindModel(result, path));
        flashHint(ok ? `Copied ${result.classes.length} classes${result.unmapped.length ? ` · ${result.unmapped.length} not mapped` : ''}` : 'Copy blocked by this page');
      }
    }

    // ── Live Edit: text, spacing, colour and font size, with a real undo ────

    function targetKey(el: Element): number {
      const index = editTargets.indexOf(el);
      return index >= 0 ? index : editTargets.push(el) - 1;
    }

    function readEditable(el: Element, prop: string): string {
      if (prop === TEXT_PROP) return el.textContent ?? '';
      return (el as HTMLElement).style?.getPropertyValue(prop) ?? '';
    }

    /** Edits are inline `!important` declarations so page CSS cannot override them; '' removes ours. */
    function writeEditable(el: Element, prop: string, value: string) {
      if (prop === TEXT_PROP) {
        el.textContent = value;
        return;
      }
      const style = (el as HTMLElement).style;
      if (!style) return;
      if (value) style.setProperty(prop, value, 'important');
      else style.removeProperty(prop);
    }

    /** Selector for exported changes: nearest id, else a tag path with :nth-of-type where needed. */
    function cssSelectorFor(el: Element): string {
      const parts: string[] = [];
      for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const tag = node.tagName.toLowerCase();
        const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(c => c.tagName === node!.tagName) : [];
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
        if (tag === 'body') break;
      }
      return parts.join(' > ');
    }

    function editStateFor(el: Element): EditFormState {
      const cs = window.getComputedStyle(el);
      const text = el.textContent ?? '';
      return {
        selector: formatPath(pathOf(el), 3),
        text: el.children.length === 0 && text.length <= 5000 ? text : null,
        margin: SIDES.map(side => parsePx(cs.getPropertyValue(`margin-${side}`))),
        padding: SIDES.map(side => parsePx(cs.getPropertyValue(`padding-${side}`))),
        color: toColorInput(cs.color),
        background: toColorInput(cs.backgroundColor),
        backgroundTransparent: parseColor(cs.backgroundColor)?.a === 0,
        fontSize: parsePx(cs.fontSize),
        canUndo: editHistory.done.length > 0,
        canRedo: editHistory.undone.length > 0,
        changes: netChanges(editHistory).length,
      };
    }

    function showEditForm() {
      if (!editTarget) return;
      shown = {
        source: 'self',
        el: editTarget,
        model: { toolId: 'live-edit', title: 'Live Edit', path: pathOf(editTarget), blocks: [{ kind: 'edit-form', state: editStateFor(editTarget) }] },
      };
      draw();
      renderBar();
    }

    function selectForEdit(el: Element | null) {
      if (!el || el === ui?.host) return;
      editTarget = el;
      targetKey(el);
      pinned = true;
      showEditForm();
    }

    function onUiGestureStart(e: Event) {
      if ((e.target as Element | null)?.closest?.('[data-edit]')) editGesture++;
    }

    function onUiInput(e: Event) {
      const input = (e.target as Element | null)?.closest<HTMLInputElement | HTMLTextAreaElement>('[data-edit]');
      const prop = input?.dataset.edit;
      if (!input || !prop || !editTarget || activeTool !== 'live-edit') return;
      const el = editTarget;
      const value = editValue(prop, input.value);
      const before = readEditable(el, prop);
      writeEditable(el, prop, value);
      editHistory = recordEdit(editHistory, { target: targetKey(el), prop, before, after: value, gesture: editGesture });
      updateEditControls();
    }

    /** Refresh buttons and the change count without re-rendering the form, so the field keeps focus. */
    function updateEditControls() {
      if (!ui) return;
      const changes = netChanges(editHistory).length;
      const enable = (action: string, on: boolean) => {
        const button = ui!.panel.querySelector<HTMLButtonElement>(`[data-edit-action="${action}"]`);
        if (button) button.disabled = !on;
      };
      enable('undo', editHistory.done.length > 0);
      enable('redo', editHistory.undone.length > 0);
      enable('reset-all', changes > 0);
      enable('copy', changes > 0);
      const note = ui.panel.querySelector('.edit-form > .ef-note:last-child');
      if (note) note.textContent = `${changes} change${changes === 1 ? '' : 's'} on this page · edits stay until you reload`;
      scrollFrame.schedule(); // the element may have changed size
    }

    const describeEdits = (edits: Edit[]) => (edits.length === 1 ? (edits[0]!.prop === TEXT_PROP ? 'text' : edits[0]!.prop) : `${edits.length} changes`);

    function applyEdits(edits: Edit[], side: 'before' | 'after') {
      for (const edit of edits) {
        const el = editTargets[edit.target];
        if (el?.isConnected) writeEditable(el, edit.prop, edit[side]);
      }
    }

    function undoEdit() {
      const { history, revert } = undo(editHistory);
      if (revert.length === 0) {
        flashHint('Nothing to undo');
        return;
      }
      editHistory = history;
      applyEdits(revert, 'before');
      editGesture++;
      showEditForm();
      flashHint(`Undid ${describeEdits(revert)}`);
    }

    function redoEdit() {
      const { history, apply } = redo(editHistory);
      if (apply.length === 0) {
        flashHint('Nothing to redo');
        return;
      }
      editHistory = history;
      applyEdits(apply, 'after');
      editGesture++;
      showEditForm();
      flashHint(`Redid ${describeEdits(apply)}`);
    }

    async function runEditAction(action: string) {
      if (action === 'undo') undoEdit();
      else if (action === 'redo') redoEdit();
      else if (action === 'reset-element' || action === 'reset-all') {
        const target = action === 'reset-element' && editTarget ? targetKey(editTarget) : undefined;
        if (action === 'reset-element' && target === undefined) return;
        const { history, apply } = resetEdits(editHistory, ++editGesture, target);
        editGesture++;
        if (apply.length === 0) {
          flashHint('Nothing to reset');
          return;
        }
        editHistory = history;
        applyEdits(apply, 'after');
        showEditForm();
        flashHint(action === 'reset-all' ? 'Reset every change · Undo brings them back' : 'Reset this element · Undo brings it back', 2500);
      } else if (action === 'copy') {
        const css = changesAsCss(editHistory, t => {
          const el = editTargets[t];
          return el?.isConnected ? cssSelectorFor(el) : '/* element no longer on the page */';
        });
        const ok = await copyText(css);
        flashHint(ok ? 'Copied changes as CSS' : 'Copy blocked by this page');
      } else if (action === 'done') {
        editTarget = null;
        setPinned(false);
        hideHighlight();
        renderBar();
      }
    }

    // ── Screenshots: one element or the full page, stitched from viewport captures ─

    let lastCaptureAt = 0;
    let toastTimer: number | undefined;
    let capturing = false;

    const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
    const frames = (count: number) => new Promise<void>(resolve => {
      const step = (left: number) => (left <= 0 ? resolve() : window.requestAnimationFrame(() => step(left - 1)));
      step(count);
    });

    function showToast(text: string, ms = 6000) {
      if (!ui) return;
      ui.toast.textContent = text;
      ui.toast.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        ui?.toast.classList.remove('show');
        if (activeTool === null && highlighted.length === 0) detachUi();
      }, ms);
    }

    /** One viewport capture, spaced to stay under Chrome's rate limit, after the page has painted. */
    async function captureViewport(): Promise<ImageBitmap> {
      const delay = lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now();
      if (delay > 0) await wait(delay);
      await frames(2);
      lastCaptureAt = Date.now();
      const reply = await browser.runtime.sendMessage({ action: 'captureTab' });
      if (typeof reply !== 'string') throw new Error((reply as { error?: string } | undefined)?.error ?? 'The browser did not return a capture');
      const { mime, bytes } = dataUrlBytes(reply);
      return createImageBitmap(new Blob([bytes], { type: mime }));
    }

    /** Hide fixed and sticky elements (so they appear once, not on every tile); returns the undo. */
    function hideFixedElements(except?: Element): () => void {
      const changed: Array<{ el: HTMLElement; value: string; priority: string }> = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el === ui?.host || (except && (el.contains(except) || except.contains(el)))) continue;
        const position = window.getComputedStyle(el).position;
        if (position !== 'fixed' && position !== 'sticky') continue;
        changed.push({ el, value: el.style.getPropertyValue('visibility'), priority: el.style.getPropertyPriority('visibility') });
        el.style.setProperty('visibility', 'hidden', 'important');
      }
      return () => {
        for (const c of changed) {
          if (c.value) c.el.style.setProperty('visibility', c.value, c.priority);
          else c.el.style.removeProperty('visibility');
        }
      };
    }

    interface CaptureResult {
      blob: Blob;
      width: number;
      height: number;
      truncated: boolean;
    }

    /**
     * Capture document rows [top, bottom) and columns [left, left + width) by scrolling and
     * stitching viewport captures. Our own UI is hidden throughout; fixed and sticky elements
     * are hidden after the first tile, or from the start for an element capture.
     */
    async function captureDocumentRange(left: number, width: number, top: number, bottom: number, target?: Element): Promise<CaptureResult> {
      const scroller = document.scrollingElement ?? document.documentElement;
      const start = { x: window.scrollX, y: window.scrollY };
      const viewportHeight = window.innerHeight;
      const end = Math.min(bottom, top + MAX_CAPTURE_HEIGHT);
      const tiles = captureTiles(top, end, viewportHeight, scroller.scrollHeight - viewportHeight);
      const host = ui?.host;
      host?.style.setProperty('visibility', 'hidden', 'important');
      let restoreFixed: (() => void) | null = target ? hideFixedElements(target) : null;
      let canvas: OffscreenCanvas | null = null;
      let context: OffscreenCanvasRenderingContext2D | null = null;
      let dpr = window.devicePixelRatio || 1;
      try {
        for (const [i, tile] of tiles.entries()) {
          window.scrollTo({ top: tile.scrollY, left: 0, behavior: 'instant' });
          if (i === 1 && !restoreFixed) restoreFixed = hideFixedElements();
          const bitmap = await captureViewport();
          dpr = bitmap.width / window.innerWidth;
          if (!canvas) {
            canvas = new OffscreenCanvas(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round((end - top) * dpr)));
            context = canvas.getContext('2d');
          }
          const src = deviceCrop({ left, top: tile.fromY - window.scrollY, width, height: tile.height }, dpr, bitmap);
          context?.drawImage(bitmap, src.sx, src.sy, src.sw, src.sh, 0, Math.round((tile.fromY - top) * dpr), src.sw, src.sh);
          bitmap.close();
        }
      } finally {
        restoreFixed?.();
        window.scrollTo({ top: start.y, left: start.x, behavior: 'instant' });
        host?.style.removeProperty('visibility');
      }
      if (!canvas) throw new Error('Nothing to capture');
      return { blob: await canvas.convertToBlob({ type: 'image/png' }), width: canvas.width, height: canvas.height, truncated: bottom > end };
    }

    async function deliverCapture(kind: CaptureKind, result: CaptureResult) {
      const name = screenshotFilename(kind, location.hostname, new Date());
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      // Inside our shadow root, so the inspector's own click interception lets it through.
      (ui?.root ?? document.documentElement).append(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 30000);
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.blob })]);
        copied = true;
      } catch {
        copied = false;
      }
      showToast(`Saved ${name} · ${result.width} × ${result.height} px${copied ? ' · copied to the clipboard' : ''}${result.truncated ? ' · cut at 16,000px' : ''}`);
    }

    async function captureElementAction() {
      const el = currentElement() ?? hovered;
      if (!el || capturing) {
        flashHint(capturing ? 'Already capturing' : 'Hover an element, then press S');
        return;
      }
      capturing = true;
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const rect = el.getBoundingClientRect();
        const result = await captureDocumentRange(Math.max(0, rect.left), Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)), rect.top + window.scrollY, rect.bottom + window.scrollY, el);
        await deliverCapture('element', result);
      } catch (err) {
        showToast(`Could not capture: ${(err as Error).message}`);
      } finally {
        capturing = false;
      }
    }

    async function capturePageAction() {
      if (capturing) return;
      capturing = true;
      attachUi();
      try {
        const scroller = document.scrollingElement ?? document.documentElement;
        const result = await captureDocumentRange(0, window.innerWidth, 0, scroller.scrollHeight);
        await deliverCapture('page', result);
      } catch (err) {
        showToast(`Could not capture the page: ${(err as Error).message}`);
      } finally {
        capturing = false;
      }
    }

    // ── Authored CSS: which same-origin rule set each property ──────────────

    interface FlatRule {
      branches: Array<{ text: string; spec: Specificity }>;
      style: CSSStyleDeclaration;
      order: number;
      source: string;
    }

    const ruleCache = new WeakMap<Document | ShadowRoot, { key: string; rules: FlatRule[] }>();

    function stylesheetsOf(root: Document | ShadowRoot): CSSStyleSheet[] {
      return [...Array.from(root.styleSheets), ...Array.from(root.adoptedStyleSheets ?? [])];
    }

    /** Style rules that can apply, in document order: media and supports conditions evaluated, layers and containers flattened. */
    function flatRules(root: Document | ShadowRoot): FlatRule[] {
      const sheets = stylesheetsOf(root);
      const key = sheets.map(sheet => {
        try {
          return `${sheet.href ?? ''}#${sheet.cssRules.length}${sheet.disabled ? 'x' : ''}`;
        } catch {
          return `${sheet.href ?? ''}#cors`;
        }
      }).join('|');
      const cached = ruleCache.get(root);
      if (cached?.key === key) return cached.rules;
      const rules: FlatRule[] = [];
      const visit = (list: CSSRuleList, source: string) => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSStyleRule) {
            const branches = splitSelectorList(rule.selectorText).map(text => ({ text, spec: specificity(text) }));
            rules.push({ branches, style: rule.style, order: rules.length, source });
          } else if (rule instanceof CSSMediaRule) {
            if (window.matchMedia(rule.media.mediaText).matches) visit(rule.cssRules, source);
          } else if (rule instanceof CSSSupportsRule) {
            if (CSS.supports(rule.conditionText)) visit(rule.cssRules, source);
          } else if (rule instanceof CSSGroupingRule) {
            visit(rule.cssRules, source); // @layer, @container, @scope: included without evaluating
          }
        }
      };
      for (const sheet of sheets) {
        if (sheet.disabled) continue;
        try {
          visit(sheet.cssRules, sheetLabel(sheet.href));
        } catch {
          // cross-origin stylesheet: its rules cannot be read
        }
      }
      ruleCache.set(root, { key, rules });
      return rules;
    }

    function declarationsFrom(style: CSSStyleDeclaration, base: Omit<AuthoredDeclaration, 'prop' | 'value' | 'important'>, out: AuthoredDeclaration[]) {
      for (let i = 0; i < style.length; i++) {
        const prop = style.item(i);
        let value = style.getPropertyValue(prop);
        if (!value) {
          // `padding: var(--x)` leaves its longhands empty in CSSOM; the shorthand holds the authored text.
          for (const shorthand of shorthandCandidates(prop)) {
            value = style.getPropertyValue(shorthand);
            if (value) break;
          }
        }
        if (value) out.push({ ...base, prop, value: value.trim(), important: style.getPropertyPriority(prop) === 'important' });
      }
    }

    function authoredFor(el: Element): Record<string, AuthoredValue> {
      const root = el.getRootNode();
      const scope: Document | ShadowRoot = root instanceof ShadowRoot ? root : document;
      const decls: AuthoredDeclaration[] = [];
      try {
        for (const rule of flatRules(scope)) {
          let best: { text: string; spec: Specificity } | null = null;
          for (const branch of rule.branches) {
            let matches = false;
            try {
              matches = el.matches(branch.text);
            } catch {
              matches = false; // pseudo-elements and unsupported selectors
            }
            if (matches && (!best || compareSpecificity(branch.spec, best.spec) > 0)) best = branch;
          }
          if (best) declarationsFrom(rule.style, { selector: best.text, specificity: best.spec, order: rule.order, source: rule.source }, decls);
        }
        const inline = (el as HTMLElement).style;
        if (inline) declarationsFrom(inline, { selector: 'style=""', specificity: [0, 0, 0], order: Number.MAX_SAFE_INTEGER, source: 'inline', inline: true }, decls);
      } catch {
        return {};
      }
      const out: Record<string, AuthoredValue> = {};
      for (const [prop, decl] of winningDeclarations(decls)) out[prop] = { value: decl.value, selector: decl.selector, source: decl.source };
      return out;
    }

    function showStatic(model: PanelModel) {
      setPinned(true);
      shown = { source: 'static', model };
      draw();
    }

    async function rememberColor(hex: string): Promise<string[]> {
      try {
        const stored = await browser.storage.local.get('recentColors');
        const recent = addRecentColor(Array.isArray(stored.recentColors) ? stored.recentColors as string[] : [], hex);
        await browser.storage.local.set({ recentColors: recent });
        return recent;
      } catch {
        return [hex];
      }
    }

    /** The native EyeDropper samples any pixel on screen (images, gradients, canvas) with no permission. */
    async function pickPixel() {
      const EyeDropperCtor = (window as Window & { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (typeof EyeDropperCtor !== 'function') {
        flashHint(window.isSecureContext ? 'This browser has no eyedropper' : 'The eyedropper needs an https page');
        return;
      }
      setPinned(true);
      if (ui) {
        // Keep our own outline and panel out of the sample.
        ui.overlay.style.display = 'none';
        ui.panel.style.display = 'none';
      }
      try {
        const { sRGBHex } = await new EyeDropperCtor().open();
        const recent = await rememberColor(sRGBHex);
        showStatic(pickedColorModel(sRGBHex, recent));
        flashHint(`Picked ${sRGBHex} · click a value to copy`);
      } catch (err) {
        setPinned(false);
        if ((err as DOMException)?.name !== 'AbortError') flashHint(`Eyedropper unavailable: ${(err as Error).message}`);
      }
    }

    const fontAvailability = new Map<string, boolean>();
    let measureContext: OffscreenCanvasRenderingContext2D | null = null;

    /**
     * Whether a family can render: a loaded @font-face with that name, or text measured in it that
     * differs from every generic fallback (so the browser did not silently substitute one).
     */
    function fontAvailable(family: string): boolean {
      const cached = fontAvailability.get(family);
      if (cached !== undefined) return cached;
      let available = false;
      try {
        document.fonts.forEach(face => {
          if (face.status === 'loaded' && face.family.replace(/^["']|["']$/g, '') === family) available = true;
        });
        measureContext ??= new OffscreenCanvas(1, 1).getContext('2d');
        if (!available && measureContext) {
          const sample = 'mmmmmmmmmmlli1WQ@#';
          const quoted = `"${family.replace(/["\\]/g, '')}"`;
          for (const fallback of ['monospace', 'serif', 'sans-serif']) {
            measureContext.font = `72px ${fallback}`;
            const base = measureContext.measureText(sample).width;
            measureContext.font = `72px ${quoted}, ${fallback}`;
            if (measureContext.measureText(sample).width !== base) {
              available = true;
              break;
            }
          }
        }
      } catch {
        available = false;
      }
      fontAvailability.set(family, available);
      return available;
    }

    /** Every family the page actually renders text in, with weights and sizes. */
    function showFontInventory() {
      const uses: FontUse[] = [];
      let scanned = 0;
      for (const root of allRoots()) {
        for (const el of root.querySelectorAll('*')) {
          if (++scanned > 20000) break;
          if (!Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim())) continue;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility !== 'visible') continue;
          uses.push({ family: renderedFamily(parseFontStack(cs.fontFamily), fontAvailable), weight: cs.fontWeight, size: cs.fontSize, style: cs.fontStyle });
        }
      }
      showStatic(fontInventoryModel(summarizeFonts(uses)));
      flashHint('Fonts as rendered · click a family to copy · click the page to go back', 2500);
    }

    /** Every distinct colour in computed styles, by role, with counts. */
    function showPalette() {
      const uses: ColorUse[] = [];
      let scanned = 0;
      for (const root of allRoots()) {
        for (const el of root.querySelectorAll('*')) {
          if (++scanned > 20000) break;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none') continue;
          uses.push({ role: 'background', value: cs.backgroundColor });
          if (Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim())) {
            uses.push({ role: 'text', value: cs.color });
          }
          for (const side of ['top', 'right', 'bottom', 'left']) {
            if (parsePx(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') {
              uses.push({ role: 'border', value: cs.getPropertyValue(`border-${side}-color`) });
            }
          }
          if (el instanceof SVGElement) {
            for (const prop of ['fill', 'stroke']) {
              const value = cs.getPropertyValue(prop);
              if (value && value !== 'none' && !value.startsWith('url(')) uses.push({ role: 'svg', value });
            }
          }
        }
      }
      showStatic(paletteModel(buildPalette(uses)));
      flashHint('Click a swatch to copy · click the page to go back');
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

    function resetDrawnState() {
      anchorEl = null;
      ruler = null;
      dragStart = null;
      suppressClick = false;
      altHeld = false;
      pinnedContainers.clear();
      editTarget = null;
      ui?.drawings.replaceChildren();
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
      if (activeTool !== toolId) resetDrawnState();
      activeTool = toolId;
      hovered = null;
      if (!wasActive) {
        window.addEventListener('mousemove', onPointerMove, { capture: true, passive: true });
        window.addEventListener('mouseout', onPointerOut, { capture: true, passive: true });
        window.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        window.addEventListener('mousedown', onMouseDown, true);
        window.addEventListener('mouseup', onMouseUp, true);
        window.addEventListener('keyup', onKeyUp, true);
        pinned = false;
        setCursor();
      }
      if (renderHere) {
        attachUi();
        renderBar();
        void loadCompact();
      }
      if (pointer) hoverFrame.schedule();
    }

    async function loadCompact() {
      try {
        const { compactMode } = await browser.storage.local.get('compactMode');
        setCompact(Boolean(compactMode));
      } catch {
        setCompact(false);
      }
    }

    function setCompact(value: boolean) {
      if (compact === value) return;
      compact = value;
      if (ui) {
        ui.panel.classList.toggle('compact', compact);
        draw();
      }
    }

    function onStorageChanged(changes: Record<string, { newValue?: unknown }>, area: string) {
      if (area === 'local' && 'compactMode' in changes) setCompact(Boolean(changes.compactMode?.newValue));
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
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keyup', onKeyUp, true);
      resetDrawnState();
      window.clearTimeout(hintTimer);
      hint = '';
      restoreCursor();
      clearHighlights();
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

    // ── Accessibility audit: collection, contrast, highlight on page ───────

    /** Elements behind the last audit's findings; the popup refers to them by index. */
    let auditTargets: Element[] = [];
    let highlighted: Element[] = [];
    let highlightTimer: number | undefined;
    let highlightFrames = 0;

    const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'OPTION']);
    const MAX_TEXT_ELEMENTS = 4000;

    /** The document plus every open and closed shadow root in it, except our own. */
    function allRoots(): Array<Document | ShadowRoot> {
      const roots: Array<Document | ShadowRoot> = [document];
      for (let i = 0; i < roots.length; i++) {
        for (const el of roots[i]!.querySelectorAll('*')) {
          const shadow = shadowRootOf(el);
          if (shadow) roots.push(shadow);
        }
      }
      return roots;
    }

    /** Parent in the rendered (flat) tree: slotted content paints inside its slot. */
    function flatParent(el: Element): Element | null {
      return el.assignedSlot ?? composedParent(el);
    }

    function hasAccessibleName(el: Element): boolean {
      return Boolean((el.textContent || '').trim()
        || el.getAttribute('aria-label')?.trim()
        || el.getAttribute('aria-labelledby')
        || el.getAttribute('title')?.trim()
        || el.querySelector('img[alt]:not([alt=""]), svg title'));
    }

    function collectAccessibilityData(): AccessibilityData {
      auditTargets = [];
      const register = (el: Element) => auditTargets.push(el) - 1;
      const groups: AccessibilityData['groups'] = {};
      const group = (name: HighlightGroup, els: Element[]) => {
        if (els.length > 0) groups[name] = els.map(register);
        return els.length;
      };
      const roots = allRoots();
      const all = <E extends Element = Element>(selector: string): E[] =>
        roots.flatMap(root => Array.from(root.querySelectorAll<E>(selector)));

      const images = all<HTMLImageElement>('img');
      const imagesWithoutAlt = group('images-no-alt', images.filter(img => !img.hasAttribute('alt')));

      // Heading order only means something in document order, so headings come from the light DOM.
      const headingEls = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      const headings = headingEls.map(h => ({ level: parseInt(h.tagName.charAt(1), 10), text: (h.textContent || '').trim().slice(0, 80) }));
      group('headings-skipped', analyzeHeadings(headings).flatMap((h, i) => (h.outOfOrder ? [headingEls[i]!] : [])));

      const firstLink = document.querySelector('a');
      const hasSkipLink = !!firstLink
        && (firstLink.getAttribute('href') || '').startsWith('#')
        && (firstLink.textContent || '').toLowerCase().includes('skip');

      const linksWithoutText = group('links-no-text', all('a[href]').filter(a => !hasAccessibleName(a)));
      const buttonsWithoutText = group('buttons-no-text', all('button, [role="button"]').filter(b => !hasAccessibleName(b)));
      const formInputsWithoutLabel = group('inputs-no-label', all('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea').filter(input => {
        const id = input.getAttribute('id');
        const root = input.getRootNode() as Document | ShadowRoot;
        const labelFor = id ? root.querySelector(`label[for="${CSS.escape(id)}"]`) !== null : false;
        return !labelFor && !input.closest('label') && !input.getAttribute('aria-label')?.trim()
          && !input.getAttribute('aria-labelledby') && !input.getAttribute('title')?.trim();
      }));
      const tabindexPositive = group('tabindex-positive', all('[tabindex]').filter(el => parseInt(el.getAttribute('tabindex') || '0', 10) > 0));
      const ariaRoles = new Set(all('[role]').map(el => el.getAttribute('role') || '').filter(Boolean));

      const contrast = auditContrast(roots, register);
      if (contrast.failAA.length > 0) groups['contrast-aa'] = contrast.failAA.map(f => f.id);
      if (contrast.manual.length > 0) groups['contrast-manual'] = contrast.manual.map(m => m.id);

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
        groups,
        contrast,
      };
    }

    /** Measure every visible text element against its effective background. */
    function auditContrast(roots: Array<Document | ShadowRoot>, register: (el: Element) => number): AccessibilityData['contrast'] {
      const layerCache = new Map<Element, BackgroundLayer>();
      const layerOf = (el: Element): BackgroundLayer => {
        let layer = layerCache.get(el);
        if (!layer) {
          const cs = window.getComputedStyle(el);
          const opacity = parseFloat(cs.opacity);
          layer = { color: parseColor(cs.backgroundColor), image: cs.backgroundImage !== 'none', opacity: Number.isFinite(opacity) ? opacity : 1 };
          layerCache.set(el, layer);
        }
        return layer;
      };

      const elements: Element[] = [];
      const samples: TextSample[] = [];
      const seen = new Set<Element>();
      let truncated = false;
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node && !truncated; node = walker.nextNode()) {
          const el = node.parentElement;
          const text = node.nodeValue?.trim();
          if (!el || !text || seen.has(el)) continue;
          seen.add(el);
          if (SKIP_TEXT_PARENTS.has(el.tagName) || el.closest(':disabled, [aria-disabled="true"]')) continue;
          const cs = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (rect.width <= 1 || rect.height <= 1 || cs.visibility !== 'visible') continue;
          if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true })) continue;
          if (samples.length >= MAX_TEXT_ELEMENTS) {
            truncated = true;
            break;
          }
          const layers: BackgroundLayer[] = [];
          for (let a: Element | null = el; a; a = flatParent(a)) layers.push(layerOf(a));
          samples.push({
            id: elements.push(el) - 1,
            text: textPreview(text, 60),
            selector: formatPath(pathOf(el), 3),
            color: parseColor(cs.getPropertyValue('-webkit-text-fill-color') || cs.color) ?? { r: 0, g: 0, b: 0, a: 1 },
            layers,
            fontSizePx: parsePx(cs.fontSize),
            fontWeight: parseInt(cs.fontWeight, 10) || 400,
          });
        }
      }

      const rootScheme = window.getComputedStyle(document.documentElement).colorScheme;
      const darkCanvas = /\bdark\b/.test(rootScheme) && (!/\blight\b/.test(rootScheme) || window.matchMedia('(prefers-color-scheme: dark)').matches);
      const canvas: RGBA = darkCanvas ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
      const audit = auditTextContrast(samples, canvas);
      const toRegistry = <T extends { id: number }>(items: T[]): T[] => items.map(item => ({ ...item, id: register(elements[item.id]!) }));
      return {
        checked: audit.checked,
        failAA: toRegistry(audit.failAA),
        failAAAOnly: toRegistry(audit.failAAAOnly),
        manual: toRegistry(audit.manual),
        truncated,
      };
    }

    function highlight(ids: number[]): number {
      clearHighlights();
      highlighted = ids.map(id => auditTargets[id]).filter((el): el is Element => Boolean(el?.isConnected)).slice(0, 50);
      if (highlighted.length === 0) return 0;
      attachUi();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      highlighted[0]!.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      window.addEventListener('scroll', drawHighlights, { capture: true, passive: true });
      window.addEventListener('resize', drawHighlights, { passive: true });
      window.addEventListener('keydown', onHighlightKey, true);
      highlightFrames = 0;
      followHighlights();
      highlightTimer = window.setTimeout(clearHighlights, 8000);
      return highlighted.length;
    }

    /** Keep the boxes on their elements through a smooth scroll. */
    function followHighlights() {
      drawHighlights();
      if (highlighted.length > 0 && ++highlightFrames < 60) window.requestAnimationFrame(followHighlights);
    }

    function drawHighlights() {
      if (!ui) return;
      const container = ui.highlights;
      if (container.childElementCount !== highlighted.length) {
        const numbered = highlighted.length > 1;
        container.replaceChildren(...highlighted.map((_, i) => {
          const box = document.createElement('div');
          box.className = 'hl';
          if (numbered) {
            const label = document.createElement('span');
            label.className = 'hl-label';
            label.textContent = String(i + 1);
            box.append(label);
          }
          return box;
        }));
      }
      // Boxes are created once per request and only moved while the page scrolls.
      highlighted.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const box = container.children[i] as HTMLElement;
        box.style.transform = `translate(${r.left - 3}px, ${r.top - 3}px)`;
        box.style.width = `${r.width + 6}px`;
        box.style.height = `${r.height + 6}px`;
      });
    }

    function onHighlightKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clearHighlights();
    }

    function clearHighlights() {
      window.clearTimeout(highlightTimer);
      window.removeEventListener('scroll', drawHighlights, true);
      window.removeEventListener('resize', drawHighlights);
      window.removeEventListener('keydown', onHighlightKey, true);
      const had = highlighted.length > 0;
      highlighted = [];
      ui?.highlights.replaceChildren();
      if (had && activeTool === null) detachUi();
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
            if (message.hint && renderHere) flashHint(message.hint, 6000);
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
        case 'dtp:capture-page':
          if (isTop) {
            void capturePageAction();
            sendResponse({ ok: true } satisfies InspectorReply);
          }
          return false;
        case 'dtp:highlight':
          if (isTop) sendResponse({ ok: true, found: highlight(message.ids) } satisfies InspectorReply);
          return false;
        default:
          return false;
      }
    }

    browser.runtime.onMessage.addListener(onRuntimeMessage);
    browser.storage.onChanged.addListener(onStorageChanged);
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
        clearHighlights();
        deactivate();
        window.removeEventListener('message', onWindowMessage);
        try {
          browser.runtime.onMessage.removeListener(onRuntimeMessage);
          browser.storage.onChanged.removeListener(onStorageChanged);
        } catch {
          // orphaned runtime
        }
      },
    };
  },
});
