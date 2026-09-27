import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: ({ browser }) => ({
    name: 'Danmaku',
    description: 'Bullet comments on any website.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab'],
    // Firefox only: Chrome warns about unknown manifest keys.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'danmaku-anywhere@shi7ku9',
          // Danmaku stays in local storage; nothing is collected or sent anywhere.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
    commands: {
      'toggle-danmaku': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Toggle danmaku on the current page',
      },
    },
  }),
});
