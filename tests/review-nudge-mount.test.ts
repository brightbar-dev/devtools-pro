import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// showReviewNudge runs on every popup open with no tool running. The package's own tests cover
// its DOM; these cover our wrapper: the options and storage it passes, the stylesheet it injects
// once, and that a failure never reaches the popup.
const mountReviewNudge = vi.fn();
vi.mock('@brightbar-dev/review-nudge', async importOriginal => ({
  ...(await importOriginal<typeof import('@brightbar-dev/review-nudge')>()),
  mountReviewNudge: (...args: unknown[]) => mountReviewNudge(...args),
}));

const { reviewNudgeCss } = await import('@brightbar-dev/review-nudge');
const { showReviewNudge, reviewNudgeOptions } = await import('../utils/review-nudge');

/** Just enough of a document for the wrapper: lookup by id, <style> creation, head.append. */
function fakeDocument() {
  const appended: Array<{ id: string; textContent: string }> = [];
  const doc = {
    appended,
    getElementById: (id: string) => appended.find(el => el.id === id) ?? null,
    createElement: (tag: string) => {
      expect(tag).toBe('style');
      return { id: '', textContent: '' };
    },
    head: { append: (el: { id: string; textContent: string }) => { appended.push(el); } },
  };
  const container = { ownerDocument: doc } as unknown as HTMLElement;
  return { doc, container };
}

describe('showReviewNudge', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    mountReviewNudge.mockReset();
  });

  it('mounts with this item’s options and storage.local', async () => {
    mountReviewNudge.mockResolvedValue(null);
    const { container } = fakeDocument();
    await showReviewNudge(container);
    expect(mountReviewNudge).toHaveBeenCalledWith(container, { ...reviewNudgeOptions, storage: fakeBrowser.storage.local });
  });

  it('adds its stylesheet once, only when the request is shown', async () => {
    const { doc, container } = fakeDocument();

    mountReviewNudge.mockResolvedValue(null);
    await showReviewNudge(container);
    expect(doc.appended).toEqual([]);

    mountReviewNudge.mockResolvedValue({});
    await showReviewNudge(container);
    await showReviewNudge(container);
    expect(doc.appended).toEqual([{ id: 'bb-review-nudge-css', textContent: reviewNudgeCss }]);
  });

  it('keeps a failure away from the popup', async () => {
    mountReviewNudge.mockRejectedValue(new Error('storage quota'));
    const { doc, container } = fakeDocument();
    await expect(showReviewNudge(container)).resolves.toBeUndefined();
    expect(doc.appended).toEqual([]);
  });
});
