import ExtPay from 'extpay';
import { resolveProStatus, statusLabel, EXTPAY_ID, PRICE_DISPLAY, TRIAL_DAYS, type PaymentUser } from '@/utils/payment';

const extpay = ExtPay(EXTPAY_ID);

const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const compactCheckbox = document.getElementById('compact-mode') as HTMLInputElement;

async function init() {
  const settings = await browser.storage.local.get(['theme', 'compactMode']);
  themeSelect.value = settings.theme || 'auto';
  compactCheckbox.checked = settings.compactMode || false;

  // Load license status from ExtensionPay directly (not via background messaging)
  const statusEl = document.getElementById('license-status')!;
  try {
    const user = await extpay.getUser();
    const proStatus = resolveProStatus(user as PaymentUser);
    const label = statusLabel(proStatus);

    if (proStatus.paid) {
      statusEl.innerHTML = `<span class="dtp-badge-pro">${label}</span><p>All 12 tools unlocked.</p>`;
    } else if (proStatus.trialActive) {
      statusEl.innerHTML = `<span class="dtp-badge-trial">${label}</span><p>All 12 tools unlocked during trial.</p>
        <button class="dtp-buy-btn" id="buy-pro">Buy Pro — ${PRICE_DISPLAY}</button>`;
    } else {
      let trialBtn = '';
      if (!user.trialStartedAt) {
        trialBtn = `<button class="dtp-trial-btn" id="start-trial">Start ${TRIAL_DAYS}-day free trial</button>`;
      }
      statusEl.innerHTML = `<span class="dtp-badge-free">Free</span><p>6 tools available. Unlock Pro for all 12 tools.</p>
        ${trialBtn}
        <button class="dtp-buy-btn" id="buy-pro">Buy Pro — ${PRICE_DISPLAY}</button>
        <button class="dtp-login-btn" id="login-link">Already purchased? Log in</button>`;
    }

    document.getElementById('buy-pro')?.addEventListener('click', () => {
      extpay.openPaymentPage();
    });
    document.getElementById('start-trial')?.addEventListener('click', () => {
      extpay.openTrialPage('7-day free trial');
    });
    document.getElementById('login-link')?.addEventListener('click', () => {
      extpay.openLoginPage();
    });
  } catch {
    // ExtPay unavailable — show default free status
  }
}

themeSelect.addEventListener('change', () => {
  browser.storage.local.set({ theme: themeSelect.value });
});

compactCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ compactMode: compactCheckbox.checked });
});

init().catch(err => console.error('Options init failed:', err));
