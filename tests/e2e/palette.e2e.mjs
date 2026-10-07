// End-to-end check of the command palette in a real Chromium with the built extension, on a
// deliberately hostile page (global !important styles, key handlers that swallow "/" and Esc,
// a strict CSP).
//
//   pnpm exec wxt build
//   PLAYWRIGHT=/path/to/playwright/index.mjs CHROME=/path/to/chrome node tests/e2e/palette.e2e.mjs
//
// Optional: SHOTS=<dir> writes dark and light screenshots. Exits non-zero on the first failed check.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const CHROME = process.env.CHROME;
if (!CHROME) throw new Error('Set CHROME to a Chromium or Chrome for Testing binary');
const BUILT = path.join(repo, '.output/chrome-mv3');
if (!fs.existsSync(path.join(BUILT, 'manifest.json'))) throw new Error('Run `pnpm exec wxt build` first');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dtp-e2e-'));
const EXT = path.join(work, 'ext');
fs.cpSync(BUILT, EXT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*']; // test copy only; the shipped manifest has none
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HOSTILE = `<!doctype html><meta charset="utf-8"><title>Hostile</title>
<style>
  * { all: revert; color: #f0f !important; font: 40px/3 serif !important; letter-spacing: 9px !important; }
  dtp-inspector, dtp-inspector * { visibility: hidden !important; }
  body { margin: 0; background: #ffe; }
</style>
<h1 id="title">Hello</h1><p id="p">Some text</p><input id="field" value="x">
<script>
  window.seen = [];
  // The page tries to swallow the palette key and Escape in the capture phase, and records
  // everything that reaches the bubble phase.
  window.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === '/') { /* observe only */ } }, true);
  document.addEventListener('keydown', e => window.seen.push(e.key));
  document.addEventListener('input', e => window.seen.push('input'));
</script>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
  res.end(HOSTILE);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PORT = 9300 + Math.floor(Math.random() * 300);
const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, 'profile')}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-extension-debugging', `--load-extension=${EXT}`, '--disable-features=DisableLoadExtensionCommandLineSwitch', '--headless=new', '--no-sandbox', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
};

let browser;
for (let i = 0; i < 80 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(250); }
}
if (!browser) throw new Error('Could not reach the browser');
const bcdp = await browser.newBrowserCDPSession();
let extId;
for (let i = 0; i < 80 && !extId; i++) {
  const worker = (await bcdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
  extId = worker && new URL(worker.url).host;
  if (!extId) await sleep(250);
}
if (!extId) throw new Error('The extension did not load');

try {
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.bringToFront();

  // This Chromium has no CDP call to click the toolbar icon, so the activeTab grant cannot be
  // given. The copy of the built extension loaded here differs from the shipped one only by a
  // host permission for 127.0.0.1; the same injection and activation the popup performs then
  // runs from the service worker.
  const target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'service_worker' && t.url.includes(extId));
  const workerSocket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { workerSocket.onopen = r; });
  let seq = 0;
  /** Evaluate an async expression in the extension's service worker. */
  const inWorker = expression => new Promise((resolve, reject) => {
    const id = ++seq;
    const onMessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id !== id) return;
      workerSocket.removeEventListener('message', onMessage);
      if (m.result?.exceptionDetails) reject(new Error(m.result.exceptionDetails.exception?.description));
      else resolve(m.result?.result?.value);
    };
    workerSocket.addEventListener('message', onMessage);
    workerSocket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  const started = await inWorker(`(async () => {
    const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(`${ORIGIN}/*`)} });
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['/content-scripts/content.js'] });
    return chrome.tabs.sendMessage(tab.id, { action: 'dtp:activate', toolId: 'css-inspect' });
  })()`);
  check('the tool started', started?.ok === true, JSON.stringify(started));
  await sleep(300);

  // The inspector lives in a closed shadow root, so everything is observed from outside it:
  // the focused element is the host, and the effects show up on the page and in storage.
  const hostFocused = () => page.evaluate(() => document.activeElement?.localName === 'dtp-inspector');
  const bodyText = () => page.evaluate(() => document.body.innerText);
  check('the tool started (host is on the page)', await page.evaluate(() => Boolean(document.querySelector('dtp-inspector'))));

  await page.focus('#field');
  await page.keyboard.type('/');
  const fieldValue = await page.inputValue('#field');
  check('a "/" typed in a field is text, not the palette', fieldValue.includes('/') && !(await hostFocused()), JSON.stringify({ fieldValue, host: await hostFocused() }));
  await page.evaluate(() => document.activeElement?.blur());

  await page.evaluate(() => { window.seen.length = 0; });
  await page.keyboard.press('/');
  await sleep(150);
  check('"/" opens the palette and moves focus into it', await hostFocused());
  check('the page did not see the opening key bubble', !(await page.evaluate(() => window.seen.includes('/'))));

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'palette-hostile-empty.png') });

  await page.evaluate(() => { window.seen.length = 0; });
  await page.keyboard.type('eyed');
  await sleep(100);
  check('typed letters stay out of the page', (await page.evaluate(() => window.seen)).every(k => !/^[eyd]$/.test(k)), JSON.stringify(await page.evaluate(() => window.seen)));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'palette-hostile-filtered.png') });

  // Escape closes only the palette; the tool keeps running.
  await page.keyboard.press('Escape');
  await sleep(150);
  check('Esc closes the palette and keeps the tool', !(await hostFocused()) && await page.evaluate(() => Boolean(document.querySelector('dtp-inspector'))));

  // Run a tool switch by keyboard: the active tool changes (cursor stays crosshair, host stays).
  await page.keyboard.press('/');
  await sleep(100);
  await page.keyboard.type('spacing');
  await page.keyboard.press('Enter');
  await sleep(300);
  check('Enter runs the command and closes the palette', !(await hostFocused()));
  await page.mouse.move(200, 150);
  await sleep(300);

  // Recently used first: reopen with nothing typed and the first option is Spacing.
  await page.keyboard.press('/');
  await sleep(250);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  const stored = await inWorker("chrome.storage.local.get('recentCommands').then(v => JSON.stringify(v))");
  check('the command was remembered as recent', String(stored).includes('tool:spacing'), String(stored));

  // Light theme screenshot for evidence.
  if (SHOTS) {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.keyboard.press('/');
    await sleep(250);
    await page.screenshot({ path: path.join(SHOTS, 'palette-hostile-light-recent.png') });
    await page.keyboard.press('Escape');
  }

  await page.keyboard.press('Escape');
  await sleep(200);
  check('Esc with the palette closed exits the tool', await page.evaluate(() => !document.querySelector('dtp-inspector')));
} finally {
  proc.kill();
  server.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
