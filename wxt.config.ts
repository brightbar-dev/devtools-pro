import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'DevTools Pro',
    description: 'All-in-one developer toolkit: inspect CSS, detect fonts & colors, measure spacing, take screenshots, and more.',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
