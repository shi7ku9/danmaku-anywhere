import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Message, Status } from '../../core/messages';
import { addDanmaku, bindPage, getBindings, listLibrary, unbindPage } from '../../storage/store';
import html from './index.html?raw';

/** `vi.waitFor` with a longer limit than its 1 s default, so a busy machine does not fail these tests. */
const waitFor = <T>(callback: () => T | Promise<T>) => vi.waitFor(callback, { timeout: 5000 });

const A = 'https://a.com/watch?v=a';
const B = 'https://a.com/watch?v=b';
const titles: Record<string, string> = { [A]: 'Page A', [B]: 'Page B' };

/** What the page's content script would answer: its status, computed from storage when asked. */
async function statusFor(urlKey: string): Promise<Status> {
  const binding = (await getBindings())[urlKey];
  const row = binding && (await listLibrary()).find((e) => e.id === binding.danmakuId);
  return {
    urlKey,
    title: titles[urlKey] ?? urlKey,
    entry:
      binding && row
        ? { id: row.id, bindingId: binding.id, name: row.name, count: row.count, offset: binding.offset }
        : null,
    enabled: true,
    mode: 'loop',
    videos: [],
    choice: 'auto',
    autoTargetId: null,
  };
}

/** The page the content script is on; answers describe it when they are released. */
let page: string;
/** While set, answers wait in `held` until the test releases them, in any order. */
let holding: boolean;
let held: (() => void)[];
/** Every message the popup sent to the page. */
let sent: Message[];
/** Ids of the seeded danmaku: `a.xml` is used by page A, `b.xml` by page B. */
let idA: string;
let idB: string;

const $ = (id: string) => document.getElementById(id)!;

/** Opens the popup on the current tab, after any extra seeding the test did. */
async function openPopup(): Promise<void> {
  // The popup's markup, without its module script (the test imports main.ts itself).
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('./main');
  const count = String((await listLibrary()).length);
  await waitFor(() => expect($('library-count').textContent).toBe(count));
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetModules();
  page = A;
  holding = false;
  held = [];
  sent = [];
  idA = await addDanmaku({ fileName: 'a.xml' }, [], { urlKey: A, title: titles[A]! });
  idB = await addDanmaku({ fileName: 'b.xml' }, [], { urlKey: B, title: titles[B]! });
  // The overloaded browser APIs don't fit vi.spyOn's types; the fakes return what the popup reads.
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 1, url: A }] as never);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(((_tabId: number, message: Message) => {
    sent.push(message);
    if (!holding) return statusFor(page);
    return new Promise<Status>((resolve) => held.push(() => void statusFor(page).then(resolve)));
  }) as never);
  vi.stubGlobal('close', vi.fn());
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('popup', () => {
  it('applies offset steps to the page it is on after overlapping refreshes', async () => {
    await openPopup();
    await waitFor(() => expect($('page').textContent).toBe('a.xml'));
    // The site navigates from A to B while the popup still shows A.
    page = B;
    holding = true;
    $('offset-plus').click();
    $('offset-plus').click();
    await waitFor(() => expect(held).toHaveLength(2));
    // The older refresh answers first; its answer is dropped as stale.
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    holding = false;
    held[1]!();

    await waitFor(async () => expect((await getBindings())[B]?.offset).toBe(2));
    expect((await getBindings())[A]?.offset).toBe(0);
    expect($('page').textContent).toBe('b.xml');
  });

  it('ends on the last video choice when an earlier one answers last', async () => {
    await openPopup();
    const select = $('video') as HTMLSelectElement;
    holding = true;
    for (const choice of ['none', 'auto']) {
      select.value = choice;
      select.dispatchEvent(new Event('change'));
    }
    await waitFor(() => expect(held).toHaveLength(2));
    const choices = sent.filter((m) => m.type === 'setVideo');
    expect(choices.map((m) => m.type === 'setVideo' && m.choice)).toEqual(['none', 'auto']);
    // The newer answer first, then the older one: the older must not win.
    held[1]!();
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    expect(select.value).toBe('auto');
  });

  it('imports for the page it is on after overlapping refreshes', async () => {
    await openPopup();
    const create = vi.spyOn(browser.windows, 'create').mockResolvedValue({} as never);
    page = B;
    holding = true;
    // Import refreshes first; a refresh as the video list opens then makes Import's request stale.
    $('import').click();
    $('video').dispatchEvent(new Event('focus'));
    await waitFor(() => expect(held).toHaveLength(2));
    held[0]!();
    await new Promise((r) => setTimeout(r, 10));
    held[1]!();

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const url = new URL(create.mock.calls[0]![0]!.url as string, 'chrome-extension://x/');
    expect(url.searchParams.get('urlKey')).toBe(B);
  });

  it('does not apply a queued offset write to a danmaku used afterwards', async () => {
    const idX = await addDanmaku({ fileName: 'x.xml' }, []);
    await openPopup();
    await waitFor(() => expect($('page').textContent).toBe('a.xml'));
    // Hold the first offset write, so the second stays queued behind it.
    const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
      await set(items);
      if (!held && 'bindings' in items) {
        held = true;
        await gate;
      }
    });
    $('offset-plus').click();
    await waitFor(() => expect(held).toBe(true));
    $('offset-plus').click();
    await waitFor(() => expect(($('offset') as HTMLInputElement).value).toBe('2'));

    // Meanwhile another danmaku is used on the page.
    const row = [...document.querySelectorAll<HTMLElement>('#library > .lib-row')].find(
      (r) => r.querySelector('.name')?.textContent === 'x.xml',
    )!;
    row.querySelector<HTMLElement>('.use')!.click();
    await new Promise((r) => setTimeout(r, 20));
    release();

    await waitFor(async () => expect((await getBindings())[A]?.danmakuId).toBe(idX));
    await new Promise((r) => setTimeout(r, 50)); // Let the queued write run.
    expect((await getBindings())[A]).toMatchObject({ danmakuId: idX, offset: 0 });
  });

  it('does not apply a queued offset write to a new binding of the same danmaku', async () => {
    await openPopup();
    await waitFor(() => expect($('page').textContent).toBe('a.xml'));
    // Hold the first offset write, so the second stays queued behind it.
    const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let heldWrite = false;
    vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
      await set(items);
      if (!heldWrite && 'bindings' in items) {
        heldWrite = true;
        await gate;
      }
    });
    $('offset-plus').click();
    await waitFor(() => expect(heldWrite).toBe(true));
    $('offset-plus').click();
    await waitFor(() => expect(($('offset') as HTMLInputElement).value).toBe('2'));

    // The page's status answers are delayed from here on, so the sender is still waiting on one
    // when the page is unbound and bound again to the very same danmaku.
    holding = true;
    const unbinding = unbindPage(A);
    release();
    await unbinding;
    await bindPage(A, idA, titles[A]!);
    expect((await getBindings())[A]).toMatchObject({ danmakuId: idA, offset: 0 });

    holding = false;
    for (const answer of held.splice(0)) answer();
    await new Promise((r) => setTimeout(r, 50)); // Let the queued write run.
    expect((await getBindings())[A]).toMatchObject({ danmakuId: idA, offset: 0 });
  });

  describe('library', () => {
    const rows = () => [...document.querySelectorAll<HTMLElement>('#library > .lib-row')];
    const nameOf = (row: HTMLElement) => row.querySelector('.name')?.textContent;
    const rowOf = (name: string) => rows().find((r) => nameOf(r) === name)!;
    const click = (row: HTMLElement, selector: string) => row.querySelector<HTMLElement>(selector)!.click();
    /** The inline name field; the row being renamed shows it instead of its name. */
    const renameField = () => document.querySelector<HTMLInputElement>('#library input.rename');
    const key = (input: HTMLElement, name: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
    const addedAt = (...times: number[]) =>
      listLibrary().then((library) =>
        fakeBrowser.storage.local.set({ library: library.map((e, i) => ({ ...e, addedAt: times[i] })) }),
      );

    it('lists the danmaku newest first, with their details and users', async () => {
      await addDanmaku({ fileName: 'c.xml' }, [{ time: 1, text: 'x', mode: 'scroll', color: '#ffffff' }]);
      await addedAt(1000, 2000, 3000);
      await openPopup();
      expect(rows().map(nameOf)).toEqual(['c.xml', 'b.xml', 'a.xml']);
      expect($('library-count').textContent).toBe('3');
      expect(rowOf('c.xml').querySelector('.muted')?.textContent).toContain('c.xml · 1 comments');
      expect(rowOf('c.xml').querySelector('.link')).toBeNull();
      expect(rowOf('a.xml').querySelector('.link')?.textContent).toContain('Used by 1 page');
    });

    it('uses a danmaku on the current page, replacing its binding', async () => {
      const idC = await addDanmaku({ fileName: 'c.xml' }, []);
      await openPopup();
      expect(rowOf('a.xml').querySelector<HTMLButtonElement>('.use')).toMatchObject({
        textContent: 'In use',
        disabled: true,
      });
      click(rowOf('c.xml'), '.use');

      await waitFor(async () => expect((await getBindings())[A]?.danmakuId).toBe(idC));
      expect((await getBindings())[A]).toMatchObject({ offset: 0, title: 'Page A' });
      expect(sent).toContainEqual({ type: 'reload' });
      await waitFor(() => expect($('page').textContent).toBe('c.xml'));
      await waitFor(() => expect(rowOf('c.xml').querySelector('.use')?.textContent).toBe('In use'));
      expect(rowOf('a.xml').querySelector<HTMLButtonElement>('.use')?.disabled).toBe(false);
      expect(await listLibrary()).toHaveLength(3); // The previous danmaku stays.
    });

    it('does not use a danmaku on a page the user did not see', async () => {
      const idC = await addDanmaku({ fileName: 'c.xml' }, []);
      await openPopup();
      page = B; // The site navigated while the popup was open.
      click(rowOf('c.xml'), '.use');
      await waitFor(() => expect($('page').textContent).toBe('b.xml'));
      const bindings = await getBindings();
      expect(bindings[A]?.danmakuId).toBe(idA);
      expect(bindings[B]?.danmakuId).toBe(idB);
      expect(Object.values(bindings).some((b) => b.danmakuId === idC)).toBe(false);
    });

    it('shows the pages using a danmaku and unbinds them one by one', async () => {
      await bindPage(B, idA, titles[B]!);
      await openPopup();
      expect(rowOf('a.xml').querySelector('.link')?.textContent).toContain('Used by 2 pages');
      expect(rowOf('a.xml').querySelector('.pages')).toBeNull();
      click(rowOf('a.xml'), '.link');
      await waitFor(() => expect(rowOf('a.xml').querySelectorAll('.pages li')).toHaveLength(2));
      const pages = [...rowOf('a.xml').querySelectorAll('.pages li')];
      expect(pages.map((p) => p.querySelector('strong')?.textContent)).toEqual(['Page A (this page)', 'Page B']);

      click(pages[1] as HTMLElement, '.delete'); // Another page: no reload.
      await waitFor(async () => expect((await getBindings())[B]).toBeUndefined());
      expect(sent).not.toContainEqual({ type: 'reload' });
      expect(await listLibrary()).toHaveLength(2);
      await waitFor(() => expect(rowOf('a.xml').querySelectorAll('.pages li')).toHaveLength(1)); // Stays expanded.

      click(rowOf('a.xml').querySelector('.pages li') as HTMLElement, '.delete'); // This page: reload.
      await waitFor(async () => expect((await getBindings())[A]).toBeUndefined());
      await waitFor(() => expect(sent).toContainEqual({ type: 'reload' }));
      await waitFor(() => expect($('page').textContent).toBe('No danmaku for this page'));
    });

    it('asks before deleting, naming the pages it unbinds, and disarms after 3 seconds', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      await bindPage(B, idA, titles[B]!);
      await openPopup();
      const label = () => rowOf('a.xml').querySelector('.delete')?.textContent;
      expect(label()).toBe('✕');
      click(rowOf('a.xml'), '.delete');
      await waitFor(() => expect(label()).toBe('Delete? Unbinds 2 pages'));
      expect(await listLibrary()).toHaveLength(2);

      vi.advanceTimersByTime(3000);
      await waitFor(() => expect(label()).toBe('✕'));
      expect(await listLibrary()).toHaveLength(2);
    });

    it('deletes on the second click, with its bindings, and reloads the page that used it', async () => {
      await bindPage(B, idA, titles[B]!);
      await openPopup();
      click(rowOf('a.xml'), '.delete');
      await waitFor(() => expect(rowOf('a.xml').querySelector('.delete')?.textContent).toContain('Delete?'));
      click(rowOf('a.xml'), '.delete');

      await waitFor(async () => expect((await listLibrary()).map((e) => e.id)).toEqual([idB]));
      expect(await getBindings()).toEqual({});
      expect(sent).toContainEqual({ type: 'reload' });
      await waitFor(() => expect(rows().map(nameOf)).toEqual(['b.xml']));
      await waitFor(() => expect($('page').textContent).toBe('No danmaku for this page'));
    });

    it('asks with a plain "Delete?" for a danmaku no page uses', async () => {
      await addDanmaku({ fileName: 'c.xml' }, []);
      await openPopup();
      click(rowOf('c.xml'), '.delete');
      await waitFor(() => expect(rowOf('c.xml').querySelector('.delete')?.textContent).toBe('Delete?'));
    });

    it('renames with Enter, showing the new name on the page card', async () => {
      await openPopup();
      click(rowOf('a.xml'), '.edit');
      const input = await waitFor(() => {
        expect(renameField()).not.toBeNull();
        return renameField()!;
      });
      expect(input.value).toBe('a.xml');
      expect(document.activeElement).toBe(input);
      input.value = '  Episode 1  ';
      key(input, 'Enter');

      await waitFor(async () => expect((await listLibrary())[0]?.name).toBe('Episode 1'));
      await waitFor(() => expect(rows().map(nameOf)).toContain('Episode 1'));
      expect($('page').textContent).toBe('Episode 1');
      expect(renameField()).toBeNull();
      expect(sent).not.toContainEqual({ type: 'reload' }); // Playback is not interrupted.
    });

    it('keeps the old name on Escape, on blur and for an empty name', async () => {
      await openPopup();
      const edit = async () => {
        click(rowOf('a.xml'), '.edit');
        return waitFor(() => {
          expect(renameField()).not.toBeNull();
          return renameField()!;
        });
      };
      let input = await edit();
      input.value = 'Changed';
      key(input, 'Escape');
      await waitFor(() => expect(renameField()).toBeNull());

      input = await edit();
      input.value = 'Changed';
      input.dispatchEvent(new Event('blur'));
      await waitFor(() => expect(renameField()).toBeNull());

      input = await edit();
      input.value = '   ';
      key(input, 'Enter');
      await waitFor(() => expect(renameField()).toBeNull());
      expect((await listLibrary()).map((e) => e.name).sort()).toEqual(['a.xml', 'b.xml']);
      expect(rows().map(nameOf).sort()).toEqual(['a.xml', 'b.xml']);
    });

    it('updates "In use" and the current-page mark when the page changes', async () => {
      await bindPage(B, idA, titles[B]!);
      await openPopup();
      click(rowOf('a.xml'), '.link');
      await waitFor(() => expect(rowOf('a.xml').querySelectorAll('.pages li')).toHaveLength(2));
      const use = (name: string) => rowOf(name).querySelector<HTMLButtonElement>('.use')!;
      const here = () =>
        [...rowOf('a.xml').querySelectorAll('.pages li')].map((p) => p.querySelector('strong')?.textContent);
      expect(use('a.xml')).toMatchObject({ textContent: 'In use', disabled: true });
      expect(here()).toEqual(['Page A (this page)', 'Page B']);

      // The site navigates from A to B; the popup notices on its next refresh.
      page = B;
      $('video').dispatchEvent(new Event('focus'));
      await waitFor(() => expect(here()).toEqual(['Page A', 'Page B (this page)']));
      expect(use('a.xml')).toMatchObject({ textContent: 'In use', disabled: true }); // B uses a.xml too.
      expect(use('b.xml')).toMatchObject({ textContent: 'Use', disabled: false }); // B no longer uses b.xml.
    });

    it('lets the danmaku a page used before be used again after the page changes', async () => {
      await openPopup();
      const use = (name: string) => rowOf(name).querySelector<HTMLButtonElement>('.use')!;
      expect(use('a.xml').disabled).toBe(true);
      page = B;
      $('video').dispatchEvent(new Event('focus'));
      await waitFor(() => expect($('page').textContent).toBe('b.xml'));
      await waitFor(() => expect(use('a.xml')).toMatchObject({ textContent: 'Use', disabled: false }));
      expect(use('b.xml')).toMatchObject({ textContent: 'In use', disabled: true });
    });

    it('opens the import window without a page for "Add file…"', async () => {
      const create = vi.spyOn(browser.windows, 'create').mockResolvedValue({} as never);
      await openPopup();
      $('library-add').click();
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
      const url = String(create.mock.calls[0]![0]!.url);
      expect(url).toMatch(/\/import\.html$/);
    });
  });
});
