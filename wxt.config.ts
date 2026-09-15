import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    // No host permissions: the inspector is injected with `scripting` into the one tab the
    // user opens the popup on, which `activeTab` grants. That keeps the install free of the
    // "read and change all your data on all websites" warning.
    permissions: ['activeTab', 'storage', 'scripting'],
  },
});
