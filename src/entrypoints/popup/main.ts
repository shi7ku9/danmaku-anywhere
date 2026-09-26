import { browser } from 'wxt/browser';
import type { Message, Status } from '../../core/messages';
import type { Settings } from '../../core/types';
import { deleteEntry, getSettings, listEntries, settingsItem } from '../../storage/store';
import { createOffsetSender } from './offset';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Web pages where browsers never run extension content scripts. */
const RESTRICTED = [
  /^https:\/\/chromewebstore\.google\.com\//,
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^https:\/\/addons\.mozilla\.org\//,
];

let tabId: number | undefined;
let tabUrl: string | undefined;
let status: Status | null = null;
let offset = createOffsetSender(0, sendOffset);

async function sendOffset(value: number): Promise<void> {
  status = await send({ type: 'setOffset', offset: value });
  renderStatus();
}

async function send(message: Message): Promise<Status | null> {
  if (tabId === undefined) return null;
  try {
    return ((await browser.tabs.sendMessage(tabId, message)) as Status | undefined) ?? null;
  } catch {
    return null; // No content script in this tab.
  }
}

function isRestricted(url: string | undefined): boolean {
  return !url || !/^(https?|file):/.test(url) || RESTRICTED.some((r) => r.test(url));
}

function renderStatus(): void {
  const toggle = $<HTMLInputElement>('toggle');
  const importButton = $<HTMLButtonElement>('import');
  if (!status) {
    $('page').textContent = isRestricted(tabUrl)
      ? "Danmaku isn't available on this page."
      : 'Reload the page to use danmaku.';
    toggle.disabled = true;
    importButton.disabled = true;
    $('offset-row').hidden = true;
    $('mode').textContent = '';
    return;
  }
  const { entry } = status;
  $('page').textContent = entry
    ? `Loaded: ${entry.fileName} (${entry.count} comments)`
    : 'No danmaku for this page.';
  toggle.disabled = !entry;
  toggle.checked = status.enabled;
  importButton.disabled = false;
  $('mode').textContent = status.enabled ? `(${status.mode === 'video' ? 'video sync' : 'loop'})` : '';
  $('offset-row').hidden = !entry;
  // The local value leads while offset changes are still in flight.
  if (entry) $<HTMLInputElement>('offset').value = String(offset.value);
}

const SLIDERS = {
  opacity: (v: number) => `${Math.round(v * 100)}%`,
  fontScale: (v: number) => `${v.toFixed(1)}×`,
  speed: (v: number) => `${v}s`,
} satisfies Record<keyof Settings, (v: number) => string>;

async function initSettings(): Promise<void> {
  const settings = await getSettings();
  for (const [key, format] of Object.entries(SLIDERS) as [keyof Settings, (v: number) => string][]) {
    const input = $<HTMLInputElement>(key);
    const output = $(`${key}-value`);
    input.value = String(settings[key]);
    output.textContent = format(settings[key]);
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      output.textContent = format(settings[key]);
      void settingsItem.setValue({ ...settings });
    });
  }
}

async function renderLibrary(): Promise<void> {
  const entries = (await listEntries()).sort((a, b) => b.importedAt - a.importedAt);
  $('library-count').textContent = String(entries.length);
  const list = $('library');
  list.replaceChildren();
  for (const entry of entries) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('strong');
    title.textContent = entry.title || entry.urlKey;
    const key = document.createElement('span');
    key.className = 'muted';
    key.textContent = entry.urlKey;
    key.title = entry.urlKey;
    const file = document.createElement('span');
    file.className = 'muted';
    file.textContent = `${entry.fileName} · ${new Date(entry.importedAt).toLocaleDateString()}`;
    info.append(title, key, file);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      await deleteEntry(entry.urlKey);
      if (entry.urlKey === status?.urlKey) {
        status = await send({ type: 'reload' });
        renderStatus();
      }
      await renderLibrary();
    });

    li.append(info, remove);
    list.append(li);
  }
}

async function main(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  tabUrl = tab?.url;
  status = await send({ type: 'getStatus' });
  offset = createOffsetSender(status?.entry?.offset ?? 0, sendOffset);
  renderStatus();

  $('toggle').addEventListener('change', async () => {
    status = await send({ type: 'setEnabled', enabled: $<HTMLInputElement>('toggle').checked });
    renderStatus();
  });

  $('import').addEventListener('click', async () => {
    if (!status || tabId === undefined) return;
    const query = new URLSearchParams({ urlKey: status.urlKey, tabId: String(tabId), title: status.title });
    await browser.windows.create({
      url: `${browser.runtime.getURL('/import.html')}?${query}`,
      type: 'popup',
      width: 440,
      height: 260,
    });
    window.close();
  });

  $('offset').addEventListener('change', () => void offset.set(Number($<HTMLInputElement>('offset').value)));
  $('offset-minus').addEventListener('click', () => {
    void offset.add(-1);
    renderStatus();
  });
  $('offset-plus').addEventListener('click', () => {
    void offset.add(1);
    renderStatus();
  });

  await initSettings();
  await renderLibrary();
}

void main();
