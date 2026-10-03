import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { type Comment, DEFAULT_SETTINGS } from '../core/types';
import {
  addDanmaku,
  bindPage,
  deleteDanmaku,
  getBindings,
  getPageDanmaku,
  getSettings,
  listLibrary,
  renameDanmaku,
  setPageOffset,
  unbindPage,
} from './store';

const comments: Comment[] = [{ time: 1, text: 'a', mode: 'scroll', color: '#ffffff' }];

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

describe('library', () => {
  const A = 'https://a.com/watch?v=1';
  const B = 'https://b.com/ep1';
  const more: Comment[] = [...comments, { time: 5, text: 'b', mode: 'top', color: '#ff0000' }];

  it('saves a danmaku under its own id, named after the file', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments);
    const [row] = await listLibrary();
    expect(row).toMatchObject({ id, name: 'a.xml', fileName: 'a.xml', count: 1 });
    expect(typeof row?.addedAt).toBe('number');
    expect(await storage.getItem(`local:danmaku:${id}`)).toEqual({ comments });
    expect(await getBindings()).toEqual({});
  });

  it('gives every danmaku its own id, even for the same file', async () => {
    const first = await addDanmaku({ fileName: 'a.xml' }, comments);
    const second = await addDanmaku({ fileName: 'a.xml' }, comments);
    expect(first).not.toBe(second);
    expect(await listLibrary()).toHaveLength(2);
  });

  it('binds a page when adding for it, with offset 0', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'Page A' });
    expect((await getBindings())[A]).toEqual({ danmakuId: id, offset: 0, title: 'Page A' });
    expect(await getPageDanmaku(A)).toEqual({ id, name: 'a.xml', offset: 0, comments });
  });

  it('has no danmaku for a page without a binding', async () => {
    await addDanmaku({ fileName: 'a.xml' }, comments);
    expect(await getPageDanmaku(A)).toBeNull();
  });

  it('has no danmaku when the bound comments are missing', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await storage.removeItem(`local:danmaku:${id}`);
    expect(await getPageDanmaku(A)).toBeNull();
  });

  it('lets several pages share one danmaku, each with its own offset', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await bindPage(B, id, 'B');
    await setPageOffset(A, id, 2);
    await setPageOffset(B, id, -4);
    expect((await getPageDanmaku(A))?.offset).toBe(2);
    expect((await getPageDanmaku(B))?.offset).toBe(-4);
    expect(await listLibrary()).toHaveLength(1);
  });

  it('replaces a page binding with offset 0 and keeps the previous danmaku', async () => {
    const first = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await setPageOffset(A, first, 3);
    const second = await addDanmaku({ fileName: 'b.xml' }, more, { urlKey: A, title: 'A' });
    expect((await getBindings())[A]).toMatchObject({ danmakuId: second, offset: 0 });
    expect((await listLibrary()).map((e) => e.id)).toEqual([first, second]);
    expect(await getPageDanmaku(A)).toMatchObject({ id: second, comments: more });
  });

  it('keeps the offset when binding the danmaku a page already uses', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await setPageOffset(A, id, 3);
    await bindPage(A, id, 'A');
    expect((await getBindings())[A]).toMatchObject({ offset: 3 });
  });

  it('ignores binding a danmaku that is gone', async () => {
    await bindPage(A, 'missing', 'A');
    expect(await getBindings()).toEqual({});
  });

  it('unbinds only that page', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await bindPage(B, id, 'B');
    await unbindPage(A);
    expect(Object.keys(await getBindings())).toEqual([B]);
    expect(await listLibrary()).toHaveLength(1);
    await unbindPage('https://none.com/');
    expect(Object.keys(await getBindings())).toEqual([B]);
  });

  it('renames a danmaku, trimming, and ignores an empty name', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments);
    await renameDanmaku(id, '  Episode 1  ');
    expect((await listLibrary())[0]).toMatchObject({ name: 'Episode 1', fileName: 'a.xml' });
    await renameDanmaku(id, '   ');
    expect((await listLibrary())[0]?.name).toBe('Episode 1');
  });

  it('deletes a danmaku with its comments and every binding to it, leaving others', async () => {
    const gone = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    await bindPage(B, gone, 'B');
    const kept = await addDanmaku({ fileName: 'b.xml' }, more, { urlKey: 'https://c.com/', title: 'C' });
    await deleteDanmaku(gone);
    expect((await listLibrary()).map((e) => e.id)).toEqual([kept]);
    expect(Object.keys(await getBindings())).toEqual(['https://c.com/']);
    expect(await storage.getItem(`local:danmaku:${gone}`)).toBeNull();
    expect(await getPageDanmaku(A)).toBeNull();
  });

  it('ignores an offset for a page without a binding', async () => {
    await setPageOffset(A, 'x', 1);
    expect(await getBindings()).toEqual({});
  });

  it('ignores an offset meant for a danmaku the page no longer uses', async () => {
    const first = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    const second = await addDanmaku({ fileName: 'b.xml' }, comments, { urlKey: A, title: 'A' });
    await setPageOffset(A, first, 2); // A write that was queued before the page switched danmaku.
    expect((await getBindings())[A]).toMatchObject({ danmakuId: second, offset: 0 });
    await setPageOffset(A, second, 2);
    expect((await getBindings())[A]).toMatchObject({ danmakuId: second, offset: 2 });
  });

  it('keeps every row when adds run concurrently', async () => {
    await Promise.all([
      addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' }),
      addDanmaku({ fileName: 'b.xml' }, comments, { urlKey: B, title: 'B' }),
      addDanmaku({ fileName: 'c.xml' }, comments),
    ]);
    expect((await listLibrary()).map((e) => e.fileName).sort()).toEqual(['a.xml', 'b.xml', 'c.xml']);
    expect(Object.keys(await getBindings()).sort()).toEqual([A, B]);
  });

  it('removes every row when deletes run concurrently', async () => {
    const first = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    const second = await addDanmaku({ fileName: 'b.xml' }, comments, { urlKey: B, title: 'B' });
    await Promise.all([deleteDanmaku(first), deleteDanmaku(second)]);
    expect(await listLibrary()).toEqual([]);
    expect(await getBindings()).toEqual({});
  });

  it('never leaves a binding to a deleted danmaku when a bind and a delete overlap', async () => {
    const id = await addDanmaku({ fileName: 'a.xml' }, comments);
    await Promise.all([bindPage(A, id, 'A'), deleteDanmaku(id)]);
    const bound = Object.values(await getBindings()).filter((b) => b.danmakuId === id);
    const exists = (await listLibrary()).some((e) => e.id === id);
    expect(bound.length > 0).toBe(exists);
  });

  it('does not let an offset write straddle a rebind', async () => {
    const first = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
    const second = await addDanmaku({ fileName: 'b.xml' }, comments);
    // Hold the offset write right after it has read the bindings.
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(async (keys) => {
      const result = await get(keys);
      if (!held && JSON.stringify(keys).includes('bindings')) {
        held = true;
        await gate;
      }
      return result;
    });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const offsetting = setPageOffset(A, first, 4);
    await flush();
    const rebinding = bindPage(A, second, 'A');
    await flush();
    release();
    await Promise.all([offsetting, rebinding]);
    // Serialized: the offset lands on the first danmaku, then the rebind resets it.
    expect((await getBindings())[A]).toMatchObject({ danmakuId: second, offset: 0 });
    expect(first).not.toBe(second);
  });

  describe('write order', () => {
    /** The storage keys written or removed, in order. */
    const record = () => {
      const keys: string[] = [];
      const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
      const remove = fakeBrowser.storage.local.remove.bind(fakeBrowser.storage.local);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
        keys.push(...Object.keys(items).map((k) => (k.startsWith('danmaku:') ? 'comments' : k)));
        await set(items);
      });
      vi.spyOn(fakeBrowser.storage.local, 'remove').mockImplementation(async (k) => {
        const removed: string[] = Array.isArray(k) ? k : [k];
        keys.push(...removed.map((x) => (x.startsWith('danmaku:') ? 'comments' : x)));
        await remove(k);
      });
      return keys;
    };

    it('adds comments first, then the library row, then the binding', async () => {
      const keys = record();
      await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
      expect(keys).toEqual(['comments', 'library', 'bindings']);
    });

    it('deletes the bindings first, then the library row, then the comments', async () => {
      const id = await addDanmaku({ fileName: 'a.xml' }, comments, { urlKey: A, title: 'A' });
      const keys = record();
      await deleteDanmaku(id);
      expect(keys).toEqual(['bindings', 'library', 'comments']);
    });
  });
});
