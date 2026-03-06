import ExtPay from 'extpay';
import { EXTPAY_ID } from '@/utils/payment';

export default defineBackground(() => {
  const extpay = ExtPay(EXTPAY_ID);
  extpay.startBackground();

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
      return extpay.getUser().then(user => ({
        paid: user.paid,
        paidAt: user.paidAt,
        trialStartedAt: user.trialStartedAt,
      })).catch(() => ({
        paid: false,
        paidAt: null,
        trialStartedAt: null,
      }));
    }

    if (msg.action === 'openPayment') {
      return extpay.openPaymentPage();
    }

    if (msg.action === 'openTrial') {
      return extpay.openTrialPage('7-day free trial');
    }

    if (msg.action === 'openLogin') {
      return extpay.openLoginPage();
    }
  });
});
