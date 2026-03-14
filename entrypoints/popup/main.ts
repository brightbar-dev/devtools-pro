import { TOOLS, isProTool } from '@/utils/tools';
import { analyzeHeadings, analyzeIssues, computeStats, sortIssues, issueIcon } from '@/utils/accessibility';
import { isColorValue } from '@/utils/css-vars';
import { resolveProStatus, PRICE_DISPLAY, TRIAL_DAYS, type PaymentUser } from '@/utils/payment';

const toolsGrid = document.getElementById('tools-grid')!;
const metaPanel = document.getElementById('meta-panel')!;
const metaContent = document.getElementById('meta-content')!;
const metaTitle = document.getElementById('meta-title')!;
const metaBack = document.getElementById('meta-back')!;
const optionsLink = document.getElementById('options-link')!;

let activeTool: string | null = null;

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
  toolsGrid.innerHTML = TOOLS.map(tool => {
    const proClass = tool.tier === 'pro' ? ' dtp-pro' : '';
    const proBadge = tool.tier === 'pro' ? '<span class="dtp-pro-badge">PRO</span>' : '';
    return `<button class="dtp-tool-btn${proClass}" data-tool="${tool.id}" title="${tool.description}">
      <span class="dtp-tool-icon">${tool.icon}</span>
      <span class="dtp-tool-name">${tool.name}</span>
      ${proBadge}
    </button>`;
  }).join('');
}

function showError(msg: string) {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'Error';
  metaContent.innerHTML = `<div class="dtp-empty" style="color:var(--dtp-fail)">${escapeHtml(msg)}</div>`;
}

function showStatus(title: string, msg: string) {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = title;
  metaContent.innerHTML = `<div class="dtp-empty">${escapeHtml(msg)}</div>`;
}

function setupListeners() {
  toolsGrid.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.dtp-tool-btn') as HTMLElement;
    if (!btn) return;

    const toolId = btn.dataset.tool!;

    try {
      // Check pro status for pro tools
      if (isProTool(toolId)) {
        try {
          const user: PaymentUser = await browser.runtime.sendMessage({ action: 'getProStatus' });
          const status = resolveProStatus(user);
          if (!status.unlocked) {
            showProUpsell(!!user.trialStartedAt);
            return;
          }
        } catch {
          // ExtPay unavailable — show upsell with trial option
          showProUpsell(false);
          return;
        }
      }

      // Popup-based tools (show data in popup panel, not content overlay)
      if (toolId === 'meta-tags') { showMetaPanel(); return; }
      if (toolId === 'css-vars') { showCssVarsPanel(); return; }
      if (toolId === 'accessibility') { showAccessibilityPanel(); return; }
      if (toolId === 'assets') { showAssetsPanel(); return; }
      if (toolId === 'screenshot') { captureScreenshot(); return; }

      // Toggle active state for overlay-based tools
      if (activeTool === toolId) {
        deactivateTool();
      } else {
        activateTool(toolId);
      }
    } catch (err) {
      console.error('Tool click failed:', err);
      showError(`Tool "${toolId}" failed: ${(err as Error).message || 'Unknown error'}`);
    }
  });

  metaBack.addEventListener('click', () => {
    metaPanel.style.display = 'none';
    toolsGrid.style.display = '';
  });

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

async function activateTool(toolId: string) {
  activeTool = toolId;
  updateActiveState();

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus(toolId, 'No active tab found');
      return;
    }
    await browser.tabs.sendMessage(tab.id, { action: 'activateTool', toolId });
    // Show feedback — tool is active on the page
    showStatus('Active', 'Hover over elements on the page to inspect. Press Escape to deactivate.');
  } catch {
    // Content script not injected — try programmatic injection
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js'],
        });
        await browser.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content-scripts/content.css'],
        });
        // Retry the activation
        await browser.tabs.sendMessage(tab.id, { action: 'activateTool', toolId });
        showStatus('Active', 'Hover over elements on the page to inspect. Press Escape to deactivate.');
      }
    } catch (err) {
      console.error('Failed to inject content script:', err);
      showError('Cannot inspect this page. Try refreshing the page first.');
    }
  }
}

async function deactivateTool() {
  activeTool = null;
  updateActiveState();

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'deactivate' });
    }
  } catch {
    // Content script not available — that's OK, just reset local state
  }
}

function updateActiveState() {
  toolsGrid.querySelectorAll('.dtp-tool-btn').forEach(btn => {
    const el = btn as HTMLElement;
    el.classList.toggle('dtp-active', el.dataset.tool === activeTool);
  });
}

async function showMetaPanel() {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'Page Meta';
  metaContent.innerHTML = '<div class="dtp-loading">Loading...</div>';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      metaContent.innerHTML = '<div class="dtp-empty">No active tab</div>';
      return;
    }

    const tags = await browser.tabs.sendMessage(tab.id, { action: 'getMetaTags' });
    if (!tags || !Array.isArray(tags)) {
      metaContent.innerHTML = '<div class="dtp-empty">No meta tags found</div>';
      return;
    }

    const grouped: Record<string, Array<{ name: string; content: string }>> = {};
    for (const tag of tags) {
      const type = tag.type || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(tag);
    }

    let html = '';
    for (const [type, items] of Object.entries(grouped)) {
      const label = type === 'og' ? 'Open Graph' : type === 'twitter' ? 'Twitter Cards' : type === 'meta' ? 'Standard' : 'Other';
      html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">${label}</div>`;
      for (const item of items) {
        html += `<div class="dtp-meta-row"><span class="dtp-meta-key">${escapeHtml(item.name)}</span><span class="dtp-meta-val">${escapeHtml(item.content)}</span></div>`;
      }
      html += '</div>';
    }
    metaContent.innerHTML = html;
  } catch {
    metaContent.innerHTML = '<div class="dtp-empty">Cannot access this page — try refreshing</div>';
  }
}

async function showCssVarsPanel() {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'CSS Variables';
  metaContent.innerHTML = '<div class="dtp-loading">Scanning...</div>';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const vars = await browser.tabs.sendMessage(tab.id, { action: 'getCssVariables' });
    if (!vars || !Array.isArray(vars) || vars.length === 0) {
      metaContent.innerHTML = '<div class="dtp-empty">No CSS variables found on this page</div>';
      return;
    }

    let html = `<div class="dtp-stats-bar">${vars.length} variable${vars.length !== 1 ? 's' : ''} found</div>`;

    // Group by scope
    const scopeMap = new Map<string, typeof vars>();
    for (const v of vars) {
      const existing = scopeMap.get(v.scope) || [];
      existing.push(v);
      scopeMap.set(v.scope, existing);
    }

    // Sort: :root first
    const sortedScopes = [...scopeMap.entries()].sort(([a], [b]) => {
      if (a.startsWith(':root')) return -1;
      if (b.startsWith(':root')) return 1;
      return a.localeCompare(b);
    });

    for (const [scope, scopeVars] of sortedScopes) {
      html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">${escapeHtml(scope)} (${scopeVars.length})</div>`;
      for (const v of scopeVars) {
        const swatch = isColorValue(v.value) ? `<span class="dtp-swatch" style="background:${v.value}"></span>` : '';
        html += `<div class="dtp-meta-row dtp-copyable" data-copy="${escapeHtml(v.name)}: ${escapeHtml(v.value)}">
          <span class="dtp-meta-key">${escapeHtml(v.name)}</span>
          <span class="dtp-meta-val">${swatch}${escapeHtml(v.value)}</span>
        </div>`;
      }
      html += '</div>';
    }
    metaContent.innerHTML = html;

    // Copy on click
    metaContent.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('[data-copy]');
      if (row) {
        navigator.clipboard.writeText(row.getAttribute('data-copy') || '').catch(() => {});
        row.classList.add('dtp-copied');
        setTimeout(() => row.classList.remove('dtp-copied'), 800);
      }
    });
  } catch {
    metaContent.innerHTML = '<div class="dtp-empty">Cannot access this page — try refreshing</div>';
  }
}

async function showAccessibilityPanel() {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'Accessibility';
  metaContent.innerHTML = '<div class="dtp-loading">Analyzing...</div>';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const data = await browser.tabs.sendMessage(tab.id, { action: 'getAccessibilityData' });
    if (!data) {
      metaContent.innerHTML = '<div class="dtp-empty">Cannot analyze this page</div>';
      return;
    }

    // Process headings
    const headings = analyzeHeadings(data.headings || []);

    // Build issues
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
      contrastIssues: 0,
      htmlLang: data.htmlLang,
      titleText: data.titleText,
    });

    const stats = computeStats(issues);
    const sorted = sortIssues(issues);

    // Stats bar
    let html = `<div class="dtp-a11y-stats">
      <span class="dtp-a11y-stat dtp-a11y-error">${stats.errors} error${stats.errors !== 1 ? 's' : ''}</span>
      <span class="dtp-a11y-stat dtp-a11y-warning">${stats.warnings} warning${stats.warnings !== 1 ? 's' : ''}</span>
      <span class="dtp-a11y-stat dtp-a11y-info">${stats.info} info</span>
    </div>`;

    // Issues list
    html += '<div class="dtp-a11y-issues">';
    for (const issue of sorted) {
      const iconText = issueIcon(issue.type);
      html += `<div class="dtp-a11y-issue dtp-a11y-${issue.type}">
        <span class="dtp-a11y-icon">${iconText}</span>
        <div class="dtp-a11y-body">
          <span class="dtp-a11y-cat">${escapeHtml(issue.category)}</span>
          <span class="dtp-a11y-msg">${escapeHtml(issue.message)}</span>
          ${issue.details ? `<span class="dtp-a11y-details">${escapeHtml(issue.details)}</span>` : ''}
        </div>
      </div>`;
    }
    html += '</div>';

    // Heading structure
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

    // ARIA roles
    if (data.ariaRolesUsed && data.ariaRolesUsed.length > 0) {
      html += `<div class="dtp-meta-group"><div class="dtp-meta-group-name">ARIA Roles (${data.ariaRolesUsed.length})</div>`;
      html += `<div class="dtp-a11y-tags">${data.ariaRolesUsed.map((r: string) => `<span class="dtp-a11y-tag">${escapeHtml(r)}</span>`).join('')}</div>`;
      html += '</div>';
    }

    metaContent.innerHTML = html;
  } catch {
    metaContent.innerHTML = '<div class="dtp-empty">Cannot access this page — try refreshing</div>';
  }
}

async function showAssetsPanel() {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'Page Assets';
  metaContent.innerHTML = '<div class="dtp-loading">Scanning...</div>';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const data = await browser.tabs.sendMessage(tab.id, { action: 'getPageAssets' });
    if (!data) {
      metaContent.innerHTML = '<div class="dtp-empty">Cannot analyze this page</div>';
      return;
    }

    let html = '<div class="dtp-stats-bar">';
    html += `<span>${data.images} images</span>`;
    html += `<span>${data.scripts} scripts</span>`;
    html += `<span>${data.stylesheets} stylesheets</span>`;
    html += `<span>${data.fonts.length} fonts</span>`;
    html += '</div>';

    // Fonts
    if (data.fonts.length > 0) {
      html += '<div class="dtp-meta-group"><div class="dtp-meta-group-name">Fonts Used</div>';
      for (const font of data.fonts) {
        html += `<div class="dtp-meta-row">
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
  } catch {
    metaContent.innerHTML = '<div class="dtp-empty">Cannot access this page — try refreshing</div>';
  }
}

async function captureScreenshot() {
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'Screenshot';
  metaContent.innerHTML = '<div class="dtp-loading">Capturing...</div>';

  try {
    const dataUrl = await browser.runtime.sendMessage({ action: 'captureTab' });
    if (!dataUrl) {
      metaContent.innerHTML = '<div class="dtp-empty">No screenshot captured</div>';
      return;
    }

    // Create download link
    const a = document.createElement('a');
    a.href = dataUrl as string;
    a.download = `screenshot-${Date.now()}.png`;
    a.click();

    metaContent.innerHTML = `<div class="dtp-screenshot-preview">
      <img src="${dataUrl}" alt="Screenshot" style="width:100%;border-radius:4px;margin:8px 0;">
      <div class="dtp-empty">Screenshot saved to downloads</div>
    </div>`;
  } catch {
    metaContent.innerHTML = '<div class="dtp-empty">Cannot capture this page (restricted page or permission denied)</div>';
  }
}

function showProUpsell(trialUsed: boolean) {
  let trialHtml = '';
  if (!trialUsed) {
    trialHtml = `<button class="dtp-trial-btn" id="start-trial">Start ${TRIAL_DAYS}-day free trial</button>`;
  }

  metaContent.innerHTML = `<div class="dtp-upsell">
    <h3>Unlock Pro Tools</h3>
    <p>Get access to screenshots, accessibility checker, CSS variables, rulers, grid overlay, and page assets.</p>
    ${trialHtml}
    <button class="dtp-buy-btn" id="buy-pro">Unlock Pro — ${PRICE_DISPLAY}</button>
    <button class="dtp-login-btn" id="login-link">Already purchased? Log in</button>
  </div>`;
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'DevTools Pro';

  document.getElementById('buy-pro')?.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'openPayment' });
  });
  document.getElementById('start-trial')?.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'openTrial' });
  });
  document.getElementById('login-link')?.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'openLogin' });
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init().catch(err => console.error('Popup init failed:', err));
