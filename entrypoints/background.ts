import { isRelayable, type BroadcastRequest } from '@/utils/messages';

export default defineBackground(() => {
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

  // Handle messages from the popup and the injected inspector. Replies go through
  // sendResponse (return true keeps the channel open), which every Chrome and Firefox
  // version supports; returning a Promise from the listener is not universal.
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const reply = (work: Promise<unknown>) => {
      work.then(sendResponse, (err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
      return true;
    };

    switch (msg?.action) {
      case 'captureTab': {
        // From the page, capture the window that tab is in; from the popup, the current window.
        const windowId = sender.tab?.windowId;
        return reply(windowId === undefined
          ? browser.tabs.captureVisibleTab({ format: 'png' })
          : browser.tabs.captureVisibleTab(windowId, { format: 'png' }));
      }
      case 'getSettings':
        return reply(browser.storage.local.get(['theme', 'compactMode']));
      case 'saveSettings':
        return reply(browser.storage.local.set(msg.settings));
      case 'getActiveTool':
        return reply(browser.storage.local.get('activeTool'));
      case 'setActiveTool':
        return reply(browser.storage.local.set({ activeTool: msg.toolId }));
      case 'dtp:broadcast': {
        // A frame asks for a tool switch, exit or pin to reach every frame of its own tab.
        const tabId = sender.tab?.id;
        const { message } = msg as BroadcastRequest;
        if (tabId === undefined || !isRelayable(message)) return false;
        return reply(browser.tabs.sendMessage(tabId, message).catch(() => undefined));
      }
      default:
        return false;
    }
  });
});
