import { browser } from 'wxt/browser';
import type { Message } from '../../core/messages';
import { parseDanmaku } from '../../core/parse';
import { ParseError } from '../../core/types';
import { addDanmaku } from '../../storage/store';
import { pickDroppedFile } from './drop';

const params = new URLSearchParams(location.search);
// Opened for a page (with its URL key), or from the library's "Add file…" (without),
// which only saves the file.
const urlKey = params.get('urlKey') ?? '';
const tabId = Number(params.get('tabId'));
const title = params.get('title') ?? '';

const input = document.getElementById('file') as HTMLInputElement;
const message = document.getElementById('message')!;
document.getElementById('target')!.textContent = urlKey ? title || urlKey : 'the library';

function show(text: string, isError = false): void {
  message.textContent = text;
  message.className = isError ? 'error' : '';
}

let busy = false;

async function importFile(file: File, note = ''): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const { comments, skipped } = parseDanmaku(await file.text());
    // A page's previous danmaku stays in the library, so replacing its binding needs no confirmation.
    await addDanmaku({ fileName: file.name }, comments, urlKey ? { urlKey, title } : undefined);
    if (urlKey) {
      // The tab may have been closed meanwhile; the data is saved either way.
      await browser.tabs.sendMessage(tabId, { type: 'reload' } satisfies Message).catch(() => {});
    }
    show(`Imported ${comments.length}, skipped ${skipped}.${urlKey ? '' : ' Added to the library.'}${note}`);
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    show(err instanceof ParseError ? err.message : `Could not save: ${String(err)}`, true);
  } finally {
    busy = false;
    input.value = '';
  }
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file) void importFile(file);
});

// Dragging a file in works even where the native file chooser is broken.
// Every drop is intercepted so a missed target never navigates away from this page.
let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (++dragDepth === 1) document.body.classList.add('dragging');
});
document.addEventListener('dragleave', () => {
  if (--dragDepth === 0) document.body.classList.remove('dragging');
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const picked = pickDroppedFile(e.dataTransfer);
  if (!picked) {
    show('Drop a .xml or .json file.', true);
    return;
  }
  void importFile(picked.file, picked.extra > 0 ? ` Only ${picked.file.name} was imported.` : '');
});
