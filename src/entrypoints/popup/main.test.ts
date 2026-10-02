import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Message, Status } from '../../core/messages';
import { addDanmaku, getBindings } from '../../storage/store';
import html from './index.html?raw';

const A = 'https://a.com/watch?v=a';
const B = 'https://a.com/watch?v=b';

const statusFor = (urlKey: string): Status => ({
  urlKey,
  title: urlKey,
  entry: { id: urlKey, name: `${urlKey}.xml`, count: 1, offset: 0 },
  enabled: true,
  mode: 'loop',
  videos: [],
  choice: 'auto',
  autoTargetId: null,
});

/** The page the content script is on; answers describe it when they are released. */
let page: string;
/** While set, answers wait in `held` until the test releases them, in any order. */
let holding: boolean;
let held: (() => void)[];

const $ = (id: string) => document.getElementById(id)!;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetModules();
  page = A;
  holding = false;
  held = [];
  await addDanmaku({ fileName: 'a.xml' }, [], { urlKey: A, title: 'A' });
  await addDanmaku({ fileName: 'b.xml' }, [], { urlKey: B, title: 'B' });
  // The overloaded browser APIs don't fit vi.spyOn's types; the fakes return what the popup reads.
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 1, url: A }] as never);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(((_tabId: number, _message: Message) => {
    if (!holding) return Promise.resolve(statusFor(page));
    return new Promise<Status>((resolve) => held.push(() => resolve(statusFor(page))));
  }) as never);
  // The popup's markup, without its module script (the test imports main.ts itself).
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('./main');
  await vi.waitFor(() => expect($('page').textContent).toBe(`${A}.xml`));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('popup', () => {
  it('applies offset steps to the page it is on after overlapping refreshes', async () => {
    // The site navigates from A to B while the popup still shows A.
    page = B;
    holding = true;
    $('offset-plus').click();
    $('offset-plus').click();
    await vi.waitFor(() => expect(held).toHaveLength(2));
    // The older refresh answers first; its answer is dropped as stale.
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    holding = false;
    held[1]!();

    await vi.waitFor(async () => expect((await getBindings())[B]?.offset).toBe(2));
    expect((await getBindings())[A]?.offset).toBe(0);
    expect($('page').textContent).toBe(`${B}.xml`);
  });

  it('ends on the last video choice when an earlier one answers last', async () => {
    const sent = vi.mocked(browser.tabs.sendMessage);
    const select = $('video') as HTMLSelectElement;
    holding = true;
    for (const choice of ['none', 'auto']) {
      select.value = choice;
      select.dispatchEvent(new Event('change'));
    }
    await vi.waitFor(() => expect(held).toHaveLength(2));
    const choices = sent.mock.calls.map(([, m]) => m as Message).filter((m) => m.type === 'setVideo');
    expect(choices.map((m) => m.type === 'setVideo' && m.choice)).toEqual(['none', 'auto']);
    // The newer answer first, then the older one: the older must not win.
    held[1]!();
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    expect(select.value).toBe('auto');
  });

  it('imports for the page it is on after overlapping refreshes', async () => {
    const create = vi.spyOn(browser.windows, 'create').mockResolvedValue({} as never);
    vi.spyOn(window, 'close').mockImplementation(() => {});
    page = B;
    holding = true;
    // Import refreshes first; a refresh as the video list opens then makes Import's request stale.
    $('import').click();
    $('video').dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(held).toHaveLength(2));
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    held[1]!();

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    const url = new URL(create.mock.calls[0]![0]!.url as string, 'chrome-extension://x/');
    expect(url.searchParams.get('urlKey')).toBe(B);
  });
});
