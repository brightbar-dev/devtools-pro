import { TOOLS, isProTool } from '@/utils/tools';

const toolsGrid = document.getElementById('tools-grid')!;
const metaPanel = document.getElementById('meta-panel')!;
const metaContent = document.getElementById('meta-content')!;
const metaTitle = document.getElementById('meta-title')!;
const metaBack = document.getElementById('meta-back')!;
const optionsLink = document.getElementById('options-link')!;

let activeTool: string | null = null;

async function init() {
  const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
  applyTheme(settings.theme || 'auto');
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

function setupListeners() {
  toolsGrid.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.dtp-tool-btn') as HTMLElement;
    if (!btn) return;

    const toolId = btn.dataset.tool!;

    // Check pro status
    if (isProTool(toolId)) {
      const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
      if (!settings.proUnlocked) {
        showProUpsell();
        return;
      }
    }

    // Meta tags and page assets show in popup, not content script
    if (toolId === 'meta-tags') {
      showMetaPanel();
      return;
    }

    // Toggle active state
    if (activeTool === toolId) {
      deactivateTool();
    } else {
      activateTool(toolId);
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

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await browser.tabs.sendMessage(tab.id, { action: 'activateTool', toolId });
  }
}

async function deactivateTool() {
  activeTool = null;
  updateActiveState();

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await browser.tabs.sendMessage(tab.id, { action: 'deactivate' });
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
    if (!tab?.id) return;

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
    metaContent.innerHTML = '<div class="dtp-empty">Cannot access this page</div>';
  }
}

function showProUpsell() {
  metaContent.innerHTML = `<div class="dtp-upsell">
    <h3>Unlock Pro Tools</h3>
    <p>Get access to screenshots, accessibility checker, CSS variables, rulers, grid overlay, and page assets.</p>
    <button class="dtp-buy-btn" id="buy-pro">Unlock Pro — $59</button>
  </div>`;
  toolsGrid.style.display = 'none';
  metaPanel.style.display = 'block';
  metaTitle.textContent = 'DevTools Pro';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();
