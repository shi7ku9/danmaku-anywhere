import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Comment } from '../core/types';
import { getEntry, saveEntry } from '../storage/store';
import { Controller } from './controller';

const PAGE = 'https://a.com/p';
const comments: Comment[] = [
  { time: 0, text: 'a', mode: 'scroll', color: '#ffffff' },
  { time: 1, text: 'b', mode: 'scroll', color: '#ffffff' },
];

let url: string;
type RequestFrame = (cb: () => void) => void;
let requestFrame: ReturnType<typeof vi.fn<RequestFrame>>;
let controller: Controller;

const drawn = () => document.querySelector('danmaku-overlay')?.shadowRoot?.querySelectorAll('.c').length ?? 0;

beforeEach(async () => {
  fakeBrowser.reset();
  await saveEntry({ urlKey: PAGE, title: 'A', fileName: 'a.json' }, comments);
  url = `${PAGE}#top`;
  requestFrame = vi.fn<RequestFrame>();
  controller = new Controller({
    getUrl: () => url,
    getTitle: () => 'Title',
    requestFrame,
    measure: () => 100,
  });
  await controller.start();
});

afterEach(() => controller.setEnabled(false));

describe('Controller', () => {
  it('loads the entry for the page but stays off', () => {
    expect(controller.status()).toEqual({
      urlKey: PAGE,
      title: 'Title',
      entry: { fileName: 'a.json', count: 2, offset: 0 },
      enabled: false,
      mode: 'loop',
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

  it('ignores URL changes that normalize to the same key', async () => {
    controller.toggle();
    url = `${PAGE}?utm_source=x`;
    await controller.checkUrl();
    expect(controller.status().enabled).toBe(true);
  });

  it('persists the offset', async () => {
    await controller.handleMessage({ type: 'setOffset', offset: -2 });
    expect(controller.status().entry?.offset).toBe(-2);
    expect((await getEntry(PAGE))?.offset).toBe(-2);
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
});
