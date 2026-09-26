import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Every screenshot goes through the background's captureTab handler, and every popup open asks it
// for settings. These cover the capture branches, the error reply, and the channel contract.
describe('background capture and replies', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  async function loadBackground() {
    const background = await import('../entrypoints/background');
    background.default.main();
  }

  /** Deliver a message; resolve with what went to sendResponse, and what the listener returned. */
  async function send(message: any, sender: any = {}): Promise<{ response: any; returned: unknown[] }> {
    let resolveResponse!: (value: any) => void;
    const response = new Promise(resolve => { resolveResponse = resolve; });
    const returned = await fakeBrowser.runtime.onMessage.trigger(message, sender, resolveResponse);
    return { response: await response, returned };
  }

  it('captures the current window when the popup asks (no sender tab)', async () => {
    const capture = vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockResolvedValue('data:image/png;base64,AAAA' as any);
    await loadBackground();

    const { response, returned } = await send({ action: 'captureTab' });
    expect(returned).toContain(true);
    expect(response).toBe('data:image/png;base64,AAAA');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]).toEqual([{ format: 'png' }]);
  });

  it('captures the window of the sending tab when the page asks', async () => {
    const capture = vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockResolvedValue('data:image/png;base64,BBBB' as any);
    await loadBackground();

    const { response } = await send({ action: 'captureTab' }, { tab: { id: 7, windowId: 3 } });
    expect(response).toBe('data:image/png;base64,BBBB');
    expect(capture.mock.calls[0]).toEqual([3, { format: 'png' }]);
  });

  it('replies with the error message when a capture is refused', async () => {
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockRejectedValue(new Error('This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.'));
    await loadBackground();

    const { response } = await send({ action: 'captureTab' }, { tab: { id: 7, windowId: 3 } });
    expect(response).toEqual({ error: 'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.' });
  });

  it('replies with a string when something other than an Error is thrown', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue('storage unavailable');
    await loadBackground();

    const { response } = await send({ action: 'getSettings' });
    expect(response).toEqual({ error: 'storage unavailable' });
  });

  it('returns only theme and compactMode from getSettings', async () => {
    await fakeBrowser.storage.local.set({ theme: 'light', compactMode: true, activeTool: 'spacing', other: 1 });
    await loadBackground();

    const { response } = await send({ action: 'getSettings' });
    expect(response).toEqual({ theme: 'light', compactMode: true });
  });

  it('does not hold the channel open for unknown or malformed messages', async () => {
    await loadBackground();
    const sendResponse = vi.fn();

    for (const message of [{ action: 'nope' }, {}, null, undefined, 'captureTab']) {
      const returned = await fakeBrowser.runtime.onMessage.trigger(message as any, {} as any, sendResponse);
      expect(returned).toEqual([false]);
    }
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('answers a relay even when the tab has no inspector to receive it', async () => {
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    await loadBackground();

    const { response } = await send({ action: 'dtp:broadcast', message: { action: 'dtp:pin', pinned: true } }, { tab: { id: 42 } });
    expect(response).toBeUndefined();
  });
});

describe('background install defaults', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as any);
  });

  async function loadBackground() {
    const background = await import('../entrypoints/background');
    background.default.main();
  }

  it('stores the default settings on install', async () => {
    // Asserted on the call: the fake storage drops null values, which real storage keeps.
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);
    expect(set).toHaveBeenCalledWith({ theme: 'auto', compactMode: false, activeTool: null });
    expect(await fakeBrowser.storage.local.get(['theme', 'compactMode'])).toEqual({ theme: 'auto', compactMode: false });
  });

  it('keeps the user’s settings on update', async () => {
    await fakeBrowser.storage.local.set({ theme: 'dark', compactMode: true });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.5.0' } as any);
    expect(await fakeBrowser.storage.local.get(null)).toEqual({ theme: 'dark', compactMode: true });
  });
});
