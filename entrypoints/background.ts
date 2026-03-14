import ExtPay from 'extpay';
import { EXTPAY_ID } from '@/utils/payment';

export default defineBackground(() => {
  let extpay: ReturnType<typeof ExtPay> | null = null;
  try {
    extpay = ExtPay(EXTPAY_ID);
    extpay.startBackground();
    console.log('ExtPay initialized successfully, ID:', EXTPAY_ID);
  } catch (err) {
    console.warn('ExtPay initialization failed:', err);
  }

  // Register onPaid separately — it throws if the extensionpay.com content script
  // isn't in the manifest (ExtPay does an exact match check)
  if (extpay) {
    try {
      extpay.onPaid.addListener((user) => {
        console.log('ExtPay onPaid fired:', user);
      });
    } catch (err) {
      // Expected if content_scripts doesn't include extensionpay.com/* match
      console.log('ExtPay onPaid listener not available (content script for extensionpay.com not registered):', (err as string).slice(0, 100));
    }
  }

  // Set defaults on install
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      await browser.storage.local.set({
        theme: 'auto',
        compactMode: false,
        activeTool: null,
      });
    }
  });

  // Handle messages from popup and content scripts
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'captureTab') {
      return browser.tabs.captureVisibleTab(undefined, { format: 'png' });
    }

    if (msg.action === 'getSettings') {
      return browser.storage.local.get(['theme', 'compactMode']);
    }

    if (msg.action === 'saveSettings') {
      return browser.storage.local.set(msg.settings);
    }

    if (msg.action === 'getActiveTool') {
      return browser.storage.local.get('activeTool');
    }

    if (msg.action === 'setActiveTool') {
      return browser.storage.local.set({ activeTool: msg.toolId });
    }

    if (msg.action === 'getProStatus') {
      if (!extpay) {
        console.warn('ExtPay is null — returning unpaid');
        return Promise.resolve({ paid: false, paidAt: null, trialStartedAt: null });
      }
      return extpay.getUser().then(user => {
        console.log('ExtPay getUser() result:', JSON.stringify({
          paid: user.paid,
          paidAt: user.paidAt,
          trialStartedAt: user.trialStartedAt,
        }));
        return {
          paid: user.paid,
          paidAt: user.paidAt,
          trialStartedAt: user.trialStartedAt,
        };
      }).catch(err => {
        console.error('ExtPay getUser() FAILED:', err);
        return {
          paid: false,
          paidAt: null,
          trialStartedAt: null,
          error: String(err),
        };
      });
    }

    if (msg.action === 'openPayment') {
      if (!extpay) return;
      return extpay.openPaymentPage();
    }

    if (msg.action === 'openTrial') {
      if (!extpay) return;
      return extpay.openTrialPage('7-day free trial');
    }

    if (msg.action === 'openLogin') {
      if (!extpay) return;
      return extpay.openLoginPage();
    }
  });
});
