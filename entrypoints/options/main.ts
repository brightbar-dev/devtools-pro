const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const compactCheckbox = document.getElementById('compact-mode') as HTMLInputElement;

async function init() {
  const settings = await browser.storage.local.get(['theme', 'compactMode', 'proUnlocked']);
  themeSelect.value = settings.theme || 'auto';
  compactCheckbox.checked = settings.compactMode || false;

  if (settings.proUnlocked) {
    const status = document.getElementById('license-status')!;
    status.innerHTML = '<span class="dtp-badge-pro">Pro</span><p>All 12 tools unlocked.</p>';
  }
}

themeSelect.addEventListener('change', () => {
  browser.storage.local.set({ theme: themeSelect.value });
});

compactCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ compactMode: compactCheckbox.checked });
});

init();
