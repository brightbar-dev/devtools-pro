import { describe, it, expect } from 'vitest';
import { restrictionForError, restrictionForUrl, type RestrictionContext } from '../utils/restrictions';

const chrome: RestrictionContext = { browserName: 'Chrome', isFirefox: false };
const firefox: RestrictionContext = { browserName: 'Firefox', isFirefox: true };

describe('restrictionForUrl', () => {
  it('blocks browser-internal pages with a plain explanation', () => {
    for (const url of ['chrome://extensions/', 'chrome-extension://abc/popup.html', 'about:blank', 'edge://settings', 'view-source:https://example.com', 'devtools://devtools/bundled/inspector.html']) {
      expect(restrictionForUrl(url, chrome)).toEqual({ kind: 'browser-page', message: 'Chrome does not allow extensions on this page.' });
    }
  });

  it('blocks the browser’s own extension store', () => {
    expect(restrictionForUrl('https://chromewebstore.google.com/detail/x/abc', chrome)?.kind).toBe('store');
    expect(restrictionForUrl('https://chrome.google.com/webstore/detail/abc', chrome)?.kind).toBe('store');
    expect(restrictionForUrl('https://chrome.google.com/search?q=x', chrome)).toBeNull();
    expect(restrictionForUrl('https://addons.mozilla.org/en-US/firefox/', chrome)).toBeNull();
    expect(restrictionForUrl('https://addons.mozilla.org/en-US/firefox/', firefox)).toEqual({ kind: 'store', message: 'Firefox does not allow extensions on its extension store.' });
  });

  it('asks for file access only when it is known to be off', () => {
    expect(restrictionForUrl('file:///Users/me/page.html', { ...chrome, fileAccessAllowed: false })?.kind).toBe('file-access');
    expect(restrictionForUrl('file:///Users/me/page.html', { ...chrome, fileAccessAllowed: true })).toBeNull();
    expect(restrictionForUrl('file:///Users/me/page.html', chrome)).toBeNull();
  });

  it('lets ordinary and unknown URLs through', () => {
    expect(restrictionForUrl('https://stripe.com/', chrome)).toBeNull();
    expect(restrictionForUrl('http://127.0.0.1:8773/index.html', chrome)).toBeNull();
    expect(restrictionForUrl(undefined, chrome)).toBeNull();
    expect(restrictionForUrl('not a url', chrome)).toBeNull();
  });
});

describe('restrictionForError', () => {
  it('recognises Chrome’s injection errors', () => {
    expect(restrictionForError(new Error('Cannot access a chrome:// URL'), chrome).kind).toBe('browser-page');
    expect(restrictionForError(new Error('Cannot access a chrome-extension:// URL of different extension'), chrome).kind).toBe('browser-page');
    expect(restrictionForError(new Error('Cannot access contents of url "about:blank". Extension manifest must request permission to access this host.'), chrome).kind).toBe('browser-page');
    expect(restrictionForError(new Error('The extensions gallery cannot be scripted.'), chrome).kind).toBe('store');
    expect(restrictionForError(new Error('Frame with ID 0 is showing error page'), chrome).kind).toBe('error-page');
    expect(restrictionForError(new Error('Cannot access contents of url "file:///Users/me/a.html". Extension manifest must request permission to access this host.'), chrome).kind).toBe('file-access');
  });

  it('explains a missing activeTab grant', () => {
    const r = restrictionForError(new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.'), chrome);
    expect(r.kind).toBe('no-access');
    expect(r.message).toMatch(/Click the Brightbar DevTools icon/);
    expect(restrictionForError(new Error('Missing host permission for the tab'), firefox).kind).toBe('no-access');
  });

  it('passes anything else through with its message', () => {
    expect(restrictionForError(new Error('Something odd'), chrome)).toEqual({ kind: 'unknown', message: 'Could not start on this page: Something odd' });
    expect(restrictionForError('plain string', chrome).message).toBe('Could not start on this page: plain string');
    expect(restrictionForError(undefined, chrome).message).toBe('Could not start on this page: unknown error');
  });
});
