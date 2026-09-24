import { chromeWebStoreReviewUrl, mountReviewNudge, recordActivation, reviewNudgeCss, type MountOptions } from '@brightbar-dev/review-nudge';
import { browser } from 'wxt/browser';

/**
 * The one-time review request. @brightbar-dev/review-nudge owns the rules (never on install, only
 * after 8 successful uses over 3 days, shown once, "Don't ask again" is final); this file only says
 * which item it is for and where problems go.
 *
 * The Firefox build is not on the Chrome Web Store (or Firefox Add-ons), so it never asks.
 */
export const CWS_ITEM_ID = 'lbgjfgdjjeiajkkcppdnclmkicihehkf';

export const reviewNudgeOptions: Omit<MountOptions, 'storage'> = {
  name: 'Brightbar DevTools',
  reviewUrl: chromeWebStoreReviewUrl(CWS_ITEM_ID),
  feedbackUrl: 'https://github.com/brightbar-dev/devtools-pro/issues/new',
};

export function offersReview(isFirefox = import.meta.env.BROWSER === 'firefox'): boolean {
  return !isFirefox;
}

/** Count one tool that did its job. Never lets a storage failure reach the tool. */
export async function recordToolUse(): Promise<void> {
  if (!offersReview()) return;
  await recordActivation({ storage: browser.storage.local }).catch(() => {});
}

/** Show the request at the end of `container` if it has been earned. Call only when no tool is running. */
export async function showReviewNudge(container: HTMLElement): Promise<void> {
  if (!offersReview()) return;
  const doc = container.ownerDocument;
  const shown = await mountReviewNudge(container, { ...reviewNudgeOptions, storage: browser.storage.local }).catch(() => null);
  if (shown && !doc.getElementById('bb-review-nudge-css')) {
    doc.head.append(Object.assign(doc.createElement('style'), { id: 'bb-review-nudge-css', textContent: reviewNudgeCss }));
  }
}
