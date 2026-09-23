// Chrome Web Store assets from the real built extension: five 1280×800 screenshots and two promo tiles.
//
//   npx wxt build
//   PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs \
//   CHROME="/path/to/Google Chrome for Testing" \
//   node store/capture/capture.mjs
//
// Loads .output/chrome-mv3 into a fresh headless Chrome for Testing profile, clicks the toolbar
// icon for real (CDP Extensions.triggerAction), drives each tool on the fictional demo page in
// ./demo, composes a caption band, and writes alpha-free PNGs (ImageMagick) to store/screenshots
// and store/promo.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const CHROME = process.env.CHROME;
if (!CHROME) throw new Error('Set CHROME to a Chrome for Testing binary');
const EXT = path.join(repo, '.output/chrome-mv3');
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('Run `npx wxt build` first');
const OUT = { shots: path.join(repo, 'store/screenshots'), promo: path.join(repo, 'store/promo') };
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'dtp-store-'));
const PORT = 9800 + Math.floor(Math.random() * 100);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
fs.mkdirSync(OUT.shots, { recursive: true });
fs.mkdirSync(OUT.promo, { recursive: true });
fs.copyFileSync(path.join(repo, 'public/icon-128.png'), path.join(WORK, 'icon.png'));

// ── Static server: the demo page and the composition work files ─────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const name = path.basename(url.pathname);
  const file = url.pathname.startsWith('/work/') ? path.join(WORK, name) : path.join(here, 'demo', name || 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' });
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── Browser ──────────────────────────────────────────────────────────────
const profile = path.join(WORK, 'profile');
const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-extension-debugging', '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
let browser;
for (let i = 0; i < 80 && !browser; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  } catch {
    await sleep(250);
  }
}
if (!browser) throw new Error('Could not reach Chrome for Testing');
const ctx = browser.contexts()[0];
const bcdp = await browser.newBrowserCDPSession();
const extId = (await bcdp.send('Extensions.loadUnpacked', { path: EXT })).id;
await sleep(1200);
for (const t of (await bcdp.send('Target.getTargets')).targetInfos) {
  if (t.url.includes(`${extId}/welcome.html`)) await bcdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
}

/** A page driven over its own DevTools socket (extension popups are not Playwright pages here). */
class RawTarget {
  static async open(wsUrl, targetId) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return new RawTarget(ws, targetId);
  }
  constructor(ws, targetId) {
    this.targetId = targetId;
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.closed = false;
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      const waiter = msg.id && this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    };
    ws.onclose = () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error('target closed'));
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('target closed'));
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async close() {
    if (!this.closed) await bcdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }
  async until(expression, timeout = 6000) {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
      if (await this.eval(expression).catch(() => false)) return true;
    }
    return false;
  }
}

async function openPopup() {
  await page.bringToFront();
  const tabs = (await bcdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos;
  // Exactly the demo tab: composition pages share the origin but live in another context.
  const tab = tabs.find(t => t.url === page.url());
  if (!tab) throw new Error(`no tab target for ${page.url()}`);
  const known = new Set((await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).map(t => t.id));
  await bcdp.send('Extensions.triggerAction', { id: extId, targetId: tab.targetId });
  for (let i = 0; i < 60; i++) {
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => !known.has(x.id) && x.url.includes(`${extId}/popup.html`));
    if (t) {
      const popup = await RawTarget.open(t.webSocketDebuggerUrl, t.id);
      await popup.until("document.querySelectorAll('.dtp-tool-btn').length > 0");
      await sleep(500);
      // A visible notice means the popup is looking at some other tab: fail rather than capture it.
      const notice = await popup.eval("document.getElementById('page-notice')?.hidden === false ? document.getElementById('page-notice').textContent : ''");
      if (notice) throw new Error(`popup is not attached to the demo tab: ${notice}`);
      return popup;
    }
    await sleep(100);
  }
  throw new Error('popup did not open');
}

async function startTool(toolId) {
  const popup = await openPopup();
  await popup.eval(`document.querySelector('[data-tool="${toolId}"]').click()`).catch(() => {});
  for (let i = 0; i < 40 && !popup.closed; i++) await sleep(100);
  if (!popup.closed) throw new Error(`${toolId} did not start: ${await popup.eval("document.getElementById('meta-content')?.innerText ?? ''").catch(() => '')}`);
  await sleep(200);
}

/** Capture the popup's own content (the headless popup viewport is wider than the 320px popup). */
async function popupPng(popup, file, stopSelector) {
  const box = await popup.eval(`(() => {
    const body = document.body.getBoundingClientRect();
    const stop = document.querySelector(${JSON.stringify(stopSelector)});
    const bottom = stop ? stop.getBoundingClientRect().bottom + 12 : body.height;
    return { width: Math.ceil(body.width), height: Math.ceil(Math.min(bottom, window.innerHeight)) };
  })()`);
  const { data } = await popup.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: box.width, height: box.height, scale: 1 } });
  fs.writeFileSync(path.join(WORK, file), Buffer.from(data, 'base64'));
  const buf = fs.readFileSync(path.join(WORK, file));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 728 });
await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await page.bringToFront();
const rect = sel => page.evaluate(s => {
  const b = document.querySelector(s).getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, top: b.top, width: b.width, height: b.height };
}, sel);
const scrollTo = (sel, offset) => page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + window.scrollY - o), [sel, offset]);
const exitTool = async () => { await page.keyboard.press('Escape'); await sleep(250); };

// ── Composition ──────────────────────────────────────────────────────────
// A separate browser context, so composing never becomes the tab the popup inspects.
const composer = await (await browser.newContext()).newPage();
function band(caption) {
  return `<div style="height:72px;display:flex;align-items:center;gap:16px;padding:0 28px;background:linear-gradient(90deg,#1e1b4b,#3730a3);color:#fff">
    <img src="/work/icon.png" width="36" height="36" style="border-radius:8px">
    <div style="font-size:26px;font-weight:650;letter-spacing:-0.3px">${caption}</div>
    <div style="margin-left:auto;font-size:15px;color:#c7d2fe">Brightbar DevTools · every tool free</div>
  </div>`;
}
async function compose(name, caption, pageShot, popup) {
  const overlay = popup
    ? `<img src="/work/${popup.file}" style="position:absolute;right:28px;top:12px;width:${popup.width}px;border-radius:12px;box-shadow:0 22px 60px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.14)">`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;width:1280px;height:800px;overflow:hidden;font-family:-apple-system,'SF Pro Display','Avenir Next',system-ui,sans-serif">
    ${band(caption)}<div style="position:relative;width:1280px;height:728px;overflow:hidden"><img src="/work/${pageShot}" style="display:block">${overlay}</div></body>`;
  fs.writeFileSync(path.join(WORK, `${name}.html`), html);
  await composer.setViewportSize({ width: 1280, height: 800 });
  await composer.goto(`${ORIGIN}/work/${name}.html`, { waitUntil: 'load' });
  await sleep(200);
  const raw = path.join(WORK, `${name}-raw.png`);
  await composer.screenshot({ path: raw, type: 'png' });
  flatten(raw, path.join(OUT.shots, `${name}.png`));
}
function flatten(src, dest) {
  execFileSync('magick', [src, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', `PNG24:${dest}`]);
  log('wrote', path.relative(repo, dest));
}

// 1 · the tool grid
{
  await page.mouse.move(640, 300);
  const popup = await openPopup();
  await popup.eval("document.activeElement?.blur(); document.querySelector('[data-tool=\"rulers\"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))");
  await sleep(200);
  const size = await popupPng(popup, 'popup-grid.png', '#tool-description');
  await page.screenshot({ path: path.join(WORK, 'page-grid.png') });
  await popup.close();
  await compose('01-tool-grid', '13 page-inspection tools, and every one is free', 'page-grid.png', { file: 'popup-grid.png', ...size });
}

// 2 · measure distances
{
  await scrollTo('.stats', 180);
  await startTool('rulers');
  // Point at the cards' own padding, so the cards (not their text) are measured.
  const [a, b] = await page.evaluate(() => [...document.querySelectorAll('.stat')].slice(1, 3).map(e => { const r = e.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height - 8 }; }));
  await page.mouse.move(a.x, a.y);
  await sleep(150);
  await page.mouse.click(a.x, a.y);
  await sleep(1600); // let the "Anchored" hint give way to the tool's own hint
  await page.keyboard.down('Alt');
  await page.mouse.move(b.x - 10, b.y, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 2 });
  await sleep(400);
  await page.screenshot({ path: path.join(WORK, 'page-measure.png') });
  await page.keyboard.up('Alt');
  await exitTool();
  await compose('02-measure', 'Measure sizes, gaps and distances right on the page', 'page-measure.png');
}

// 3 · grid overlay
{
  await scrollTo('#features', 40);
  await startTool('grid-overlay');
  const grid = await rect('.features');
  await page.mouse.move(grid.left + grid.width * 0.66 + 2, grid.top + 20);
  await sleep(200);
  await page.mouse.click(grid.left + grid.width * 0.66 + 2, grid.top + 20);
  await sleep(200);
  const card = await rect('.f-share');
  await page.mouse.move(card.left + 12, card.top + card.height - 12, { steps: 4 }); // the grid item itself, not its heading
  await sleep(400);
  await page.screenshot({ path: path.join(WORK, 'page-grid-overlay.png') });
  await exitTool();
  await compose('03-grid-overlay', 'See grid tracks, gaps and named areas drawn on the layout', 'page-grid-overlay.png');
}

// 4 · eyedropper and page palette
{
  await page.evaluate(() => window.scrollTo(0, 0));
  await startTool('color-picker');
  const cta = await rect('.hero .btn-primary');
  await page.mouse.move(cta.x, cta.y, { steps: 3 });
  await sleep(300);
  await page.keyboard.press('p');
  await sleep(500);
  await page.screenshot({ path: path.join(WORK, 'page-palette.png') });
  await exitTool();
  await compose('04-eyedropper-palette', 'Every colour on the page, an eyedropper and WCAG contrast', 'page-palette.png');
}

// 5 · accessibility audit
{
  await scrollTo('.quote', 260);
  await sleep(200);
  const popup = await openPopup();
  await popup.eval("document.querySelector('[data-tool=\"accessibility\"]').click()");
  await popup.until("document.querySelector('#meta-content') && !document.querySelector('#meta-content .dtp-loading')", 8000);
  await popup.eval("[...document.querySelectorAll('.dtp-contrast-row')].find(r => r.innerText.includes('We stopped arguing'))?.querySelector('[data-highlight]')?.click()");
  await sleep(1500);
  const found = await popup.eval("document.querySelectorAll('.dtp-contrast-row').length");
  if (!found) throw new Error('the audit found no contrast rows on the demo page');
  const size = await popupPng(popup, 'popup-a11y.png', '#meta-panel');
  await page.screenshot({ path: path.join(WORK, 'page-a11y.png') });
  await popup.close();
  await compose('05-accessibility', 'An accessibility audit that points at each problem', 'page-a11y.png', { file: 'popup-a11y.png', ...size });
}

// ── Promo tiles ──────────────────────────────────────────────────────────
const iconsSource = fs.readFileSync(path.join(repo, 'utils/icons.ts'), 'utf8');
const icons = [...iconsSource.matchAll(/svg\('(.*)'\),/g)].map(m => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${m[1]}</svg>`);
const font = "-apple-system,'SF Pro Display','Avenir Next',system-ui,sans-serif";

async function tile(name, width, height, body) {
  fs.writeFileSync(path.join(WORK, `${name}.html`), `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;font-family:${font}">${body}</body>`);
  await composer.setViewportSize({ width, height });
  await composer.goto(`${ORIGIN}/work/${name}.html`, { waitUntil: 'load' });
  await sleep(200);
  const raw = path.join(WORK, `${name}-raw.png`);
  await composer.screenshot({ path: raw, type: 'png' });
  flatten(raw, path.join(OUT.promo, `${name}.png`));
}

await tile('promo-small-440x280', 440, 280, `
  <div style="box-sizing:border-box;height:100%;padding:30px 32px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 60%,#0f766e 100%);color:#fff">
    <div style="display:flex;align-items:center;gap:12px"><img src="/work/icon.png" width="46" height="46" style="border-radius:11px"><div style="font-size:30px;font-weight:700;letter-spacing:-0.4px">Brightbar DevTools</div></div>
    <div style="margin-top:14px;font-size:18px;line-height:1.35;color:#e0e7ff">CSS inspector, eyedropper, page ruler, grid overlay and accessibility checker</div>
    <div style="margin-top:16px;display:flex;gap:10px;color:#a5b4fc">${icons.slice(0, 9).join('')}</div>
    <div style="margin-top:14px;font-size:14px;font-weight:700;color:#6ee7b7">13 tools · every one free</div>
  </div>`);

await tile('promo-marquee-1400x560', 1400, 560, `
  <div style="box-sizing:border-box;height:100%;display:flex;align-items:center;gap:48px;padding:0 64px;background:radial-gradient(circle at 80% 20%,#4338ca 0%,#1e1b4b 55%,#0b1020 100%);color:#fff">
    <div style="flex:0 0 470px">
      <div style="display:flex;align-items:center;gap:14px"><img src="/work/icon.png" width="56" height="56" style="border-radius:13px"><div style="font-size:40px;font-weight:700;letter-spacing:-0.6px">Brightbar DevTools</div></div>
      <div style="margin-top:18px;font-size:30px;line-height:1.2;font-weight:650">Every page-inspection tool.<br>Every one free.</div>
      <div style="margin-top:16px;font-size:17px;line-height:1.5;color:#c7d2fe">No warning to install: it only touches the page you click it on.</div>
      <div style="margin-top:22px;display:flex;flex-wrap:wrap;gap:8px">
        ${['Works in iframes and shadow DOM', 'Live edit with undo', 'Copy as CSS or Tailwind', 'Accessibility audit'].map(t => `<span style="padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);font-size:14px">${t}</span>`).join('')}
      </div>
    </div>
    <div style="flex:1;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);background:#fff">
      <div style="height:26px;background:#e2e8f0;display:flex;align-items:center;gap:7px;padding:0 12px"><span style="width:10px;height:10px;border-radius:50%;background:#f87171"></span><span style="width:10px;height:10px;border-radius:50%;background:#fbbf24"></span><span style="width:10px;height:10px;border-radius:50%;background:#34d399"></span></div>
      <img src="/work/page-grid-overlay.png" style="display:block;width:100%">
    </div>
  </div>`);

await browser.close().catch(() => {});
proc.kill('SIGKILL');
server.close();
log('done; work files in', WORK);
