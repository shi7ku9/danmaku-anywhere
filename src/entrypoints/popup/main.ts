import { browser } from 'wxt/browser';
import type { Message, Status } from '../../core/messages';
import { FONT_PRESETS, fontStack, textShadow } from '../../core/style';
import { DEFAULT_SETTINGS, type Settings } from '../../core/types';
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

const px = (v: number) => `${v} px`;
const SLIDERS = {
  opacity: (v: number) => `${Math.round(v * 100)}%`,
  fontScale: (v: number) => `${v.toFixed(1)}×`,
  speed: (v: number) => `${v} s`,
  outlineWidth: px,
  shadowBlur: px,
  shadowOffset: px,
  maxActive: (v: number) => String(v),
} satisfies Partial<Record<NumericKey, (v: number) => string>>;

const COLORS = ['outlineColor', 'shadowColor'] as const;
const SWATCHES = ['#000000', '#ffffff', '#808080', '#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#af52de'];
const HEX = /^#[0-9a-f]{6}$/i;

let settings: Settings = { ...DEFAULT_SETTINGS };
let settingsTimer: ReturnType<typeof setTimeout> | undefined;
/** Each control's function that shows the current settings. */
const syncs: (() => void)[] = [];

/** Live-previews while dragging at most every 100 ms, and always saves the final value. */
function saveSettings(final: boolean): void {
  renderAdvanced();
  if (!final && settingsTimer !== undefined) return;
  clearTimeout(settingsTimer);
  void settingsItem.setValue({ ...settings });
  settingsTimer = final ? undefined : setTimeout(() => {
    settingsTimer = undefined;
    void settingsItem.setValue({ ...settings });
  }, 100);
}

/** Shows only the controls for the current effect and styles the preview like the overlay. */
function renderAdvanced(): void {
  $('outline-group').hidden = settings.effect !== 'outline' && settings.effect !== 'both';
  $('shadow-group').hidden = settings.effect !== 'shadow' && settings.effect !== 'both';
  $('fontCustom').hidden = $<HTMLSelectElement>('fontFamily').value !== 'custom';
  const s = $('preview').style;
  s.opacity = String(settings.opacity);
  s.fontSize = `${20 * settings.fontScale}px`;
  s.fontFamily = fontStack(settings);
  s.fontWeight = String(settings.fontWeight);
  s.textShadow = textShadow(settings);
}

function bindSlider(key: NumericKey, format: (v: number) => string): void {
  const input = $<HTMLInputElement>(key);
  const output = $(`${key}-value`);
  const paint = () => {
    output.textContent = format(settings[key]);
    // Chrome has no range progress pseudo-element; the track gradient reads this.
    const fill = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty('--fill', `${fill * 100}%`);
  };
  syncs.push(() => {
    input.value = String(settings[key]);
    paint();
  });
  input.addEventListener('input', () => {
    settings[key] = Number(input.value);
    paint();
    saveSettings(false);
  });
  input.addEventListener('change', () => saveSettings(true));
}

function bindSegmented(group: HTMLElement): void {
  const key = group.dataset.key as 'effect' | 'fontWeight' | 'displayArea';
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
  const paint = () => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.value === String(settings[key])));
  };
  syncs.push(paint);
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const value = b.dataset.value!;
      Object.assign(settings, { [key]: typeof DEFAULT_SETTINGS[key] === 'number' ? Number(value) : value });
      paint();
      saveSettings(true);
    });
  }
}

/**
 * Swatches plus a hex field instead of `<input type="color">`: the native picker
 * opens its own window, which takes focus and closes the popup.
 */
function bindColor(key: (typeof COLORS)[number]): void {
  const input = $<HTMLInputElement>(key);
  const group = document.querySelector<HTMLElement>(`.swatches[data-key="${key}"]`)!;
  const buttons = SWATCHES.map((color) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.style.background = color;
    b.setAttribute('aria-label', color);
    b.addEventListener('click', () => {
      settings[key] = color;
      paint();
      saveSettings(true);
    });
    return b;
  });
  group.append(...buttons);
  const paint = () => {
    input.value = settings[key];
    input.removeAttribute('aria-invalid');
    for (const [i, b] of buttons.entries()) b.setAttribute('aria-checked', String(SWATCHES[i] === settings[key]));
  };
  syncs.push(paint);
  input.addEventListener('input', () => {
    const value = input.value.trim();
    input.setAttribute('aria-invalid', String(!HEX.test(value)));
    if (!HEX.test(value)) return;
    settings[key] = value.toLowerCase();
    for (const [i, b] of buttons.entries()) b.setAttribute('aria-checked', String(SWATCHES[i] === settings[key]));
    saveSettings(false);
  });
  // Leaving the field with an invalid value restores the saved color.
  input.addEventListener('change', () => {
    paint();
    saveSettings(true);
  });
}

function bindFont(): void {
  const select = $<HTMLSelectElement>('fontFamily');
  const custom = $<HTMLInputElement>('fontCustom');
  syncs.push(() => {
    const preset = Object.hasOwn(FONT_PRESETS, settings.fontFamily);
    select.value = preset ? settings.fontFamily : 'custom';
    custom.value = preset ? '' : settings.fontFamily;
  });
  select.addEventListener('change', () => {
    if (select.value !== 'custom') {
      settings.fontFamily = select.value;
      saveSettings(true);
    } else if (custom.value.trim()) {
      settings.fontFamily = custom.value.trim();
      saveSettings(true);
    } else {
      renderAdvanced();
      custom.focus();
    }
  });
  custom.addEventListener('change', () => {
    settings.fontFamily = custom.value.trim() || 'system';
    saveSettings(true);
  });
}

function syncControls(): void {
  for (const sync of syncs) sync();
  renderAdvanced();
}

async function initSettings(): Promise<void> {
  settings = await getSettings();
  for (const [key, format] of Object.entries(SLIDERS) as [NumericKey, (v: number) => string][]) bindSlider(key, format);
  for (const group of document.querySelectorAll<HTMLElement>('.segmented')) bindSegmented(group);
  for (const key of COLORS) bindColor(key);
  bindFont();
  $('reset').addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    syncControls();
    saveSettings(true);
  });
  syncControls();
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
