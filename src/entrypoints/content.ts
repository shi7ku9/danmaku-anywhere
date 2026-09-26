import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Controller } from '../content/controller';
import type { Message } from '../core/messages';
import { getSettings, settingsItem } from '../storage/store';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    const controller = new Controller({
      getUrl: () => location.href,
      getTitle: () => document.title,
      // Native rAF: WXT's ctx wrapper adds an invalidation listener per call, which
      // leaks one listener per frame. Invalidation turns danmaku off, which cancels
      // the pending frame instead.
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    });
    void controller.start();

    // Single-page sites change the URL without reloading. The interval is a
    // fallback for navigations the event misses.
    ctx.addEventListener(window, 'wxt:locationchange', () => void controller.checkUrl());
    ctx.setInterval(() => void controller.checkUrl(), 1000);

    const unwatch = settingsItem.watch(() => {
      void getSettings().then((s) => controller.applySettings(s));
    });
    ctx.onInvalidated(() => {
      unwatch();
      controller.setEnabled(false);
    });

    const onStorageChanged = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => {
      if (area === 'local') void controller.onStorageChanged(changes);
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    ctx.onInvalidated(() => browser.storage.onChanged.removeListener(onStorageChanged));

    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      void controller.handleMessage(message).then(sendResponse);
      return true; // Keep the channel open for the async response.
    });
  },
});
