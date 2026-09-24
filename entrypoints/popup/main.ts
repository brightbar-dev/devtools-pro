import { TOOLS, getTool, type Tool } from '@/utils/tools';
import { toolIcon } from '@/utils/icons';
import { gridLayout, moveFocus } from '@/utils/grid-nav';
import { analyzeHeadings, analyzeIssues, computeStats, sortIssues, issueIcon, type AccessibilityData, type WcagRef } from '@/utils/accessibility';
import type { ContrastFinding, ManualContrastCheck } from '@/utils/contrast';
import { isColorValue } from '@/utils/css-vars';
import { escapeHtml } from '@/utils/dom';
import { restrictionForError, restrictionForUrl, type Restriction, type RestrictionContext } from '@/utils/restrictions';
import type { CollectKind, InspectorMessage, InspectorReply } from '@/utils/messages';
import { dataUrlBytes, screenshotFilename } from '@/utils/capture';
import { recordToolUse, showReviewNudge } from '@/utils/review-nudge';

/** The inspector bundle, injected on demand; it is not a manifest content script. */
const INSPECTOR_FILE = '/content-scripts/content.js';

const toolsGrid = document.getElementById('tools-grid')!;
const pageNotice = document.getElementById('page-notice')!;
const metaPanel = document.getElementById('meta-panel')!;
const metaContent = document.getElementById('meta-content')!;
const metaTitle = document.getElementById('meta-title')!;
const metaBack = document.getElementById('meta-back')!;
const optionsLink = document.getElementById('options-link')!;
const toolDescription = document.getElementById('tool-description')!;
const DESCRIPTION_HINT = 'Hover or focus a tool to see what it does · arrow keys move';
const layout = gridLayout(TOOLS.length, 3, new Set(TOOLS.flatMap((t, i) => (t.id === 'live-edit' ? [i] : []))));

let activeTool: string | null = null;
/** The tab a popup panel was built for; highlight requests go there. */
let panelTabId: number | null = null;
let restrictionCtx: RestrictionContext = { browserName: 'Chrome', isFirefox: import.meta.env.FIREFOX };

async function init() {
  try {
    const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
    applyTheme(settings?.theme || 'auto');
  } catch (err) {
    console.warn('Failed to load settings, using defaults:', err);
    applyTheme('auto');
  }
  renderTools();
  setupListeners();
  document.getElementById('version')!.textContent = `v${browser.runtime.getManifest().version}`;
  toolDescription.textContent = DESCRIPTION_HINT;

  restrictionCtx = { browserName: browserName(), isFirefox: import.meta.env.FIREFOX, fileAccessAllowed: await fileAccessAllowed() };
  const tab = await activeTab().catch(() => null);
  if (!tab) return;
  const restriction = restrictionForUrl(tab.url, restrictionCtx) ?? (tab.url ? null : await probeAccess(tab.id));
  if (restriction) {
    pageNotice.textContent = restriction.message;
    pageNotice.hidden = false;
  } else {
    await refreshActiveTool(tab.id);
  }
  // Arrow keys work straight away: focus the active tool, or the first.
  const start = toolsGrid.querySelector<HTMLButtonElement>('.dtp-tool-btn.dtp-active') ?? toolsGrid.querySelector<HTMLButtonElement>('.dtp-tool-btn');
  if (toolsGrid.style.display !== 'none') start?.focus();
  // The review request waits for a popup opened between tasks, never while a hover tool is running.
  if (activeTool === null) await showReviewNudge(document.getElementById('review-nudge')!);
}

/** The browser withholds the URL of pages we may not touch; a no-op injection tells us why. */
async function probeAccess(tabId: number): Promise<Restriction | null> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, func: () => true });
    return null;
  } catch (err) {
    return restrictionForError(err, restrictionCtx);
  }
}

function browserName(): string {
  if (import.meta.env.FIREFOX) return 'Firefox';
  const brands = (navigator as Navigator & { userAgentData?: { brands: Array<{ brand: string }> } }).userAgentData?.brands ?? [];
  return ['Microsoft Edge', 'Brave', 'Opera'].find(name => brands.some(b => b.brand === name)) ?? 'Chrome';
}

async function fileAccessAllowed(): Promise<boolean | undefined> {
  try {
    return await browser.extension.isAllowedFileSchemeAccess();
  } catch {
    return undefined;
  }
}

function applyTheme(theme: string) {
  if (theme === 'auto') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dtp-dark', dark);
  } else {
    document.body.classList.toggle('dtp-dark', theme === 'dark');
  }
}

function renderTools() {
  toolsGrid.innerHTML = TOOLS.map(tool => `<button type="button" class="dtp-tool-btn" data-tool="${tool.id}" aria-describedby="desc-${tool.id}" aria-pressed="false">
      <span class="dtp-tool-icon">${toolIcon(tool.id)}</span>
      <span class="dtp-tool-name">${escapeHtml(tool.name)}</span>
      <span class="dtp-visually-hidden" id="desc-${tool.id}">${escapeHtml(tool.description)}</span>
    </button>`).join('');
}

function describeTool(button: HTMLElement | null) {
  const tool = button?.dataset.tool ? TOOLS.find(t => t.id === button.dataset.tool) : undefined;
  toolDescription.textContent = tool ? `${tool.name}: ${tool.description}` : DESCRIPTION_HINT;
}

function showPanel(title: string, html: string) {
  toolsGrid.style.display = 'none';
  toolDescription.hidden = true;
  pageNotice.hidden = true;
  metaPanel.style.display = 'block';
  metaTitle.textContent = title;
  metaContent.innerHTML = html;
}

function showError(msg: string, title = 'Error') {
  showPanel(title, `<div class="dtp-empty dtp-error">${escapeHtml(msg)}</div>`);
}

function setupListeners() {
  toolsGrid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.dtp-tool-btn') as HTMLElement | null;
    if (btn?.dataset.tool) void onToolClick(btn.dataset.tool);
  });

  toolsGrid.addEventListener('keydown', (e) => {
    const buttons = [...toolsGrid.querySelectorAll<HTMLButtonElement>('.dtp-tool-btn')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next = moveFocus(layout, index, e.key);
    if (next !== index) {
      e.preventDefault();
      buttons[next]?.focus();
    }
  });
  toolsGrid.addEventListener('focusin', e => describeTool((e.target as HTMLElement).closest('.dtp-tool-btn')));
  toolsGrid.addEventListener('mouseover', e => describeTool((e.target as HTMLElement).closest('.dtp-tool-btn')));
  toolsGrid.addEventListener('mouseleave', () => describeTool(toolsGrid.querySelector(':focus')));

  metaBack.addEventListener('click', () => {
    metaPanel.style.display = 'none';
    toolDescription.hidden = false;
    toolsGrid.style.display = '';
    pageNotice.hidden = !pageNotice.textContent;
  });

  // One delegated copy handler for every popup panel.
  metaContent.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const shotBtn = target.closest<HTMLElement>('[data-shot]');
    if (shotBtn?.dataset.shot) {
      void runScreenshot(shotBtn.dataset.shot);
      return;
    }
    const highlightBtn = target.closest<HTMLElement>('[data-highlight]');
    if (highlightBtn && panelTabId !== null) {
      const ids = (highlightBtn.dataset.highlight ?? '').split(',').map(Number).filter(Number.isInteger);
      void browser.tabs.sendMessage(panelTabId, { action: 'dtp:highlight', ids } satisfies InspectorMessage, { frameId: 0 }).catch(() => {});
      return;
    }
    const row = target.closest('[data-copy]');
    if (!row) return;
    navigator.clipboard.writeText(row.getAttribute('data-copy') || '').catch(() => {});
    row.classList.add('dtp-copied');
    setTimeout(() => row.classList.remove('dtp-copied'), 800);
  });

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage().catch((err) => {
      console.error('Failed to open options page:', err);
      void browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
    });
  });
}

async function activeTab(): Promise<{ id: number; url?: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab found');
  return { id: tab.id, url: tab.url };
}

async function refreshActiveTool(tabId: number) {
  try {
    const reply = await browser.tabs.sendMessage(tabId, { action: 'dtp:state' } satisfies InspectorMessage, { frameId: 0 }) as InspectorReply | undefined;
    activeTool = reply?.activeTool ?? null;
  } catch {
    activeTool = null; // nothing injected on this page yet
  }
  updateActiveState();
}

async function onToolClick(toolId: string) {
  let tool: Tool;
  try {
    tool = getTool(toolId);
  } catch (err) {
    showError((err as Error).message);
    return;
  }

  if (tool.kind === 'capture') {
    showScreenshotPanel();
    return;
  }

  try {
    const tab = await activeTab();
    const restriction = restrictionForUrl(tab.url, restrictionCtx);
    if (restriction) {
      showError(restriction.message, 'Not available here');
      return;
    }
    if (tool.kind === 'page') {
      await showPageTool(tool, tab.id);
    } else if (activeTool === tool.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'dtp:deactivate' } satisfies InspectorMessage).catch(() => {});
      activeTool = null;
      updateActiveState();
    } else {
      await startHoverTool(tool, tab.id);
      window.close(); // get out of the way so the page can be hovered
    }
  } catch (err) {
    console.error(`Tool "${toolId}" failed:`, err);
    showError(restrictionForError(err, restrictionCtx).message, 'Not available here');
  }
}

/** Inject the inspector (into every frame for hover tools) and return the frames that accepted it. */
async function inject(tabId: number, allFrames: boolean): Promise<number[]> {
  const results = await browser.scripting.executeScript({ target: { tabId, allFrames }, files: [INSPECTOR_FILE] });
  return results.map(r => r.frameId);
}

async function startHoverTool(tool: Tool, tabId: number, hint?: string) {
  const frameIds = await inject(tabId, true);
  const message: InspectorMessage = { action: 'dtp:activate', toolId: tool.id, hint };
  const replies = await Promise.all(frameIds.map(frameId =>
    browser.tabs.sendMessage(tabId, message, { frameId })
      .then(reply => ({ frameId, reply: reply as InspectorReply | undefined, error: undefined as unknown }))
      .catch((error: unknown) => ({ frameId, reply: undefined, error }))));
  const top = replies.find(r => r.frameId === 0);
  if (!top?.reply?.ok) {
    if (top?.error) throw top.error;
    throw new Error(top?.reply?.error ?? 'The inspector did not start on this page');
  }
  activeTool = tool.id;
  updateActiveState();
  await recordToolUse(); // before the popup closes itself
}

async function collect<T>(tabId: number, what: CollectKind): Promise<T> {
  await inject(tabId, false);
  const reply = await browser.tabs.sendMessage(tabId, { action: 'dtp:collect', what } satisfies InspectorMessage, { frameId: 0 });
  if (reply === undefined) throw new Error('The page did not answer');
  return reply as T;
}

async function showPageTool(tool: Tool, tabId: number) {
  panelTabId = tabId;
  switch (tool.id) {
    case 'meta-tags': await showMetaPanel(tabId); break;
    case 'css-vars': await showCssVarsPanel(tabId); break;
    case 'accessibility': await showAccessibilityPanel(tabId); break;
    case 'assets': await showAssetsPanel(tabId); break;
    default: throw new Error(`Tool id "${tool.id}" has no popup panel`);
  }
  await recordToolUse();
}

function updateActiveState() {
  toolsGrid.querySelectorAll('.dtp-tool-btn').forEach(btn => {
    const el = btn as HTMLElement;
    el.classList.toggle('dtp-active', el.dataset.tool === activeTool);
    el.setAttribute('aria-pressed', String(el.dataset.tool === activeTool));
  });
}

async function showMetaPanel(tabId: number) {
  showPanel('Page Meta', '<div class="dtp-loading">Loading...</div>');
  const tags = await collect<Array<{ name: string; content: string; type: string }>>(tabId, 'meta');
  if (!Array.isArray(tags) || tags.length === 0) {
    metaContent.innerHTML = '<div class="dtp-empty">No meta tags found</div>';
    return;
  }

  const grouped: Record<string, Array<{ name: string; content: string }>> = {};
  for (const tag of tags) {
    const type = tag.type || 'other';
    (grouped[type] ??= []).push(tag);
  }

  let html = '';
  for (const [type, items] of Object.entries(grouped)) {
    const label = type === 'og' ? 'Open Graph' : type === 'twitter' ? 'Twitter Cards' : type === 'meta' ? 'Standard' : 'Other';
    html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">${label}</div>`;
    for (const item of items) {
      html += `<div class="dtp-meta-row dtp-copyable" data-copy="${escapeHtml(item.content)}"><span class="dtp-meta-key">${escapeHtml(item.name)}</span><span class="dtp-meta-val">${escapeHtml(item.content)}</span></div>`;
    }
    html += '</div>';
  }
  metaContent.innerHTML = html;
}

async function showCssVarsPanel(tabId: number) {
  showPanel('CSS Variables', '<div class="dtp-loading">Scanning...</div>');
  const result = await collect<{ vars: Array<{ name: string; value: string; scope: string }>; sheetsTotal: number; sheetsSkipped: number }>(tabId, 'css-vars');
  const vars = result?.vars ?? [];
  const sheetsSkipped = result?.sheetsSkipped ?? 0;
  const sheetsTotal = result?.sheetsTotal ?? 0;
  const skippedNote = `${sheetsSkipped} of ${sheetsTotal} stylesheet${sheetsTotal !== 1 ? 's' : ''}`;

  if (vars.length === 0) {
    let msg = 'No CSS variables found on this page.';
    if (sheetsSkipped > 0) {
      msg += `<p class="dtp-note">${skippedNote} could not be read (cross-origin). Variables in CDN-hosted CSS are blocked by browser security restrictions.</p>`;
    }
    metaContent.innerHTML = `<div class="dtp-empty">${msg}</div>`;
    return;
  }

  let html = `<div class="dtp-stats-bar">${vars.length} variable${vars.length !== 1 ? 's' : ''} found`;
  if (sheetsSkipped > 0) html += `<div class="dtp-note">${skippedNote} skipped (cross-origin)</div>`;
  html += '</div>';

  const scopeMap = new Map<string, typeof vars>();
  for (const v of vars) {
    const existing = scopeMap.get(v.scope) || [];
    existing.push(v);
    scopeMap.set(v.scope, existing);
  }
  const sortedScopes = [...scopeMap.entries()].sort(([a], [b]) => {
    if (a.startsWith(':root')) return -1;
    if (b.startsWith(':root')) return 1;
    return a.localeCompare(b);
  });

  for (const [scope, scopeVars] of sortedScopes) {
    html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">${escapeHtml(scope)} (${scopeVars.length})</div>`;
    for (const v of scopeVars) {
      const swatch = isColorValue(v.value) ? `<span class="dtp-swatch" style="background:${escapeHtml(v.value)}"></span>` : '';
      html += `<div class="dtp-meta-row dtp-copyable" data-copy="${escapeHtml(v.name)}: ${escapeHtml(v.value)}">
        <span class="dtp-meta-key">${escapeHtml(v.name)}</span>
        <span class="dtp-meta-val">${swatch}${escapeHtml(v.value)}</span>
      </div>`;
    }
    html += '</div>';
  }
  metaContent.innerHTML = html;
}

async function showAccessibilityPanel(tabId: number) {
  showPanel('Accessibility', '<div class="dtp-loading">Analyzing...</div>');
  const data = await collect<AccessibilityData>(tabId, 'accessibility');
  const { contrast } = data;

  const headings = analyzeHeadings(data.headings || []);
  const issues = analyzeIssues({
    imagesWithoutAlt: data.imagesWithoutAlt,
    imagesTotal: data.imagesTotal,
    headings,
    hasMainLandmark: data.hasMainLandmark,
    hasNavLandmark: data.hasNavLandmark,
    hasSkipLink: data.hasSkipLink,
    linksWithoutText: data.linksWithoutText,
    buttonsWithoutText: data.buttonsWithoutText,
    formInputsWithoutLabel: data.formInputsWithoutLabel,
    tabindexPositive: data.tabindexPositive,
    contrastIssues: contrast.failAA.length,
    contrastAAAOnly: contrast.failAAAOnly.length,
    contrastManual: contrast.manual.length,
    contrastChecked: contrast.checked,
    htmlLang: data.htmlLang,
    titleText: data.titleText,
  });

  const stats = computeStats(issues);
  const sorted = sortIssues(issues);

  let html = `<div class="dtp-a11y-stats">
    <span class="dtp-a11y-stat dtp-a11y-error">${stats.errors} error${stats.errors !== 1 ? 's' : ''}</span>
    <span class="dtp-a11y-stat dtp-a11y-warning">${stats.warnings} warning${stats.warnings !== 1 ? 's' : ''}</span>
    <span class="dtp-a11y-stat dtp-a11y-info">${stats.info} info</span>
  </div>`;

  html += '<div class="dtp-a11y-issues">';
  for (const issue of sorted) {
    const ids = issue.group ? data.groups[issue.group] ?? [] : [];
    const highlight = ids.length > 0 ? highlightButton(ids, ids.length === 1 ? 'Highlight' : `Highlight ${Math.min(ids.length, 50)}`) : '';
    html += `<div class="dtp-a11y-issue dtp-a11y-${issue.type}">
      <span class="dtp-a11y-icon" aria-hidden="true">${issueIcon(issue.type)}</span>
      <div class="dtp-a11y-body">
        <span class="dtp-a11y-cat">${escapeHtml(issue.category)}</span>
        <span class="dtp-a11y-msg">${escapeHtml(issue.message)}</span>
        ${issue.details ? `<span class="dtp-a11y-details">${escapeHtml(issue.details)}</span>` : ''}
        <span class="dtp-a11y-actions">${wcagLink(issue.wcag)}${highlight}</span>
      </div>
    </div>`;
  }
  html += '</div>';

  html += contrastSection(contrast);

  if (headings.length > 0) {
    html += '<div class="dtp-meta-group"><div class="dtp-meta-group-name">Heading Structure</div>';
    for (const h of headings) {
      const indent = (h.level - 1) * 12;
      const cls = h.outOfOrder ? ' dtp-a11y-warn-text' : '';
      html += `<div class="dtp-meta-row${cls}" style="padding-left:${indent}px">
        <span class="dtp-meta-key">h${h.level}</span>
        <span class="dtp-meta-val">${escapeHtml(h.text)}</span>
      </div>`;
    }
    html += '</div>';
  }

  if (data.ariaRolesUsed.length > 0) {
    html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">ARIA Roles (${data.ariaRolesUsed.length})</div>`;
    html += `<div class="dtp-a11y-tags">${data.ariaRolesUsed.map(r => `<span class="dtp-a11y-tag">${escapeHtml(r)}</span>`).join('')}</div>`;
    html += '</div>';
  }

  metaContent.innerHTML = html;
}

function wcagLink(ref: WcagRef | undefined): string {
  if (!ref) return '';
  const label = `WCAG ${ref.id} ${ref.bestPractice ? '· best practice' : ref.level}`;
  return `<a class="dtp-wcag" href="${escapeHtml(ref.url)}" target="_blank" rel="noopener" title="${escapeHtml(`${ref.id} ${ref.name}`)}">${escapeHtml(label)}</a>`;
}

function highlightButton(ids: number[], label: string): string {
  return `<button type="button" class="dtp-highlight-btn" data-highlight="${ids.slice(0, 50).join(',')}">${escapeHtml(label)}</button>`;
}

function contrastRow(f: ContrastFinding): string {
  return `<div class="dtp-contrast-row">
    <span class="dtp-contrast-sample" style="color:${escapeHtml(f.fg)};background:${escapeHtml(f.bg)}" aria-hidden="true">Aa</span>
    <div class="dtp-contrast-body">
      <span class="dtp-contrast-ratio"><strong>${f.ratio.toFixed(2)}:1</strong> · needs ${f.required}:1${f.large ? ' (large text)' : ''}</span>
      <span class="dtp-contrast-text">${escapeHtml(f.text)}</span>
      <span class="dtp-contrast-sel">${escapeHtml(f.fg)} on ${escapeHtml(f.bg)} · ${escapeHtml(f.selector)}</span>
    </div>
    ${highlightButton([f.id], 'Highlight')}
  </div>`;
}

function manualRow(m: ManualContrastCheck): string {
  return `<div class="dtp-contrast-row">
    <div class="dtp-contrast-body">
      <span class="dtp-contrast-text">${escapeHtml(m.text)}</span>
      <span class="dtp-contrast-sel">${escapeHtml(m.selector)}</span>
    </div>
    ${highlightButton([m.id], 'Highlight')}
  </div>`;
}

function contrastSection(c: AccessibilityData['contrast']): string {
  const LIMIT = 50;
  const more = (n: number) => (n > LIMIT ? `<div class="dtp-note">and ${n - LIMIT} more</div>` : '');
  let html = `<div class="dtp-meta-group"><div class="dtp-meta-group-name">Text contrast · ${c.checked} measured${c.truncated ? ' (first 4000 elements)' : ''}</div>`;
  html += c.failAA.length === 0
    ? '<div class="dtp-note">No measured text is below WCAG AA.</div>'
    : c.failAA.slice(0, LIMIT).map(contrastRow).join('') + more(c.failAA.length);
  if (c.manual.length > 0) {
    html += `<details class="dtp-details" open><summary>${c.manual.length} on images or gradients — check by eye</summary>`
      + c.manual.slice(0, LIMIT).map(manualRow).join('') + more(c.manual.length) + '</details>';
  }
  if (c.failAAAOnly.length > 0) {
    html += `<details class="dtp-details"><summary>${c.failAAAOnly.length} pass AA but not AAA</summary>`
      + c.failAAAOnly.slice(0, LIMIT).map(contrastRow).join('') + more(c.failAAAOnly.length) + '</details>';
  }
  return html + '</div>';
}

async function showAssetsPanel(tabId: number) {
  showPanel('Page Assets', '<div class="dtp-loading">Scanning...</div>');
  const data = await collect<{ images: number; scripts: number; stylesheets: number; fonts: string[] }>(tabId, 'assets');

  let html = '<div class="dtp-stats-bar">';
  html += `<span>${data.images} images</span>`;
  html += `<span>${data.scripts} scripts</span>`;
  html += `<span>${data.stylesheets} stylesheets</span>`;
  html += `<span>${data.fonts.length} fonts</span>`;
  html += '</div>';

  if (data.fonts.length > 0) {
    html += '<div class="dtp-meta-group"><div class="dtp-meta-group-name">Fonts Used</div>';
    for (const font of data.fonts) {
      html += `<div class="dtp-meta-row dtp-copyable" data-copy="${escapeHtml(font)}">
        <span class="dtp-meta-val" style="font-family:'${escapeHtml(font)}',sans-serif">${escapeHtml(font)}</span>
      </div>`;
    }
    html += '</div>';
  }

  html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">Summary</div>
    <div class="dtp-meta-row"><span class="dtp-meta-key">Images</span><span class="dtp-meta-val">${data.images} (img, picture, svg)</span></div>
    <div class="dtp-meta-row"><span class="dtp-meta-key">Scripts</span><span class="dtp-meta-val">${data.scripts} external</span></div>
    <div class="dtp-meta-row"><span class="dtp-meta-key">Stylesheets</span><span class="dtp-meta-val">${data.stylesheets} linked</span></div>
  </div>`;

  metaContent.innerHTML = html;
}

function showScreenshotPanel() {
  showPanel('Screenshot', `<div class="dtp-shot-options">
    <button type="button" class="dtp-shot-btn" data-shot="visible"><strong>Visible area</strong><span>What is on screen now</span></button>
    <button type="button" class="dtp-shot-btn" data-shot="page"><strong>Full page</strong><span>Scrolls and stitches the whole page</span></button>
    <button type="button" class="dtp-shot-btn" data-shot="element"><strong>One element</strong><span>Hover it on the page, then press S</span></button>
  </div>
  <p class="dtp-note">Saved as PNG and copied to the clipboard.</p>`);
}

async function runScreenshot(kind: string) {
  try {
    const tab = await activeTab();
    const restriction = restrictionForUrl(tab.url, restrictionCtx);
    if (restriction) {
      showError(restriction.message, 'Screenshot');
      return;
    }
    if (kind === 'visible') {
      await captureVisible(tab.url);
    } else if (kind === 'page') {
      await inject(tab.id, false);
      await browser.tabs.sendMessage(tab.id, { action: 'dtp:capture-page' } satisfies InspectorMessage, { frameId: 0 });
      await recordToolUse();
      window.close(); // the page does the scrolling and saving
    } else if (kind === 'element') {
      await startHoverTool(getTool('element-info'), tab.id, 'Hover an element and press S to capture it');
      window.close();
    }
  } catch (err) {
    showError(restrictionForError(err, restrictionCtx).message, 'Screenshot');
  }
}

async function captureVisible(tabUrl: string | undefined) {
  showPanel('Screenshot', '<div class="dtp-loading">Capturing...</div>');
  const result = await browser.runtime.sendMessage({ action: 'captureTab' }).catch((err: unknown) => ({ error: String((err as Error)?.message ?? err) }));
  if (typeof result !== 'string') {
    const reason = (result as { error?: string } | undefined)?.error ?? 'No screenshot captured';
    showError(restrictionForError(new Error(reason), restrictionCtx).message, 'Screenshot');
    return;
  }

  let host = '';
  try {
    host = new URL(tabUrl ?? '').hostname;
  } catch {
    host = '';
  }
  const name = screenshotFilename('visible', host, new Date());
  const a = document.createElement('a');
  a.href = result;
  a.download = name;
  a.click();

  let copied = false;
  try {
    const { mime, bytes } = dataUrlBytes(result);
    await navigator.clipboard.write([new ClipboardItem({ [mime]: new Blob([bytes], { type: mime }) })]);
    copied = true;
  } catch {
    copied = false;
  }

  metaContent.innerHTML = `<div class="dtp-screenshot-preview">
    <img src="${result}" alt="Screenshot of the visible page" style="width:100%;border-radius:4px;margin:8px 0;">
    <div class="dtp-empty">Saved ${escapeHtml(name)}${copied ? ' and copied to the clipboard' : ''}</div>
  </div>`;
  await recordToolUse();
}

init().catch(err => console.error('Popup init failed:', err));
