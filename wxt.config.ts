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
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
