import { storage } from 'wxt/utils/storage';
import {
  type Binding,
  type Bindings,
  type Comment,
  type DanmakuEntry,
  DEFAULT_SETTINGS,
  type IndexEntry,
  type LibraryEntry,
  type PageDanmaku,
  type Settings,
} from '../core/types';

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

/**
 * Runs under the library lock so it cannot straddle an import (which resets the
 * offset) or a delete. Call it from extension pages, which share that lock.
 */
export async function setOffset(urlKey: string, offset: number): Promise<void> {
  await exclusive(async () => {
    if (await hasEntry(urlKey)) await storage.setItem<number>(offsetKey(urlKey), offset);
  });
}

export async function deleteEntry(urlKey: string): Promise<void> {
  await exclusive(async () => {
    await storage.removeItems([entryKey(urlKey), offsetKey(urlKey)]);
    await updateIndex((index) => index.filter((e) => e.urlKey !== urlKey));
  });
}

// The library: danmaku saved by id, and bindings from pages to them. Writes keep an
// order in which nothing ever points at data that is not there yet (or any more):
// adding saves comments, then the row, then the binding; deleting does the reverse.

const libraryItem = storage.defineItem<LibraryEntry[]>('local:library', { fallback: [] });
const bindingsItem = storage.defineItem<Bindings>('local:bindings', { fallback: {} });

type CommentsKey = `local:danmaku:${string}`;
const commentsKey = (id: string): CommentsKey => `local:danmaku:${id}`;

export function listLibrary(): Promise<LibraryEntry[]> {
  return libraryItem.getValue();
}

export function getBindings(): Promise<Bindings> {
  return bindingsItem.getValue();
}

/** The danmaku a page is bound to, or null if it has none (or its data is missing). */
export async function getPageDanmaku(urlKey: string): Promise<PageDanmaku | null> {
  const binding = (await getBindings())[urlKey];
  if (!binding) return null;
  const [library, stored] = await Promise.all([
    listLibrary(),
    storage.getItem<{ comments: Comment[] }>(commentsKey(binding.danmakuId)),
  ]);
  const row = library.find((e) => e.id === binding.danmakuId);
  if (!row || !stored) return null;
  return { id: row.id, name: row.name, offset: binding.offset, comments: stored.comments };
}

async function updateBindings(update: (bindings: Bindings) => Bindings): Promise<void> {
  await bindingsItem.setValue(update(await getBindings()));
}

async function updateLibrary(update: (library: LibraryEntry[]) => LibraryEntry[]): Promise<void> {
  await libraryItem.setValue(update(await listLibrary()));
}

/** Binds `urlKey` to a danmaku with offset 0; does nothing when it already uses it or it is gone. */
async function bind(urlKey: string, danmakuId: string, title: string): Promise<void> {
  const current = (await getBindings())[urlKey];
  if (current?.danmakuId === danmakuId) return;
  await updateBindings((all) => ({ ...all, [urlKey]: { danmakuId, offset: 0, title } satisfies Binding }));
}

/**
 * Saves a danmaku to the library, named after its file, and returns its id.
 * With `page` it is also bound to that page, replacing the page's binding.
 */
export async function addDanmaku(
  meta: { fileName: string },
  comments: Comment[],
  page?: { urlKey: string; title: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await exclusive(async () => {
    await storage.setItem(commentsKey(id), { comments });
    await updateLibrary((library) => [
      ...library,
      { id, name: meta.fileName, fileName: meta.fileName, count: comments.length, addedAt: Date.now() },
    ]);
    if (page) await bind(page.urlKey, id, page.title);
  });
  return id;
}

/** Uses an existing danmaku on a page; a danmaku deleted meanwhile is ignored. */
export async function bindPage(urlKey: string, danmakuId: string, title: string): Promise<void> {
  await exclusive(async () => {
    if ((await listLibrary()).some((e) => e.id === danmakuId)) await bind(urlKey, danmakuId, title);
  });
}

export async function unbindPage(urlKey: string): Promise<void> {
  await exclusive(async () => {
    if (!(urlKey in (await getBindings()))) return;
    await updateBindings(({ [urlKey]: _removed, ...rest }) => rest);
  });
}

/** Renames a danmaku; an empty name keeps the old one. */
export async function renameDanmaku(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await exclusive(async () => {
    await updateLibrary((library) => library.map((e) => (e.id === id ? { ...e, name: trimmed } : e)));
  });
}

/** Removes a danmaku and every binding to it. */
export async function deleteDanmaku(id: string): Promise<void> {
  await exclusive(async () => {
    await updateBindings((all) => Object.fromEntries(Object.entries(all).filter(([, b]) => b.danmakuId !== id)));
    await updateLibrary((library) => library.filter((e) => e.id !== id));
    await storage.removeItem(commentsKey(id));
  });
}

/** Sets a page's offset on its binding; a page without one is ignored. */
export async function setPageOffset(urlKey: string, offset: number): Promise<void> {
  await exclusive(async () => {
    const binding = (await getBindings())[urlKey];
    if (binding) await updateBindings((all) => ({ ...all, [urlKey]: { ...binding, offset } }));
  });
}
