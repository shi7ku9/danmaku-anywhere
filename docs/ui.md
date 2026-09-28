# UI

## Popup

From top to bottom:

1. **Current page**: "Loaded: `fileName` (N comments)" or "No danmaku for this page".
2. **On/off switch** with the current mode ("video sync" or "loop").
   Disabled when the page has no danmaku.
3. **Import** button: opens the import window for the current tab.
4. **Offset**: number input (seconds) plus `−1s` / `+1s` buttons. Applied live
   and saved to the entry. Hidden when the page has no danmaku.
5. **Settings**: always visible. A preview on top shows one sample comment on a
   dark, video-like strip, styled with the same helpers as the overlay
   (`src/core/style.ts`) and updated as any setting changes, including the
   advanced ones. Below it, sliders for opacity, font size and speed. Applied
   live to all tabs.
6. **Advanced style** (collapsible): see [Advanced style](#advanced-style).
7. **Library** (collapsible): every stored entry with title, URL key, file name
   and import date, each with a delete button.

## Advanced style

A collapsed `<details>` section below the basic settings, styled like the library.
The preview stays in the basic settings card, so it is visible while this
section is collapsed.
From top to bottom:

1. **Effect**: segmented control with Outline / Shadow / Both / None.
2. **Fine-tuning** for the selected effect; only the relevant rows are shown:
   - Outline: width slider and color.
   - Shadow: blur slider, offset slider and color.

   A color is chosen from a row of preset swatches or typed as `#rrggbb` in a
   hex field; an invalid value is marked and restored when the field loses
   focus. The native `<input type="color">` is not used: its picker opens a
   separate window, which takes focus and closes the popup.
3. **Font**: select with System / Sans-serif / Serif / Monospace / Custom.
   Choosing Custom shows a text input for any CSS `font-family` value.
4. **Weight**: Normal / Bold toggle.
5. **Display area**: segmented control with 25% / 50% / 75% / 100%.
6. **Max on screen**: slider, 20 – 300.
7. **Reset to defaults**: restores every setting, including opacity, font size
   and speed, to its default.

Changes apply live to all tabs, like the basic sliders. Sliders save with the
same debounce as the basic sliders; swatches, selects, segmented controls
and the custom font input save on `change`; the hex field saves while typing
once the value is valid.

## Import window

Opened with `windows.create({ type: 'popup' })` at
`import.html?urlKey=…&tabId=…&title=…`.

1. File input accepting `.xml` and `.json`, or drag a file anywhere into the
   window. Drag and drop bypasses the native file chooser, which is broken in
   some Linux setups. Of several dropped files only the first is imported.
2. On selection or drop: read, detect format, parse.
3. If the URL key already has an entry, ask to confirm replacement; declining
   shows "Import cancelled."
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
