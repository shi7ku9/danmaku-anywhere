import { browser } from 'wxt/browser';
import type { Message } from '../../core/messages';
import { parseDanmaku } from '../../core/parse';
import { ParseError } from '../../core/types';
import { hasEntry, saveEntry } from '../../storage/store';

const params = new URLSearchParams(location.search);
const urlKey = params.get('urlKey') ?? '';
const tabId = Number(params.get('tabId'));
const title = params.get('title') ?? '';

const input = document.getElementById('file') as HTMLInputElement;
const message = document.getElementById('message')!;
document.getElementById('target')!.textContent = title || urlKey;

function show(text: string, isError = false): void {
  message.textContent = text;
  message.className = isError ? 'error' : '';
}

if (!urlKey) {
  input.disabled = true;
  show('Open this window from the extension popup.', true);
}

input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const { comments, skipped } = parseDanmaku(await file.text());
    if ((await hasEntry(urlKey)) && !confirm('This page already has danmaku. Replace it?')) {
      input.value = '';
      return;
    }
    await saveEntry({ urlKey, title, fileName: file.name }, comments);
    // The tab may have been closed meanwhile; the data is saved either way.
    await browser.tabs.sendMessage(tabId, { type: 'reload' } satisfies Message).catch(() => {});
    show(`Imported ${comments.length}, skipped ${skipped}.`);
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    show(err instanceof ParseError ? err.message : `Could not save: ${String(err)}`, true);
    input.value = '';
  }
});
