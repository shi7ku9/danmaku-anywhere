import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type Comment, DEFAULT_SETTINGS } from '../core/types';
import { saveEntry, setOffset } from '../storage/store';
import { Controller } from './controller';
import { videoId } from './video-finder';

const PAGE = 'https://a.com/p';
const comments: Comment[] = [
  { time: 0, text: 'a', mode: 'scroll', color: '#ffffff' },
  { time: 1, text: 'b', mode: 'scroll', color: '#ffffff' },
];

let url: string;
type RequestFrame = (cb: () => void) => number;
let requestFrame: ReturnType<typeof vi.fn<RequestFrame>>;
let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;
let frameId = 0;
let controller: Controller;

const drawn = () => document.querySelector('danmaku-overlay')?.shadowRoot?.querySelectorAll('.c').length ?? 0;

beforeEach(async () => {
  fakeBrowser.reset();
  await saveEntry({ urlKey: PAGE, title: 'A', fileName: 'a.json' }, comments);
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
      entry: { fileName: 'a.json', count: 2, offset: 0 },
      enabled: false,
      mode: 'loop',
      videos: [],
      choice: 'auto',
      targetId: null,
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
    await saveEntry({ urlKey: 'https://b.com/', title: 'B', fileName: 'b.xml' }, comments.slice(0, 1));
    controller.toggle();
    url = 'https://b.com/';
    await controller.checkUrl();
    expect(controller.status()).toMatchObject({
      urlKey: 'https://b.com/',
      enabled: false,
      entry: { fileName: 'b.xml', count: 1 },
    });
  });

  it('does not play or edit the old entry while the new URL loads', async () => {
    controller.toggle();
    url = 'https://b.com/';
    const pending = controller.checkUrl();
    controller.toggle();
    await controller.onStorageChanged({ [`offset:${PAGE}`]: { newValue: 5 } });
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
    await saveEntry({ urlKey: PAGE, title: 'A', fileName: 'new.xml' }, comments.slice(0, 1));
    const status = await controller.handleMessage({ type: 'reload' });
    expect(status).toMatchObject({ enabled: true, entry: { fileName: 'new.xml', count: 1 } });
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

  it('loads an entry first imported from another tab once its index row exists', async () => {
    url = 'https://b.com/';
    await controller.checkUrl();
    // Comments land first; the storage event for them must not decide the state.
    await fakeBrowser.storage.local.set({ 'danmaku:https://b.com/': { offset: 0, comments } });
    expect(controller.status().entry).toBeNull();
    await saveEntry({ urlKey: 'https://b.com/', title: 'B', fileName: 'b.xml' }, comments);
    await controller.onStorageChanged({
      index: { oldValue: [], newValue: [{ urlKey: 'https://b.com/', fileName: 'b.xml' }] },
    });
    expect(controller.status()).toMatchObject({ entry: { fileName: 'b.xml', count: 2 } });
  });

  it('unloads when its index row is deleted elsewhere', async () => {
    controller.toggle();
    await fakeBrowser.storage.local.clear();
    await controller.onStorageChanged({ index: { oldValue: [{ urlKey: PAGE }], newValue: [] } });
    expect(controller.status()).toMatchObject({ enabled: false, entry: null });
  });

  it('follows offset changes from another tab without reloading', async () => {
    controller.toggle();
    controller.tick();
    await controller.onStorageChanged({ [`offset:${PAGE}`]: { oldValue: 0, newValue: 5 } });
    expect(controller.status()).toMatchObject({ enabled: true, entry: { offset: 5, count: 2 } });
    await controller.onStorageChanged({ 'offset:https://b.com/': { newValue: 9 } });
    expect(controller.status().entry?.offset).toBe(5);
  });

  it('ignores index changes that leave its own row unchanged', async () => {
    controller.toggle();
    controller.tick();
    const row = { urlKey: PAGE, fileName: 'a.json' };
    await controller.onStorageChanged({ index: { oldValue: [row], newValue: [row, { urlKey: 'https://b.com/' }] } });
    await controller.onStorageChanged({ [`danmaku:${PAGE}`]: { oldValue: {}, newValue: {} } });
    expect(drawn()).toBe(1);
  });

  it('keeps loop playback time when appearance settings change', async () => {
    // A comment at 30 s makes the loop 38 s long, so 20 s does not wrap.
    await saveEntry({ urlKey: PAGE, title: 'A', fileName: 'a.json' }, [
      ...comments,
      { time: 30, text: 'late', mode: 'scroll', color: '#ffffff' },
    ]);
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
    await saveEntry({ urlKey: PAGE, title: 'A', fileName: 'a.json' }, [
      { time: 0, text: 'a', mode: 'scroll', color: '#ffffff' },
      { time: 10, text: 'b', mode: 'scroll', color: '#ffffff' },
    ]);
    await controller.reload();
    await setOffset(PAGE, -10);
    await controller.reload();
    vi.useFakeTimers();
    controller.toggle();
    controller.tick();
    vi.advanceTimersByTime(5000); // 18 s loop shifted by -10 s: position 13, comment at 10 s on screen.
    controller.tick();
    expect(drawn()).toBe(1);
  });

  it('waits for a load already in progress for the same URL', async () => {
    await saveEntry({ urlKey: 'https://b.com/', title: 'B', fileName: 'b.xml' }, comments);
    url = 'https://b.com/';
    const navigating = controller.checkUrl();
    const status = await controller.handleMessage({ type: 'getStatus' });
    await navigating;
    expect(status.entry).toMatchObject({ fileName: 'b.xml' });
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
      expect(status.targetId).toBe(videoId(small));
    });

    it('loops with None even while a video plays', async () => {
      addVideo(640, 360);
      controller.toggle();
      controller.tick();
      expect(controller.status().mode).toBe('video');
      const status = await setVideo('none');
      expect(status).toMatchObject({ choice: 'none', mode: 'loop', targetId: null });
      controller.tick();
      expect(drawn()).toBeGreaterThan(0);
    });

    it('follows a chosen video over a larger one', async () => {
      const small = addVideo(320, 180);
      addVideo(1280, 720);
      controller.toggle();
      controller.tick();
      const status = await setVideo(videoId(small));
      expect(status).toMatchObject({ choice: videoId(small), mode: 'video', targetId: videoId(small) });
    });

    it('falls back to auto when the chosen video goes away', async () => {
      const small = addVideo(320, 180);
      const big = addVideo(1280, 720);
      await setVideo(videoId(small));
      small.remove();
      expect(controller.status()).toMatchObject({ choice: 'auto', targetId: videoId(big) });
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
