import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type Comment, DEFAULT_SETTINGS } from '../core/types';
import {
  addDanmaku,
  bindPage,
  getBindings,
  listLibrary,
  renameDanmaku,
  setPageOffset,
  unbindPage,
} from '../storage/store';
import { Controller } from './controller';
import { videoId } from './video-finder';

const PAGE = 'https://a.com/p';
const comments: Comment[] = [
  { time: 0, text: 'a', mode: 'scroll', color: '#ffffff' },
  { time: 1, text: 'b', mode: 'scroll', color: '#ffffff' },
];

const OTHER = 'https://b.com/';

/** Saves a danmaku and binds it to a page. */
const seed = (urlKey: string, fileName: string, list: Comment[]) =>
  addDanmaku({ fileName }, list, { urlKey, title: `Title of ${urlKey}` });
/** The shape of a `bindings` storage change for one page. */
const bindingChange = (
  urlKey: string,
  before: { danmakuId: string; offset: number } | undefined,
  after: { danmakuId: string; offset: number } | undefined,
) => ({
  bindings: {
    oldValue: before ? { [urlKey]: { ...before, title: 'T' } } : {},
    newValue: after ? { [urlKey]: { ...after, title: 'T' } } : {},
  },
});

let url: string;
let pageId: string;
type RequestFrame = (cb: () => void) => number;
let requestFrame: ReturnType<typeof vi.fn<RequestFrame>>;
let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;
let frameId = 0;
let controller: Controller;

const drawn = () => document.querySelector('danmaku-overlay')?.shadowRoot?.querySelectorAll('.c').length ?? 0;

beforeEach(async () => {
  fakeBrowser.reset();
  pageId = await seed(PAGE, 'a.json', comments);
  url = `${PAGE}#top`;
  requestFrame = vi.fn<RequestFrame>(() => ++frameId);
  cancelFrame = vi.fn<(id: number) => void>();
  controller = new Controller({
    getUrl: () => url,
    getTitle: () => 'Title',
    requestFrame,
    cancelFrame,
    measure: () => 100,
  });
  await controller.start();
});

afterEach(() => {
  controller.setEnabled(false);
  vi.useRealTimers();
});

describe('Controller', () => {
  it('loads the entry for the page but stays off', () => {
    expect(controller.status()).toEqual({
      urlKey: PAGE,
      title: 'Title',
      entry: { id: pageId, name: 'a.json', count: 2, offset: 0 },
      enabled: false,
      mode: 'loop',
      videos: [],
      choice: 'auto',
      autoTargetId: null,
    });
  });

  it('toggle turns danmaku on and schedules frames', () => {
    controller.toggle();
    expect(controller.status().enabled).toBe(true);
    expect(requestFrame).toHaveBeenCalled();
  });

  it('toggle does nothing without an entry', async () => {
    url = 'https://b.com/';
    await controller.checkUrl();
    controller.toggle();
    expect(controller.status().enabled).toBe(false);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('draws comments in loop mode when there is no video', () => {
    controller.toggle();
    controller.tick();
    expect(controller.status().mode).toBe('loop');
    expect(drawn()).toBe(1);
  });

  it('turning off clears the overlay', () => {
    controller.toggle();
    controller.tick();
    controller.toggle();
    expect(drawn()).toBe(0);
    expect(document.querySelector('danmaku-overlay')).toBeNull();
  });

  it('turns off and loads the new entry when the URL changes', async () => {
    await seed(OTHER, 'b.xml', comments.slice(0, 1));
    controller.toggle();
    url = 'https://b.com/';
    await controller.checkUrl();
    expect(controller.status()).toMatchObject({
      urlKey: 'https://b.com/',
      enabled: false,
      entry: { name: 'b.xml', count: 1 },
    });
  });

  it('does not play or edit the old entry while the new URL loads', async () => {
    controller.toggle();
    url = 'https://b.com/';
    const pending = controller.checkUrl();
    controller.toggle();
    await controller.onStorageChanged(
      bindingChange(PAGE, { danmakuId: pageId, offset: 0 }, { danmakuId: pageId, offset: 5 }),
    );
    expect(controller.status()).toMatchObject({ enabled: false, entry: null });
    await pending;
  });

  it('ignores URL changes that normalize to the same key', async () => {
    controller.toggle();
    url = `${PAGE}?utm_source=x`;
    await controller.checkUrl();
    expect(controller.status().enabled).toBe(true);
  });

  it('reload picks up a new import and keeps the enabled state', async () => {
    controller.toggle();
    await seed(PAGE, 'new.xml', comments.slice(0, 1));
    const status = await controller.handleMessage({ type: 'reload' });
    expect(status).toMatchObject({ enabled: true, entry: { name: 'new.xml', count: 1 } });
  });

  it('reload turns off when the entry was deleted', async () => {
    controller.toggle();
    await fakeBrowser.storage.local.clear();
    const status = await controller.handleMessage({ type: 'reload' });
    expect(status).toMatchObject({ enabled: false, entry: null });
  });

  it('answers setEnabled and getStatus', async () => {
    expect(await controller.handleMessage({ type: 'setEnabled', enabled: true })).toMatchObject({ enabled: true });
    expect(await controller.handleMessage({ type: 'getStatus' })).toMatchObject({ enabled: true });
  });

  it('cancels the pending frame when turned off', () => {
    controller.toggle();
    const id = requestFrame.mock.results.at(-1)?.value;
    controller.toggle();
    expect(cancelFrame).toHaveBeenCalledWith(id);
  });

  it('loads a danmaku bound from another tab once its binding exists', async () => {
    url = OTHER;
    await controller.checkUrl();
    // Comments and the library row land first; their storage events must not decide the state.
    const id = await addDanmaku({ fileName: 'b.xml' }, comments);
    await controller.onStorageChanged({ library: { oldValue: [], newValue: await listLibrary() } });
    expect(controller.status().entry).toBeNull();
    await bindPage(OTHER, id, 'B');
    await controller.onStorageChanged(bindingChange(OTHER, undefined, { danmakuId: id, offset: 0 }));
    expect(controller.status()).toMatchObject({ entry: { id, name: 'b.xml', count: 2 } });
  });

  it('reloads when another danmaku is bound to its page', async () => {
    controller.toggle();
    controller.tick();
    const other = await addDanmaku({ fileName: 'other.xml' }, comments.slice(0, 1));
    await bindPage(PAGE, other, 'A');
    await controller.onStorageChanged(
      bindingChange(PAGE, { danmakuId: pageId, offset: 0 }, { danmakuId: other, offset: 0 }),
    );
    expect(controller.status()).toMatchObject({ enabled: true, entry: { id: other, name: 'other.xml', count: 1 } });
  });

  it('unloads when its page is unbound elsewhere', async () => {
    controller.toggle();
    await unbindPage(PAGE);
    await controller.onStorageChanged(bindingChange(PAGE, { danmakuId: pageId, offset: 0 }, undefined));
    expect(controller.status()).toMatchObject({ enabled: false, entry: null });
  });

  it('follows an offset change on its binding without reloading', async () => {
    controller.toggle();
    // With the data gone, a reload would unload the page; an in-place change keeps it.
    await fakeBrowser.storage.local.clear();
    await controller.onStorageChanged(
      bindingChange(PAGE, { danmakuId: pageId, offset: 0 }, { danmakuId: pageId, offset: 5 }),
    );
    expect(controller.status()).toMatchObject({ enabled: true, entry: { offset: 5, count: 2 } });
  });

  it('follows a rename of its danmaku without clearing the screen', async () => {
    controller.toggle();
    controller.tick();
    const before = await listLibrary();
    await renameDanmaku(pageId, 'Episode 1');
    // With the data gone, a reload would unload the page; an in-place rename keeps it.
    const after = await listLibrary();
    await fakeBrowser.storage.local.clear();
    await controller.onStorageChanged({ library: { oldValue: before, newValue: after } });
    expect(controller.status()).toMatchObject({ enabled: true, entry: { id: pageId, name: 'Episode 1' } });
    controller.tick();
    expect(drawn()).toBe(1); // The screen was not cleared.
  });

  it('ignores changes to other pages and other danmaku', async () => {
    controller.toggle();
    controller.tick();
    const mine = { danmakuId: pageId, offset: 0 };
    const theirs = { danmakuId: 'x', offset: 9 };
    await controller.onStorageChanged({
      bindings: {
        oldValue: { [PAGE]: { ...mine, title: 'A' } },
        newValue: { [PAGE]: { ...mine, title: 'A renamed' }, [OTHER]: { ...theirs, title: 'B' } },
      },
    });
    await controller.onStorageChanged({
      library: { oldValue: [], newValue: [{ id: 'x', name: 'Other', fileName: 'o.xml', count: 1, addedAt: 1 }] },
    });
    await controller.onStorageChanged({ [`danmaku:${pageId}`]: { oldValue: {}, newValue: {} } });
    expect(controller.status()).toMatchObject({ entry: { id: pageId, name: 'a.json', offset: 0 } });
    expect(drawn()).toBe(1);
  });

  it('keeps a separate offset per page that shares a danmaku', async () => {
    await bindPage(OTHER, pageId, 'B');
    await setPageOffset(PAGE, 2);
    await setPageOffset(OTHER, -4);
    await controller.reload();
    expect(controller.status().entry).toMatchObject({ id: pageId, offset: 2 });
    url = OTHER;
    await controller.checkUrl();
    expect(controller.status().entry).toMatchObject({ id: pageId, offset: -4 });
    expect((await getBindings())[PAGE]?.offset).toBe(2);
  });

  it('has no danmaku when the bound comments are missing', async () => {
    await fakeBrowser.storage.local.remove(`danmaku:${pageId}`);
    const status = await controller.handleMessage({ type: 'reload' });
    expect(status.entry).toBeNull();
  });

  it('keeps loop playback time when appearance settings change', async () => {
    // A comment at 30 s makes the loop 38 s long, so 20 s does not wrap.
    await seed(PAGE, 'a.json', [...comments, { time: 30, text: 'late', mode: 'scroll', color: '#ffffff' }]);
    await controller.reload();
    vi.useFakeTimers();
    controller.toggle();
    controller.tick();
    vi.advanceTimersByTime(20_000);
    controller.tick();
    controller.applySettings({ ...DEFAULT_SETTINGS, opacity: 0.5 });
    controller.tick();
    expect(drawn()).toBe(0); // t ≈ 20 s: both comments (0 s, 1 s) have crossed.
  });

  it('answers messages for the current URL even before the location event lands', async () => {
    url = 'https://b.com/';
    const status = await controller.handleMessage({ type: 'getStatus' });
    expect(status.urlKey).toBe('https://b.com/');
  });

  it('reaches every comment in loop mode with a negative offset', async () => {
    await seed(PAGE, 'a.json', [
      { time: 0, text: 'a', mode: 'scroll', color: '#ffffff' },
      { time: 10, text: 'b', mode: 'scroll', color: '#ffffff' },
    ]);
    await controller.reload();
    await setPageOffset(PAGE, -10);
    await controller.reload();
    vi.useFakeTimers();
    controller.toggle();
    controller.tick();
    vi.advanceTimersByTime(5000); // 18 s loop shifted by -10 s: position 13, comment at 10 s on screen.
    controller.tick();
    expect(drawn()).toBe(1);
  });

  it('waits for a load already in progress for the same URL', async () => {
    await seed(OTHER, 'b.xml', comments);
    url = OTHER;
    const navigating = controller.checkUrl();
    const status = await controller.handleMessage({ type: 'getStatus' });
    await navigating;
    expect(status.entry).toMatchObject({ name: 'b.xml' });
  });

  it('rejects changes meant for another page', async () => {
    const status = await controller.handleMessage({ type: 'setEnabled', enabled: true, urlKey: 'https://old.com/' });
    expect(status).toMatchObject({ urlKey: PAGE, enabled: false });
    await controller.handleMessage({ type: 'setEnabled', enabled: true, urlKey: PAGE });
    expect(controller.status().enabled).toBe(true);
  });

  it('ignores a reload that finishes after a newer one', async () => {
    // Let the older reload read its data, then hold it before it applies.
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const spy = vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(async (keys) => {
      const result = await get(keys);
      await gate;
      return result;
    });
    const older = controller.reload();
    await new Promise((r) => setTimeout(r, 0));
    spy.mockRestore();
    await fakeBrowser.storage.local.clear();
    await controller.reload();
    release();
    await older;
    expect(controller.status().entry).toBeNull();
  });

  it('answers a reload only once the newest overlapping reload has been applied', async () => {
    // A popup's reload message and the storage event for the same change both reload the page;
    // the message's reply must not be computed before the newer reload is in.
    const other = await addDanmaku({ fileName: 'other.xml' }, comments.slice(0, 1));
    await bindPage(PAGE, other, 'A');
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    const open = () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      return { gate, release };
    };
    let current = open();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(async (keys) => {
      const mine = current.gate;
      const result = await get(keys);
      await mine;
      return result;
    });
    const flush = () => new Promise((r) => setTimeout(r, 0));

    // The message's reload starts first and waits on its reads.
    const first = current;
    let replied = false;
    const reply = controller.handleMessage({ type: 'reload' }).then((status) => {
      replied = true;
      return status;
    });
    await flush();
    // The storage event starts a newer reload, whose reads wait on a second gate.
    current = open();
    const second = current;
    const changed = controller.onStorageChanged(
      bindingChange(PAGE, { danmakuId: pageId, offset: 0 }, { danmakuId: other, offset: 0 }),
    );
    await flush();

    first.release(); // The older reload finishes and finds itself superseded.
    await flush();
    expect(replied).toBe(false); // ...so the reply waits for the newest one.
    second.release();
    await changed;
    expect((await reply).entry).toMatchObject({ id: other, name: 'other.xml' });
  });

  it('reports video mode right after enabling over a playing video', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 }) as DOMRect;
    document.body.append(video);
    try {
      controller.toggle();
      expect(controller.status().mode).toBe('video');
    } finally {
      video.remove();
    }
  });

  describe('video choice', () => {
    const videos: HTMLVideoElement[] = [];
    /** A video in the page with a rendered size, playing unless told otherwise. */
    const addVideo = (width: number, height: number, paused = false) => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'paused', { value: paused });
      video.getBoundingClientRect = () => ({ left: 0, top: 0, width, height }) as DOMRect;
      document.body.append(video);
      videos.push(video);
      return video;
    };
    const setVideo = (choice: 'auto' | 'none' | number, urlKey = PAGE) =>
      controller.handleMessage({ type: 'setVideo', choice, urlKey });

    afterEach(() => {
      for (const video of videos.splice(0)) video.remove();
    });

    it('lists the videos and which one auto follows', () => {
      const small = addVideo(320, 180);
      const big = addVideo(1280, 720, true);
      const status = controller.status();
      expect(status.videos.map((v) => [v.id, v.width, v.height, v.playing])).toEqual([
        [videoId(small), 320, 180, true],
        [videoId(big), 1280, 720, false],
      ]);
      // Auto picks the largest playing video; the paused one is skipped.
      expect(status.autoTargetId).toBe(videoId(small));
    });

    it('loops with None even while a video plays', async () => {
      const video = addVideo(640, 360);
      controller.toggle();
      controller.tick();
      expect(controller.status().mode).toBe('video');
      const status = await setVideo('none');
      // Auto would still follow the playing video; the popup names it in the Auto option.
      expect(status).toMatchObject({ choice: 'none', mode: 'loop', autoTargetId: videoId(video) });
      controller.tick();
      expect(drawn()).toBeGreaterThan(0);
    });

    it('follows a chosen video over a larger one', async () => {
      const small = addVideo(320, 180);
      const big = addVideo(1280, 720);
      controller.toggle();
      controller.tick();
      const status = await setVideo(videoId(small));
      expect(status).toMatchObject({ choice: videoId(small), mode: 'video', autoTargetId: videoId(big) });
      controller.tick();
      // The overlay sits on the chosen video, not the larger one.
      expect(document.querySelector<HTMLElement>('danmaku-overlay')?.style.width).toBe('320px');
    });

    it('falls back to auto when the chosen video goes away', async () => {
      const small = addVideo(320, 180);
      const big = addVideo(1280, 720);
      await setVideo(videoId(small));
      small.remove();
      expect(controller.status()).toMatchObject({ choice: 'auto', autoTargetId: videoId(big) });
    });

    it('ignores a choice meant for another page', async () => {
      const status = await setVideo('none', 'https://other.com/');
      expect(status.choice).toBe('auto');
    });

    it('resets to auto when the URL changes', async () => {
      await setVideo('none');
      url = 'https://a.com/q';
      await controller.checkUrl();
      expect(controller.status().choice).toBe('auto');
    });
  });
});
