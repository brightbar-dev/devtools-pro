const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const compactCheckbox = document.getElementById('compact-mode') as HTMLInputElement;

async function init() {
  const settings = await browser.storage.local.get(['theme', 'compactMode']);
  themeSelect.value = settings.theme || 'auto';
  compactCheckbox.checked = settings.compactMode || false;
}

themeSelect.addEventListener('change', () => {
  browser.storage.local.set({ theme: themeSelect.value });
});

compactCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ compactMode: compactCheckbox.checked });
});

init().catch(err => console.error('Options init failed:', err));
