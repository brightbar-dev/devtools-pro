/** Whether the browser lets an extension run on a page — decided from the URL up front, or from the error afterwards. */

export type RestrictionKind = 'browser-page' | 'store' | 'file-access' | 'error-page' | 'no-access' | 'unknown';

export interface Restriction {
  kind: RestrictionKind;
  message: string;
}

export interface RestrictionContext {
  /** Browser name used in messages, e.g. "Chrome" or "Firefox". */
  browserName: string;
  isFirefox: boolean;
  /** Whether the user allowed this extension on file:// URLs; undefined when unknown. */
  fileAccessAllowed?: boolean;
}

/** URL schemes that belong to the browser itself; no extension may script them. */
const BROWSER_SCHEMES = new Set([
  'about:', 'chrome:', 'chrome-extension:', 'chrome-untrusted:', 'chrome-search:', 'devtools:',
  'edge:', 'brave:', 'opera:', 'vivaldi:', 'view-source:', 'javascript:',
  'moz-extension:', 'resource:',
]);

const CHROMIUM_STORE_PAGES = [
  { host: 'chromewebstore.google.com', path: '/' },
  { host: 'chrome.google.com', path: '/webstore' },
];
const FIREFOX_STORE_PAGES = [{ host: 'addons.mozilla.org', path: '/' }];

function browserPage(ctx: RestrictionContext): Restriction {
  return { kind: 'browser-page', message: `${ctx.browserName} does not allow extensions on this page.` };
}

function storePage(ctx: RestrictionContext): Restriction {
  return { kind: 'store', message: `${ctx.browserName} does not allow extensions on its extension store.` };
}

function fileAccess(): Restriction {
  return {
    kind: 'file-access',
    message: 'To inspect local files, turn on "Allow access to file URLs" for DevTools Pro on the extensions page, then reload the file.',
  };
}

/** A restriction known from the URL alone, or null when the page may be scriptable (unknown URLs included). */
export function restrictionForUrl(url: string | undefined, ctx: RestrictionContext): Restriction | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (BROWSER_SCHEMES.has(parsed.protocol)) return browserPage(ctx);
  const stores = ctx.isFirefox ? FIREFOX_STORE_PAGES : CHROMIUM_STORE_PAGES;
  if (stores.some(s => parsed.hostname === s.host && parsed.pathname.startsWith(s.path))) return storePage(ctx);
  if (parsed.protocol === 'file:' && ctx.fileAccessAllowed === false) return fileAccess();
  return null;
}

/** Turn an injection or messaging error into something a person can act on. */
export function restrictionForError(error: unknown, ctx: RestrictionContext): Restriction {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/extensions gallery cannot be scripted|webstore/i.test(message)) return storePage(ctx);
  if (/showing error page/i.test(message)) {
    return { kind: 'error-page', message: 'This tab is showing an error page. Reload it, then try again.' };
  }
  if (/file:\/\//i.test(message)) return fileAccess();
  if (/cannot access a [a-z-]+:\/\/ url|url "(about|chrome|chrome-extension|edge|devtools|view-source|data):/i.test(message)) {
    return browserPage(ctx);
  }
  if (/cannot access contents|missing host permission|must request permission|permission denied/i.test(message)) {
    return {
      kind: 'no-access',
      message: 'DevTools Pro can only reach this tab after you open it from the toolbar on this tab. Click the DevTools Pro icon here and pick the tool again.',
    };
  }
  return { kind: 'unknown', message: `Could not start on this page: ${message || 'unknown error'}` };
}
