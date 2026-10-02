import type { Status } from '../../core/messages';
import type { Bindings, LibraryEntry } from '../../core/types';
import { bindPage, deleteDanmaku, getBindings, listLibrary, renameDanmaku, unbindPage } from '../../storage/store';
import { deleteLabel, pagesUsing, usedByLabel } from './library-view';

export interface LibraryDeps {
  getStatus(): Status | null;
  /** Re-reads the page; resolves once the newest status is in. */
  refresh(): Promise<void>;
  /** Makes the page's content script reload its danmaku, then shows its status. */
  reloadPage(): Promise<void>;
  /** A danmaku was renamed: show the new name if the page has it loaded. */
  renamed(id: string, name: string): void;
  /** Opens the import window without a page ("Add file…"). */
  openImport(): Promise<void>;
}

/** How long the delete button stays armed, in ms. */
const ARM_MS = 3000;

let deps: LibraryDeps;
/** Rows whose "Used by" list is open. */
const expanded = new Set<string>();
/** Rows whose delete button is armed, with the timer that disarms it. */
const armed = new Map<string, ReturnType<typeof setTimeout>>();
let renaming: string | null = null;
let renderVersion = 0;

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

export function initLibrary(libraryDeps: LibraryDeps): void {
  deps = libraryDeps;
  $('library-add').addEventListener('click', () => void deps.openImport());
}

/** Draws the library from storage. Overlapping calls: the last one started wins. */
export async function renderLibrary(): Promise<void> {
  const mine = ++renderVersion;
  const [entries, bindings] = await Promise.all([listLibrary(), getBindings()]);
  if (mine !== renderVersion) return;
  entries.sort((a, b) => b.addedAt - a.addedAt);
  $('library-count').textContent = String(entries.length);
  $('library').replaceChildren(...entries.map((entry) => row(entry, bindings)));
  const input = $('library').querySelector<HTMLInputElement>('input.rename');
  input?.focus();
  input?.select();
}

function row(entry: LibraryEntry, bindings: Bindings): HTMLElement {
  const status = deps.getStatus();
  const pages = pagesUsing(bindings, entry.id);
  const li = el('li', 'lib-row');

  const head = el('div', 'lib-head');
  head.append(renaming === entry.id ? renameField(entry) : el('strong', 'name', entry.name));
  if (renaming !== entry.id) {
    head.append(button('chip edit', '✎', `Rename ${entry.name}`, () => startRename(entry.id)));
  }
  // Armed, the delete button moves to its own line, so its longer text doesn't squeeze the name.
  const isArmed = armed.has(entry.id);
  if (!isArmed) head.append(deleteButton(entry, pages.length));
  li.append(head);
  li.append(
    el('div', 'muted', `${entry.fileName} · ${entry.count} comments · ${new Date(entry.addedAt).toLocaleDateString()}`),
  );
  if (isArmed) li.append(deleteButton(entry, pages.length));

  const actions = el('div', 'lib-actions');
  const inUse = status?.entry?.id === entry.id;
  const use = button(
    'chip use',
    inUse ? 'In use' : 'Use',
    `Use ${entry.name} on this page`,
    () => void useOnPage(entry.id),
  );
  use.disabled = !status || inUse;
  actions.append(use);
  if (pages.length > 0) {
    const open = expanded.has(entry.id);
    const toggle = button('link', `${usedByLabel(pages.length)} ${open ? '▾' : '▸'}`, usedByLabel(pages.length), () => {
      if (!expanded.delete(entry.id)) expanded.add(entry.id);
      void renderLibrary();
    });
    toggle.setAttribute('aria-expanded', String(open));
    actions.append(toggle);
  }
  li.append(actions);

  if (pages.length > 0 && expanded.has(entry.id)) {
    const list = el('ul', 'pages');
    for (const page of pages) {
      const item = el('li');
      const info = el('div', 'info');
      const here = page.urlKey === status?.urlKey;
      info.append(el('strong', '', here ? `${page.title || page.urlKey} (this page)` : page.title || page.urlKey));
      const key = el('span', 'muted', page.urlKey);
      key.title = page.urlKey;
      info.append(key);
      item.append(
        info,
        button('delete', '✕', `Unbind ${page.title || page.urlKey}`, () => void unbind(page.urlKey)),
      );
      list.append(item);
    }
    li.append(list);
  }
  return li;
}

function renameField(entry: LibraryEntry): HTMLInputElement {
  const input = el('input', 'text rename');
  input.type = 'text';
  input.value = entry.name;
  input.setAttribute('aria-label', 'Name');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void commitRename(entry.id, input.value);
    else if (e.key === 'Escape') cancelRename(entry.id);
  });
  // Leaving the field cancels, like Escape.
  input.addEventListener('blur', () => cancelRename(entry.id));
  return input;
}

function startRename(id: string): void {
  renaming = id;
  void renderLibrary();
}

function cancelRename(id: string): void {
  if (renaming !== id) return;
  renaming = null;
  void renderLibrary();
}

async function commitRename(id: string, name: string): Promise<void> {
  renaming = null;
  await renameDanmaku(id, name);
  const renamed = (await listLibrary()).find((e) => e.id === id);
  if (renamed) deps.renamed(id, renamed.name);
  await renderLibrary();
}

function deleteButton(entry: LibraryEntry, pageCount: number): HTMLButtonElement {
  const isArmed = armed.has(entry.id);
  const b = button(
    isArmed ? 'delete armed' : 'delete',
    isArmed ? deleteLabel(pageCount) : '✕',
    isArmed ? `Confirm deleting ${entry.name}` : `Delete ${entry.name}`,
    () => void deleteOrArm(entry.id),
  );
  b.title = isArmed ? 'Click again to delete' : 'Delete';
  return b;
}

/** First click arms the button; a second one within `ARM_MS` deletes. */
async function deleteOrArm(id: string): Promise<void> {
  const timer = armed.get(id);
  if (timer === undefined) {
    armed.set(
      id,
      setTimeout(() => {
        armed.delete(id);
        void renderLibrary();
      }, ARM_MS),
    );
    await renderLibrary();
    return;
  }
  clearTimeout(timer);
  armed.delete(id);
  expanded.delete(id);
  const here = deps.getStatus()?.urlKey;
  const usedHere = pagesUsing(await getBindings(), id).some((p) => p.urlKey === here);
  await deleteDanmaku(id);
  if (usedHere) await deps.reloadPage();
  await renderLibrary();
}

/** Uses a danmaku on the page the popup is showing, if that is still the page it was clicked on. */
async function useOnPage(id: string): Promise<void> {
  const clickedOn = deps.getStatus()?.urlKey;
  await deps.refresh();
  const status = deps.getStatus();
  // The site navigated meanwhile: don't bind to a page the user did not see.
  if (status && status.urlKey === clickedOn) {
    await bindPage(status.urlKey, id, status.title);
    await deps.reloadPage();
  }
  await renderLibrary();
}

async function unbind(urlKey: string): Promise<void> {
  await unbindPage(urlKey);
  if (urlKey === deps.getStatus()?.urlKey) await deps.reloadPage();
  await renderLibrary();
}
