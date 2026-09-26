# UI

## Popup

From top to bottom:

1. **Current page**: "Loaded: `fileName` (N comments)" or "No danmaku for this page".
2. **On/off switch** with the current mode ("video sync" or "loop").
   Disabled when the page has no danmaku.
3. **Import** button: opens the import window for the current tab.
4. **Offset**: number input (seconds) plus `−1s` / `+1s` buttons. Applied live
   and saved to the entry. Hidden when the page has no danmaku.
5. **Settings**: sliders for opacity, font size and speed. Applied live to all tabs.
6. **Library** (collapsible): every stored entry with title, URL key, file name
   and import date, each with a delete button.

## Import window

Opened with `windows.create({ type: 'popup' })` at
`import.html?urlKey=…&tabId=…&title=…`.

1. File input accepting `.xml` and `.json`.
2. On selection: read, detect format, parse.
3. If the URL key already has an entry, ask to confirm replacement.
4. Save the entry (offset 0) and update `index`.
5. Show "imported N, skipped M", send `reload` for the tab, and close after a
   short delay.

## Keyboard shortcut

Declared in the manifest `commands` as `toggle-danmaku`, default `Alt+Shift+D`
(`Alt+D` collides with the browser's address-bar shortcut). The user can rebind it
in the browser's extension shortcut settings. The background forwards it as
`toggle` to the active tab. Toggling a page with no danmaku does nothing.

## Error handling

| Situation | Behavior |
|---|---|
| Unrecognized format or parse failure | Error message in the import window; nothing saved |
| Some JSON items invalid | Skipped; counted in the result message |
| All items invalid / zero comments | Error message; nothing saved |
| Popup can't reach the content script on a restricted page (`chrome://`, store pages, `about:`) | "Danmaku isn't available on this page"; controls disabled |
| Popup can't reach the content script on a normal page | "Reload the page to use danmaku" (tab predates install/update) |
| Storage write fails | Error message in the import window |
