import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Comment, type DanmakuEntry, type IndexEntry, type Settings } from '../core/types';

export const settingsItem = storage.defineItem<Settings>('local:settings', { fallback: DEFAULT_SETTINGS });
const indexItem = storage.defineItem<IndexEntry[]>('local:index', { fallback: [] });

type EntryKey = `local:danmaku:${string}`;
type OffsetKey = `local:offset:${string}`;
const entryKey = (urlKey: string): EntryKey => `local:danmaku:${urlKey}`;
/** Kept apart from the comments so an offset change is one small write that cannot clobber a new import. */
const offsetKey = (urlKey: string): OffsetKey => `local:offset:${urlKey}`;

/** Stored under `danmaku:<urlKey>`; older versions also stored the offset here. */
interface StoredComments {
  comments: Comment[];
  offset?: number;
}

let localQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs a library change (comments, offset and index together) exclusively. Web
 * Locks serialize the popup and every import window (they share the extension
 * origin); the local queue covers environments without them.
 */
function exclusive(run: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('danmaku-library', run).then(() => undefined);
  }
  const next = localQueue.then(run, run);
  localQueue = next;
  return next;
}

async function updateIndex(update: (index: IndexEntry[]) => IndexEntry[]): Promise<void> {
  await indexItem.setValue(update(await listEntries()));
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

export async function getEntry(urlKey: string): Promise<DanmakuEntry | null> {
  const [stored, offset] = await Promise.all([
    storage.getItem<StoredComments>(entryKey(urlKey)),
    storage.getItem<number>(offsetKey(urlKey)),
  ]);
  return stored ? { comments: stored.comments, offset: offset ?? stored.offset ?? 0 } : null;
}

/** Stores comments for a URL (replacing any existing entry) with a zero offset. */
export async function saveEntry(
  meta: { urlKey: string; title: string; fileName: string },
  comments: Comment[],
): Promise<void> {
  await exclusive(async () => {
    await storage.removeItem(offsetKey(meta.urlKey));
    await storage.setItem<StoredComments>(entryKey(meta.urlKey), { comments });
    await updateIndex((index) => [
      ...index.filter((e) => e.urlKey !== meta.urlKey),
      { ...meta, count: comments.length, importedAt: Date.now() },
    ]);
  });
}

export async function setOffset(urlKey: string, offset: number): Promise<void> {
  if (await hasEntry(urlKey)) await storage.setItem<number>(offsetKey(urlKey), offset);
}

export async function deleteEntry(urlKey: string): Promise<void> {
  await exclusive(async () => {
    await storage.removeItems([entryKey(urlKey), offsetKey(urlKey)]);
    await updateIndex((index) => index.filter((e) => e.urlKey !== urlKey));
  });
}
