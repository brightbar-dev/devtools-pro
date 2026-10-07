// Real-browser check of the Measure units and the gradient generator, against the built extension.
//
//   pnpm exec wxt build
//   PLAYWRIGHT=/path/to/playwright/index.mjs CHROME=/path/to/chrome node tests/e2e/measure-gradient.e2e.mjs
//
// Loads .output/chrome-mv3 into a fresh headless profile, clicks the toolbar icon for real
// (CDP Extensions.triggerAction, as store/capture/capture.mjs does), starts a tool from the popup, and
// reads and drives the inspector's closed shadow root over CDP (DOM.getDocument with pierce).
// Exits non-zero on the first failed check. Screenshots go to $SHOTS when set.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const CHROME = process.env.CHROME;
if (!CHROME) throw new Error('Set CHROME to a Chromium binary');
const EXT = path.join(repo, '.output/chrome-mv3');
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('Run `pnpm exec wxt build` first');
const SHOTS = process.env.SHOTS;

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'dtp-e2e-'));
// This Chromium has no CDP call to click the toolbar icon (Extensions.triggerAction, which store/capture
// uses with Chrome for Testing), so the activeTab grant is replaced by host access on a throwaway COPY of
// the build. Everything else is the shipped code: the same content script, injected and started with the
// same messages the popup sends. The shipped manifest is not touched.
const EXT_RUN = path.join(WORK, 'ext');
fs.cpSync(EXT, EXT_RUN, { recursive: true });
const manifestPath = path.join(EXT_RUN, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
const PORT = 9300 + Math.floor(Math.random() * 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0;
function check(name, ok, detail = '') {
  if (!ok) throw new Error(`FAIL ${name} ${detail}`);
  passed++;
  console.log(`ok   ${name}`);
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>units</title>
<style>html{font-size:16px}body{margin:0;font:20px sans-serif}#box{position:absolute;left:40px;top:60px;width:192px;height:96px;background:#fde68a}</style>
<div id="box">box</div>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(WORK, 'profile')}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-extension-debugging', `--load-extension=${EXT_RUN}`, '--headless=new', '--no-sandbox', '--window-size=1000,700', 'about:blank',
], { stdio: 'ignore' });
let browser;
for (let i = 0; i < 80 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(250); }
}
if (!browser) throw new Error('Could not reach the browser');
const bcdp = await browser.newBrowserCDPSession();
const ctx = browser.contexts()[0];
let extId;
for (let i = 0; i < 40 && !extId; i++) {
  const sw = (await bcdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
  extId = sw && new URL(sw.url).host;
  if (!extId) await sleep(250);
}
if (!extId) throw new Error('The extension did not load');

class RawTarget {
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return new RawTarget(ws);
  }
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.closed = false;
    ws.onmessage = e => { const m = JSON.parse(e.data); const w = m.id && this.pending.get(m.id); if (w) { this.pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result); } };
    ws.onclose = () => { this.closed = true; };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('closed'));
      const id = ++this.seq; this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}


const page = await ctx.newPage();
await page.setViewportSize({ width: 1000, height: 640 });
await page.goto(ORIGIN, { waitUntil: 'load' });
await page.bringToFront();
const pageCdp = await ctx.newCDPSession(page);

async function startTool(toolId) {
  const sw = ctx.serviceWorkers().find(w => w.url().includes(extId)) ?? await ctx.waitForEvent('serviceworker');
  const result = await sw.evaluate(async ([origin, tool]) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['/content-scripts/content.js'] });
    const replies = [];
    for (const { frameId } of frames) replies.push(await chrome.tabs.sendMessage(tab.id, { action: 'dtp:activate', toolId: tool }, { frameId }));
    return replies;
  }, [ORIGIN, toolId]);
  if (!result.some(r => r?.ok)) throw new Error(`${toolId} did not start: ${JSON.stringify(result)}`);
  await sleep(300);
}

// ── Reaching into the inspector's closed shadow root ────────────────────
async function shadowRoot() {
  const { root } = await pageCdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const find = n => (n.localName === 'dtp-inspector' ? n : (n.children ?? []).concat(n.shadowRoots ?? []).map(find).find(Boolean));
  const host = find(root);
  return host?.shadowRoots?.[0]?.nodeId;
}
async function sq(selector) {
  const nodeId = await shadowRoot();
  if (!nodeId) return null;
  const hit = await pageCdp.send('DOM.querySelector', { nodeId, selector });
  if (!hit.nodeId) return null;
  return (await pageCdp.send('DOM.resolveNode', { nodeId: hit.nodeId })).object.objectId;
}
async function on(selector, fn, ...args) {
  const objectId = await sq(selector);
  if (!objectId) throw new Error(`no ${selector} in the inspector`);
  const r = await pageCdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: fn, arguments: args.map(value => ({ value })), returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
  return r.result.value;
}
const text = sel => on(sel, 'function () { return this.textContent }');
const attr = (sel, name) => on(sel, 'function (n) { return this.getAttribute(n) }', name);
const countOf = async sel => {
  const nodeId = await shadowRoot();
  return (await pageCdp.send('DOM.querySelectorAll', { nodeId, selector: sel })).nodeIds.length;
};
const centre = sel => on(sel, 'function () { const r = this.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, width: r.width } }');
async function until(fn, timeout = 4000) {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(80)) { if (await fn().catch(() => false)) return true; }
  return false;
}
const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
const panelText = () => text('.panel');

try {
  // ── 1 · Measure units ─────────────────────────────────────────────────
  await startTool('rulers');
  await page.mouse.move(100, 100);
  check('Measure shows the hovered size in px', await until(async () => /Width192px/.test(await panelText())), await panelText().catch(() => ''));

  const seen = {};
  for (const unit of ['rem', 'em', 'pt', 'cm']) {
    await page.keyboard.press('u');
    check(`U cycles to ${unit}`, await until(async () => (await text('.tb-action[data-action="unit"]')) === `Unit: ${unit}`));
    await until(async () => new RegExp(`Width[\\d.]+${unit}`).test(await panelText()));
    seen[unit] = await panelText();
  }
  check('rem is against the 16px root: 192px = 12rem', /Width12rem/.test(seen.rem), seen.rem);
  check("em is against the element's 20px font: 192px = 9.6em", /Width9\.6em/.test(seen.em), seen.em);
  check('pt: 192px = 144pt', /Width144pt/.test(seen.pt), seen.pt);
  check('cm: 192px = 5.08cm, 96px = 2.54cm', /Width5\.08cm/.test(seen.cm) && /Height2\.54cm/.test(seen.cm), seen.cm);
  check('the panel says what em is relative to', /1em = 20px \(this element's font size\)/.test(seen.em), seen.em);
  await shot('measure-cm.png');

  // drag ruler label in the chosen unit
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(396, 348, { steps: 5 });
  await page.mouse.up();
  const rulerLabel = await until(async () => /^2\.54 × 1\.27cm$/.test(await text('.dw-ruler-label')));
  check('a 96 × 48px drag reads 2.54 × 1.27cm', rulerLabel, await text('.dw-ruler-label').catch(() => ''));

  // persistence: leave the page and start the tool again
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'load' });
  await startTool('rulers');
  await page.mouse.move(100, 100);
  check('the unit persists across reloads', await until(async () => (await text('.tb-action[data-action="unit"]')) === 'Unit: cm'), await text('.tb-bar').catch(() => ''));
  check('and is applied to the panel', await until(async () => /Width5\.08cm/.test(await panelText())));
  for (const _ of ['mm', 'in', 'px']) await page.keyboard.press('u');
  check('cycling past in wraps back to px (stored for next time)', await until(async () => (await text('.tb-action[data-action="unit"]')) === 'Unit: px'));
  await page.keyboard.press('Escape');

  // ── 2 · Gradient generator ───────────────────────────────────────────
  await page.reload({ waitUntil: 'load' });
  await startTool('color-picker');
  await page.mouse.move(100, 100);
  await sleep(300);
  await page.keyboard.press('g');
  check('G opens the gradient generator', await until(async () => (await countOf('[data-gr-handle]')) === 2));
  check('with a live preview painted', /linear-gradient\(90deg/.test(await on('[data-gr-preview]', 'function () { return this.style.backgroundImage }')));
  check('and the CSS ready to copy', /^background-image: linear-gradient\(90deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\);$/.test(await text('[data-gr-css]')), await text('[data-gr-css]'));

  // keyboard-operable stops
  await on('[data-gr-handle]', 'function () { this.focus() }');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  check('→ moves the focused stop 1% each', (await attr('[data-gr-handle]', 'aria-valuenow')) === '5');
  await page.keyboard.press('Shift+ArrowRight');
  check('Shift+→ moves it 10%', (await attr('[data-gr-handle]', 'aria-valuenow')) === '15');
  await page.keyboard.press('End');
  const endText = await text('[data-gr-css]');
  check('End sends it to 100% and the CSS follows', / 100%, #[0-9a-f]{6} 100%\);$/.test(endText), endText);
  await page.keyboard.press('Home');
  check('Home sends it back to 0%', / 0%, #[0-9a-f]{6} 100%\);$/.test(await text('[data-gr-css]')));

  // add / remove
  await on('[data-gr-add]', 'function () { this.click() }');
  check('Add stop adds a third stop in the widest gap', await until(async () => (await countOf('[data-gr-handle]')) === 3));
  const active = await on('.gradient-editor', 'function () { return this.getRootNode().activeElement?.getAttribute("aria-valuenow") }');
  check('the new stop has focus (50%)', active === '50', String(active));
  await page.keyboard.press('Delete');
  check('Delete removes the focused stop', await until(async () => (await countOf('[data-gr-handle]')) === 2));
  await page.keyboard.press('Delete');
  check('the last two stops cannot be removed', (await countOf('[data-gr-handle]')) === 2 && /at least two/.test(await text('[data-gr-status]')));

  // drag with the mouse
  const bar = await centre('[data-gr-bar]');
  const h = await centre('[data-gr-handle]');
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(bar.left + bar.width * 0.4, h.y, { steps: 6 });
  await page.mouse.up();
  const dragged = await attr('[data-gr-handle]', 'aria-valuenow');
  check('dragging a handle moves it (to about 40%)', Math.abs(Number(dragged) - 40) <= 3, dragged);

  // type and angle
  await on('[data-gr-angle][type="number"]', 'function () { this.focus(); this.select() }');
  await page.keyboard.type('45');
  check('angle 45deg is in the CSS', /linear-gradient\(45deg/.test(await text('[data-gr-css]')), await text('[data-gr-css]'));
  await on('[data-gr-type][value="radial"]', 'function () { this.click() }');
  check('Radial switches the output', await until(async () => /radial-gradient\(circle,/.test(await text('[data-gr-css]'))));
  check('and the Tailwind class', /^bg-\[radial-gradient\(circle,#[0-9a-f]{6}_\d+(\.\d)?%,#[0-9a-f]{6}_100%\)\]$/.test(await text('[data-gr-tw]')), await text('[data-gr-tw]'));
  await on('[data-gr-copy="css"]', 'function () { this.click() }');
  check('Copy CSS reports success or a clear refusal', await until(async () => /Copied CSS|Copy blocked/.test(await text('[data-gr-status]'))));
  await shot('gradient-radial.png');
  await on('[data-gr-type][value="linear"]', 'function () { this.click() }');
  await until(async () => /linear-gradient/.test(await text('[data-gr-css]')));
  await shot('gradient-linear.png');

  console.log(`\n${passed} checks passed`);
} finally {
  proc.kill();
  server.close();
}
process.exit(0);
