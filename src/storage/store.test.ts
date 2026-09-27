import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Comment } from '../core/types';
import { deleteEntry, getEntry, getSettings, hasEntry, listEntries, saveEntry, setOffset } from './store';

const comments: Comment[] = [{ time: 1, text: 'a', mode: 'scroll', color: '#ffffff' }];
const meta = { urlKey: 'https://a.com/p?v=1', title: 'Page', fileName: 'a.xml' };

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing fields with defaults', async () => {
    await storage.setItem('local:settings', { opacity: 0.5 });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, opacity: 0.5 });
  });
});

describe('entries', () => {
  it('saves comments with a zero offset and indexes them', async () => {
    await saveEntry(meta, comments);
    expect(await getEntry(meta.urlKey)).toEqual({ offset: 0, comments });
    const [index] = await listEntries();
    expect(index).toMatchObject({ ...meta, count: 1 });
    expect(typeof index?.importedAt).toBe('number');
    expect(await hasEntry(meta.urlKey)).toBe(true);
  });

  it('replaces an existing entry for the same URL', async () => {
    await saveEntry(meta, comments);
    await setOffset(meta.urlKey, 3);
    await saveEntry({ ...meta, fileName: 'b.json' }, [...comments, ...comments]);
    expect(await listEntries()).toHaveLength(1);
    expect((await listEntries())[0]).toMatchObject({ fileName: 'b.json', count: 2 });
    expect((await getEntry(meta.urlKey))?.offset).toBe(0);
  });

  it('persists the offset', async () => {
    await saveEntry(meta, comments);
    await setOffset(meta.urlKey, -2.5);
    expect((await getEntry(meta.urlKey))?.offset).toBe(-2.5);
  });

  it('never writes old comments back when an offset change races a replacing import', async () => {
    await saveEntry(meta, comments);
    const fresh: Comment[] = [{ time: 9, text: 'new', mode: 'scroll', color: '#ffffff' }];
    await Promise.all([setOffset(meta.urlKey, 4), saveEntry({ ...meta, fileName: 'new.xml' }, fresh)]);
    expect((await getEntry(meta.urlKey))?.comments).toEqual(fresh);
  });

  it('stores the offset apart from the comments', async () => {
    await saveEntry(meta, comments);
    await setOffset(meta.urlKey, 2);
    expect(await storage.getItem(`local:offset:${meta.urlKey}`)).toBe(2);
    expect(await storage.getItem(`local:danmaku:${meta.urlKey}`)).toEqual({ comments });
  });

  it('reads entries saved with the offset inside', async () => {
    await saveEntry(meta, comments);
    await storage.setItem(`local:danmaku:${meta.urlKey}`, { offset: 3, comments });
    expect((await getEntry(meta.urlKey))?.offset).toBe(3);
  });

  it('ignores an offset for a missing entry', async () => {
    await setOffset('https://none.com/', 1);
    expect(await getEntry('https://none.com/')).toBeNull();
  });

  it('keeps every index row when saves run concurrently', async () => {
    const other = { ...meta, urlKey: 'https://b.com/' };
    await Promise.all([saveEntry(meta, comments), saveEntry(other, comments)]);
    expect((await listEntries()).map((e) => e.urlKey).sort()).toEqual(['https://a.com/p?v=1', 'https://b.com/']);
  });

  it('removes every index row when deletes run concurrently', async () => {
    const other = { ...meta, urlKey: 'https://b.com/' };
    await saveEntry(meta, comments);
    await saveEntry(other, comments);
    await Promise.all([deleteEntry(meta.urlKey), deleteEntry(other.urlKey)]);
    expect(await listEntries()).toEqual([]);
  });

  it('stays consistent when a replacing import and a delete of the same URL overlap', async () => {
    await saveEntry(meta, comments);
    // Hold the import right after its comments are written, as a slow storage reply would.
    const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
      await set(items);
      if (`danmaku:${meta.urlKey}` in items) await gate;
    });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const importing = saveEntry({ ...meta, fileName: 'new.json' }, comments);
    await flush();
    const deleting = deleteEntry(meta.urlKey);
    await flush();
    release();
    await Promise.all([importing, deleting]);
    expect(await hasEntry(meta.urlKey)).toBe((await getEntry(meta.urlKey)) !== null);
  });

  it('deletes the entry and its index row', async () => {
    await saveEntry(meta, comments);
    await setOffset(meta.urlKey, 1);
    await deleteEntry(meta.urlKey);
    expect(await getEntry(meta.urlKey)).toBeNull();
    expect(await storage.getItem(`local:offset:${meta.urlKey}`)).toBeNull();
    expect(await listEntries()).toEqual([]);
    expect(await hasEntry(meta.urlKey)).toBe(false);
  });
});
