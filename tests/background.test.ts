import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The formerly-Pro tools (screenshot, accessibility, css-vars, rulers,
// grid-overlay, assets) are just tool IDs now — background.ts never checks
// payment/license state before honoring a settings or active-tool message.
describe('background message handlers — free for everyone', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  async function loadBackground() {
    const background = await import('../entrypoints/background');
    background.default.main();
  }

  /** Deliver a message and resolve with what the handler passed to sendResponse. */
  function send(message: any, sender: any = {}): Promise<any> {
    return new Promise(resolve => {
      void fakeBrowser.runtime.onMessage.trigger(message, sender, resolve);
    });
  }

  it('getSettings never returns a license/pro/trial flag', async () => {
    await loadBackground();

    const settings = await send({ action: 'getSettings' });
    expect(settings).not.toHaveProperty('proUnlocked');
    expect(settings).not.toHaveProperty('licenseStatus');
    expect(settings).not.toHaveProperty('trialStartedAt');
  });

  it('setActiveTool/getActiveTool work for a formerly-Pro tool id with zero payment state', async () => {
    await loadBackground();

    await send({ action: 'setActiveTool', toolId: 'accessibility' });
    const result = await send({ action: 'getActiveTool' });
    expect(result).toEqual({ activeTool: 'accessibility' });
  });

  it('saveSettings/getSettings round-trip without any payment keys in storage', async () => {
    await loadBackground();

    await send({ action: 'saveSettings', settings: { theme: 'dark', compactMode: true } });
    const settings = await send({ action: 'getSettings' });
    expect(settings).toEqual({ theme: 'dark', compactMode: true });

    const allStored = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(allStored)).not.toContain('proUnlocked');
  });
});

describe('background frame relay', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  async function loadBackground() {
    const background = await import('../entrypoints/background');
    background.default.main();
  }

  it('relays an exit from one frame to every frame of the same tab', async () => {
    const sendMessage = vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined);
    await loadBackground();

    const results = await fakeBrowser.runtime.onMessage.trigger(
      { action: 'dtp:broadcast', message: { action: 'dtp:deactivate' } },
      { tab: { id: 42 }, frameId: 3 } as any,
      () => {},
    );
    expect(results).toContain(true);
    expect(sendMessage).toHaveBeenCalledWith(42, { action: 'dtp:deactivate' });
  });

  it('refuses to relay collectors or messages without a sender tab', async () => {
    const sendMessage = vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined);
    await loadBackground();

    await fakeBrowser.runtime.onMessage.trigger({ action: 'dtp:broadcast', message: { action: 'dtp:collect', what: 'meta' } }, { tab: { id: 42 } } as any, () => {});
    await fakeBrowser.runtime.onMessage.trigger({ action: 'dtp:broadcast', message: { action: 'dtp:deactivate' } }, {} as any, () => {});
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
