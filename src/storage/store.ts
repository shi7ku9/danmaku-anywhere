import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Comment, type DanmakuEntry, type IndexEntry, type Settings } from '../core/types';

export const settingsItem = storage.defineItem<Settings>('local:settings', { fallback: DEFAULT_SETTINGS });
const indexItem = storage.defineItem<IndexEntry[]>('local:index', { fallback: [] });

type EntryKey = `local:danmaku:${string}`;
const entryKey = (urlKey: string): EntryKey => `local:danmaku:${urlKey}`;

let localIndexQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs an index read-modify-write exclusively. Web Locks serialize the popup and
 * every import window (they share the extension origin); the local queue covers
 * environments without them.
 */
function updateIndex(update: (index: IndexEntry[]) => IndexEntry[]): Promise<void> {
  const run = async () => indexItem.setValue(update(await listEntries()));
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('danmaku-index', run).then(() => undefined);
  }
  const next = localIndexQueue.then(run, run);
  localIndexQueue = next;
  return next;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export function listEntries(): Promise<IndexEntry[]> {
  return indexItem.getValue();
}

export async function hasEntry(urlKey: string): Promise<boolean> {
  return (await listEntries()).some((e) => e.urlKey === urlKey);
}

export function getEntry(urlKey: string): Promise<DanmakuEntry | null> {
  return storage.getItem<DanmakuEntry>(entryKey(urlKey));
}

/** Stores comments for a URL (replacing any existing entry) with a zero offset. */
export async function saveEntry(
  meta: { urlKey: string; title: string; fileName: string },
  comments: Comment[],
): Promise<void> {
  await storage.setItem<DanmakuEntry>(entryKey(meta.urlKey), { offset: 0, comments });
  await updateIndex((index) => [
    ...index.filter((e) => e.urlKey !== meta.urlKey),
    { ...meta, count: comments.length, importedAt: Date.now() },
  ]);
}

export async function setOffset(urlKey: string, offset: number): Promise<void> {
  const entry = await getEntry(urlKey);
  if (entry) await storage.setItem<DanmakuEntry>(entryKey(urlKey), { ...entry, offset });
}

export async function deleteEntry(urlKey: string): Promise<void> {
  await storage.removeItem(entryKey(urlKey));
  await updateIndex((index) => index.filter((e) => e.urlKey !== urlKey));
}
