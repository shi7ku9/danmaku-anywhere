import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { Message } from '../core/messages';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-danmaku') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    // Pages without the content script (restricted or pre-install) just ignore the shortcut.
    await browser.tabs.sendMessage(tab.id, { type: 'toggle' } satisfies Message).catch(() => {});
  });
});
