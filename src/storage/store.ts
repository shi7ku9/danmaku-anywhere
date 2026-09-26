import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Comment, type DanmakuEntry, type IndexEntry, type Settings } from '../core/types';

export const settingsItem = storage.defineItem<Settings>('local:settings', { fallback: DEFAULT_SETTINGS });
const indexItem = storage.defineItem<IndexEntry[]>('local:index', { fallback: [] });

type EntryKey = `local:danmaku:${string}`;
const entryKey = (urlKey: string): EntryKey => `local:danmaku:${urlKey}`;

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
  const index = (await listEntries()).filter((e) => e.urlKey !== meta.urlKey);
  index.push({ ...meta, count: comments.length, importedAt: Date.now() });
  await indexItem.setValue(index);
}

export async function setOffset(urlKey: string, offset: number): Promise<void> {
  const entry = await getEntry(urlKey);
  if (entry) await storage.setItem<DanmakuEntry>(entryKey(urlKey), { ...entry, offset });
}

export async function deleteEntry(urlKey: string): Promise<void> {
  await storage.removeItem(entryKey(urlKey));
  await indexItem.setValue((await listEntries()).filter((e) => e.urlKey !== urlKey));
}
