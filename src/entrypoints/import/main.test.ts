import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addDanmaku, getBindings, listLibrary } from '../../storage/store';
import html from './index.html?raw';

/** `vi.waitFor` with a longer limit than its 1 s default, so a busy machine does not fail these tests. */
const waitFor = <T>(callback: () => T | Promise<T>) => vi.waitFor(callback, { timeout: 5000 });

const PAGE = 'https://a.com/watch?v=1';
const json = JSON.stringify([{ time: 1, text: 'hello' }]);

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** Loads the import window as if opened at `query`, with the file input ready. */
async function openWindow(query: string): Promise<void> {
  history.replaceState(null, '', `/import.html${query}`);
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '');
  vi.resetModules();
  await import('./main');
}

/** Picks a file in the input, as the user would. */
function pick(content: string, name = 'a.json'): void {
  const input = $('file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  input.dispatchEvent(new Event('change'));
}

let send: ReturnType<typeof vi.spyOn>;
const confirm = vi.fn(() => true);

beforeEach(() => {
  fakeBrowser.reset();
  send = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(undefined as never);
  confirm.mockClear();
  // Not provided by the test DOM; the window used to ask before replacing, and closes itself when done.
  vi.stubGlobal('confirm', confirm);
  vi.stubGlobal('close', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('import window', () => {
  it('saves to the library, binds the page and reloads its tab', async () => {
    await openWindow(`?urlKey=${encodeURIComponent(PAGE)}&tabId=7&title=Page`);
    expect($('target').textContent).toBe('Page');
    pick(json);
    await waitFor(() => expect($('message').textContent).toContain('Imported 1, skipped 0.'));

    const [row] = await listLibrary();
    expect(row).toMatchObject({ name: 'a.json', fileName: 'a.json', count: 1 });
    expect((await getBindings())[PAGE]).toEqual({
      id: expect.any(String),
      danmakuId: row?.id,
      offset: 0,
      title: 'Page',
    });
    expect($('message').textContent).not.toContain('library');
    expect(send).toHaveBeenCalledWith(7, { type: 'reload' });
  });

  it('replaces the page binding without asking, keeping the previous danmaku', async () => {
    const old = await addDanmaku({ fileName: 'old.xml' }, [], { urlKey: PAGE, title: 'Page' });
    await openWindow(`?urlKey=${encodeURIComponent(PAGE)}&tabId=7&title=Page`);
    pick(json, 'new.json');
    await waitFor(() => expect($('message').textContent).toContain('Imported'));

    expect(confirm).not.toHaveBeenCalled();
    const library = await listLibrary();
    expect(library.map((e) => e.fileName).sort()).toEqual(['new.json', 'old.xml']);
    const bound = (await getBindings())[PAGE]?.danmakuId;
    expect(bound).toBe(library.find((e) => e.fileName === 'new.json')?.id);
    expect(bound).not.toBe(old);
  });

  it('only saves to the library when opened without a page', async () => {
    await openWindow('');
    expect($('target').textContent).toBe('the library');
    expect(($('file') as HTMLInputElement).disabled).toBe(false);
    pick(json);
    await waitFor(() => expect($('message').textContent).toContain('Added to the library.'));

    expect(await listLibrary()).toHaveLength(1);
    expect(await getBindings()).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a parse error and saves nothing', async () => {
    await openWindow('');
    pick('not danmaku at all');
    await waitFor(() => expect($('message').className).toBe('error'));
    expect(await listLibrary()).toEqual([]);
  });
});
