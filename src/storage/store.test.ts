import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Comment } from '../core/types';
import { deleteEntry, getEntry, getSettings, hasEntry, listEntries, saveEntry, setOffset } from './store';

const comments: Comment[] = [{ time: 1, text: 'a', mode: 'scroll', color: '#ffffff' }];
const meta = { urlKey: 'https://a.com/p?v=1', title: 'Page', fileName: 'a.xml' };

beforeEach(() => {
  fakeBrowser.reset();
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

  it('deletes the entry and its index row', async () => {
    await saveEntry(meta, comments);
    await deleteEntry(meta.urlKey);
    expect(await getEntry(meta.urlKey)).toBeNull();
    expect(await listEntries()).toEqual([]);
    expect(await hasEntry(meta.urlKey)).toBe(false);
  });
});
