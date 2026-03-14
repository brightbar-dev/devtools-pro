import ExtPay from 'extpay';
import { EXTPAY_ID } from '@/utils/payment';

export default defineBackground(() => {
  // ExtPay background setup — registers message listener for payment notifications
  // and handles the content script relay from extensionpay.com
  try {
    const extpay = ExtPay(EXTPAY_ID);
    extpay.startBackground();
  } catch (err) {
    console.warn('ExtPay initialization failed:', err);
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
  // Note: ExtPay-related actions (getProStatus, openPayment, etc.) are handled
  // directly by popup/options via their own ExtPay instance to avoid listener conflicts
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
  });
});
