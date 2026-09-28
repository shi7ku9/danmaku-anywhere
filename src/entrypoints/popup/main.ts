import { browser } from 'wxt/browser';
import type { Message, Status } from '../../core/messages';
import type { Settings } from '../../core/types';
import { deleteEntry, getSettings, listEntries, setOffset, settingsItem } from '../../storage/store';
import { createOffsetSender, parseOffsetInput } from './offset';

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
let offset = createOffsetSender(0, async () => {});

/**
 * Takes a fresh status. When the page's key changed (e.g. the site moved to the
 * next video), the offset sender restarts from the new page's offset; each
 * sender only ever writes to the key it was created for.
 */
function adopt(next: Status | null): void {
  if (next?.urlKey !== status?.urlKey) {
    const key = next?.urlKey;
    offset = createOffsetSender(next?.entry?.offset ?? 0, async (value) => {
      // Written here, under the library lock shared with import windows; the
      // page's content script picks it up through storage.onChanged.
      if (key) await setOffset(key, value);
      adopt(await send({ type: 'getStatus' }));
      renderStatus();
    });
  } else if (next?.entry) {
    offset.sync(next.entry.offset);
  }
  status = next;
}

/** Re-reads the page before acting, in case the site navigated while the popup was open. */
async function refresh(): Promise<void> {
  adopt(await send({ type: 'getStatus' }));
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
  const mode = $('mode');
  const entry = status?.entry ?? null;

  $('page-card').classList.toggle('disabled', !status);
  if (!status) {
    $('page').textContent = isRestricted(tabUrl) ? 'Not available on this page' : 'Reload the page to use danmaku';
    $('page-meta').textContent = '';
  } else if (entry) {
    $('page').textContent = entry.fileName;
    $('page').title = entry.fileName;
    $('page-meta').textContent = `${entry.count} comments`;
  } else {
    $('page').textContent = 'No danmaku for this page';
    $('page-meta').textContent = 'Import a Bilibili XML or JSON file';
  }

  toggle.disabled = !entry;
  toggle.checked = status?.enabled ?? false;
  importButton.disabled = !status;
  // Importing is the main action until the page has danmaku.
  importButton.classList.toggle('primary', !!status && !entry);

  mode.hidden = !status?.enabled;
  mode.textContent = status?.mode === 'video' ? 'Video sync' : 'Loop';
  mode.classList.toggle('video', status?.mode === 'video');

  $('offset-row').hidden = !entry;
  // The local value leads while offset changes are still in flight.
  if (entry) $<HTMLInputElement>('offset').value = String(offset.value);
}

type NumericKey = { [K in keyof Settings]: number extends Settings[K] ? K : never }[keyof Settings];

const SLIDERS = {
  opacity: (v: number) => `${Math.round(v * 100)}%`,
  fontScale: (v: number) => `${v.toFixed(1)}×`,
  speed: (v: number) => `${v} s`,
} satisfies Partial<Record<NumericKey, (v: number) => string>>;

let settingsTimer: ReturnType<typeof setTimeout> | undefined;

/** Live-previews while dragging at most every 100 ms, and always saves the final value. */
function saveSettings(settings: Settings, final: boolean): void {
  if (!final && settingsTimer !== undefined) return;
  clearTimeout(settingsTimer);
  void settingsItem.setValue({ ...settings });
  settingsTimer = final ? undefined : setTimeout(() => {
    settingsTimer = undefined;
    void settingsItem.setValue({ ...settings });
  }, 100);
}

async function initSettings(): Promise<void> {
  const settings = await getSettings();
  for (const [key, format] of Object.entries(SLIDERS) as [NumericKey, (v: number) => string][]) {
    const input = $<HTMLInputElement>(key);
    const output = $(`${key}-value`);
    const paint = () => {
      output.textContent = format(settings[key]);
      // Chrome has no range progress pseudo-element; the track gradient reads this.
      const fill = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      input.style.setProperty('--fill', `${fill * 100}%`);
    };
    input.value = String(settings[key]);
    paint();
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      paint();
      saveSettings(settings, false);
    });
    input.addEventListener('change', () => saveSettings(settings, true));
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
    remove.className = 'delete';
    remove.textContent = '✕';
    remove.title = 'Delete';
    remove.setAttribute('aria-label', `Delete danmaku for ${entry.title || entry.urlKey}`);
    remove.addEventListener('click', async () => {
      await deleteEntry(entry.urlKey);
      if (entry.urlKey === status?.urlKey) {
        adopt(await send({ type: 'reload' }));
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
  await refresh();

  $('toggle').addEventListener('change', async () => {
    const enabled = $<HTMLInputElement>('toggle').checked;
    adopt(await send({ type: 'setEnabled', enabled, urlKey: status?.urlKey }));
    renderStatus();
  });

  $('import').addEventListener('click', async () => {
    await refresh();
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

  $('offset').addEventListener('change', async () => {
    const value = parseOffsetInput($<HTMLInputElement>('offset').value);
    const typedFor = status?.urlKey;
    await refresh();
    // Apply only to the page it was typed for; an empty field just restores the value.
    if (value !== null && status?.entry && status.urlKey === typedFor) void offset.set(value);
    renderStatus();
  });
  const step = async (delta: number) => {
    await refresh();
    if (!status?.entry) return;
    void offset.add(delta);
    renderStatus();
  };
  $('offset-minus').addEventListener('click', () => void step(-1));
  $('offset-plus').addEventListener('click', () => void step(1));

  await initSettings();
  await renderLibrary();
}

void main();
