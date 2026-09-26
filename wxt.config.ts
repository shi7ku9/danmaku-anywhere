import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'Danmaku',
    description: 'Bullet comments on any website.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab'],
    commands: {
      'toggle-danmaku': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Toggle danmaku on the current page',
      },
    },
  },
});
