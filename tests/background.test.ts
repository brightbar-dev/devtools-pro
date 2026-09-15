import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The formerly-Pro tools (screenshot, accessibility, css-vars, rulers,
// grid-overlay, assets) are just tool IDs now — background.ts never checks
// payment/license state before honoring a settings or active-tool message.
describe('background message handlers — free for everyone', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  async function loadBackground() {
    const background = await import('../entrypoints/background');
    background.default.main();
  }

  async function send(message: any) {
    const [result] = await fakeBrowser.runtime.onMessage.trigger(message, {} as any, () => {});
    return result;
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
