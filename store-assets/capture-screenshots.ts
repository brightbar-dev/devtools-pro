/**
 * Capture CWS store screenshots for DevTools Pro.
 *
 * Usage:
 *   1. Build first: npm run build
 *   2. Run: npx playwright test store-assets/capture-screenshots.ts --headed
 *
 * Captures:
 *   - screenshot-03-tool-grid.png (popup, automated)
 *   - Overlay tool screenshots require manual activation (see instructions below)
 *
 * Manual overlay screenshot process:
 *   1. Run: npx playwright test store-assets/capture-screenshots.ts --headed --debug
 *   2. Browser opens with extension loaded on stripe.com
 *   3. Click the extension icon in the toolbar
 *   4. Click a tool (CSS Inspector, Color Picker, etc.)
 *   5. Hover over an interesting element on the page
 *   6. Use browser's built-in screenshot (Cmd+Shift+5 on Mac) or DevTools to capture
 *   7. Crop/resize to 1280x800
 */

import { test, chromium } from '@playwright/test';
import path from 'node:path';

const EXTENSION_PATH = path.resolve(__dirname, '../.output/chrome-mv3');
const SCREENSHOT_DIR = __dirname;

test('Capture tool grid popup', async () => {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
    ],
  });

  // Wait for service worker to register
  let extensionId = '';
  for (const sw of context.serviceWorkers()) {
    const url = sw.url();
    if (url.includes('chrome-extension://')) {
      extensionId = url.split('//')[1].split('/')[0];
    }
  }
  if (!extensionId) {
    const sw = await context.waitForEvent('serviceworker');
    extensionId = sw.url().split('//')[1].split('/')[0];
  }

  // Open popup as a full page (captures the tool grid)
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForTimeout(500);

  // Popup is ~350x450 naturally, but we screenshot at a size that shows it well
  await popupPage.setViewportSize({ width: 380, height: 520 });
  await popupPage.screenshot({
    path: path.join(SCREENSHOT_DIR, 'screenshot-03-tool-grid.png'),
    type: 'png',
  });

  await context.close();
});

test('Open browser for manual overlay screenshots', async () => {
  test.setTimeout(300_000); // 5 min to take screenshots

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
    ],
    viewport: { width: 1280, height: 800 },
  });

  // Open target pages for screenshots
  const pages = [
    'https://stripe.com',       // Good for CSS Inspector, Color Picker
    'https://github.com',       // Good for Accessibility, Page Meta
    'https://tailwindcss.com',  // Good for Font Detector, Spacing
  ];

  for (const url of pages) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }

  console.log('\n=== Manual Screenshot Instructions ===');
  console.log('Browser is open with the extension loaded.');
  console.log('Target pages: stripe.com, github.com, tailwindcss.com');
  console.log('');
  console.log('For each screenshot:');
  console.log('  1. Click the DevTools Pro extension icon');
  console.log('  2. Click a tool to activate it');
  console.log('  3. Hover over an element to show the overlay panel');
  console.log('  4. Take a screenshot (Cmd+Shift+5 on Mac)');
  console.log('  5. Save to store-assets/ as the correct filename');
  console.log('');
  console.log('Needed screenshots:');
  console.log('  screenshot-01-css-inspector.png (1280x800)');
  console.log('  screenshot-02-color-picker.png (1280x800)');
  console.log('  screenshot-04-spacing-boxmodel.png (1280x800)');
  console.log('  screenshot-05-accessibility.png (1280x800)');
  console.log('');
  console.log('Press Ctrl+C when done.');
  console.log('=====================================\n');

  // Keep browser open
  await new Promise(() => {});
});
