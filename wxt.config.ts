import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@brightbar-dev/wxt-extpay'],
  extpay: {
    extensionId: 'devtools-pro',
    priceDisplay: '$60',
    priceLabel: 'one-time',
    trialDays: 7,
  },
  manifest: {
    name: 'DevTools Pro',
    description: 'All-in-one developer toolkit: inspect CSS, detect fonts & colors, measure spacing, take screenshots, and more.',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
