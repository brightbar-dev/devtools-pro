import { unitFrom } from '@/utils/units';

const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const unitSelect = document.getElementById('measure-unit') as HTMLSelectElement;
const compactCheckbox = document.getElementById('compact-mode') as HTMLInputElement;

async function init() {
  const settings = await browser.storage.local.get(['theme', 'compactMode', 'measureUnit']);
  themeSelect.value = (settings.theme as string | undefined) ?? 'auto';
  unitSelect.value = unitFrom(settings.measureUnit);
  compactCheckbox.checked = (settings.compactMode as boolean | undefined) ?? false;
}

themeSelect.addEventListener('change', () => {
  browser.storage.local.set({ theme: themeSelect.value });
});

unitSelect.addEventListener('change', () => {
  browser.storage.local.set({ measureUnit: unitFrom(unitSelect.value) });
});

compactCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ compactMode: compactCheckbox.checked });
});

init().catch(err => console.error('Options init failed:', err));
