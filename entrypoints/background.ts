export default defineBackground(() => {
  // Set defaults on install
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      await browser.storage.local.set({
        theme: 'auto',
        compactMode: false,
        activeTool: null,
        proUnlocked: false,
      });
    }
  });

  // Handle messages from popup and content scripts
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'captureTab') {
      return browser.tabs.captureVisibleTab(undefined, { format: 'png' });
    }

    if (msg.action === 'getSettings') {
      return browser.storage.local.get(['theme', 'compactMode', 'proUnlocked']);
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
