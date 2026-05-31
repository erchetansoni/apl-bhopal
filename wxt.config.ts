import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['*://*.linkedin.com/*']
  }
});
