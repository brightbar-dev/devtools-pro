// ExtPay content script — runs on extensionpay.com to relay payment notifications
// to the background service worker. Required by ExtPay for real-time payment detection.
import 'extpay';

export default defineContentScript({
  matches: ['https://extensionpay.com/*'],
  runAt: 'document_start',
  main() {
    // ExtPay's module-level code handles message relaying automatically
    // when imported. It listens for postMessage events from extensionpay.com
    // and forwards 'extpay-fetch-user' / 'extpay-trial-start' to background.
  },
});
