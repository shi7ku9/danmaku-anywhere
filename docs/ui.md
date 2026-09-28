# UI

## Popup

From top to bottom:

1. **Current page**: "Loaded: `fileName` (N comments)" or "No danmaku for this page".
2. **On/off switch** with the current mode ("video sync" or "loop").
   Disabled when the page has no danmaku.
3. **Video** select: which video danmaku follows (see
   [architecture.md](architecture.md#target-video-selection)). Hidden when the
   page has no danmaku. Options, in order:
   - `Auto (Video 2)`: automatic; the parentheses name the video Auto follows,
     or would follow if chosen, or say `none, loop`.
   - One per video in document order, e.g.
     `Video 2 · 1280×720 · Playing · 3:21 / 10:05` (duration `–` when unknown,
     e.g. a live stream).
   - `None (loop)`: loop mode even on a page with videos.

   The list is refreshed from the page when the popup opens and again when the
   select is focused, so sizes, play state and times are current.

   A choice is sent to the page at once, with the page's URL key, so the content
   script ignores it if the page changed meanwhile.

Requests from the popup to the page can overlap (quick successive choices, a
refresh on focus, repeated offset steps). Only the answer to the newest request
is shown; a late answer to an older one is dropped, so it can never show or
restore a stale state. Every caller, including one whose own answer was
dropped, resumes only once the newest answer is in, so an action that refreshes
first (offset, import) always acts on the page the tab is on now.
4. **Import** button: opens the import window for the current tab.
5. **Offset**: number input (seconds) plus `−1s` / `+1s` buttons. Applied live
   and saved to the entry. Hidden when the page has no danmaku.
6. **Settings**: always visible. A preview on top shows one sample comment on a
   dark, video-like strip, styled with the same helpers as the overlay
   (`src/core/style.ts`) and updated as any setting changes, including the
   advanced ones. The text is drawn at the overlay's true size and the preview
   is scaled to 80% as a whole, so px-based outlines and shadows keep the same
   proportions to the text as on the video. Below it, sliders for opacity, font size and speed. Applied
   live to all tabs.
7. **Advanced style** (collapsible): see [Advanced style](#advanced-style).
8. **Library** (collapsible): every stored entry with title, URL key, file name
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
   hex field. Surrounding spaces and a missing `#` are tolerated, so pasted
   values like ` #FF8800` or `ff8800` work; the field has no length limit, which
   would cut a pasted value before it is trimmed. An invalid value is marked and
   restored when the field loses focus. The native `<input type="color">` is not used: its picker opens a
   separate window, which takes focus and closes the popup.
3. **Font**: select with System / Sans-serif / Serif / Monospace / Custom.
   Choosing Custom shows a text input for any CSS `font-family` value. The
   preset and the custom value are stored separately (`fontFamily` and
   `customFont`), so the custom text is kept when a preset is chosen and comes
   back with Custom. The value is checked as it is typed, with the result shown
   below the field:

   - **Error** (red, not saved): the value is not valid CSS
     (`CSS.supports('font-family', …)` fails), since the browser would ignore it
     and keep the old font; or nothing in the list would render — every named
     family is missing and there is no generic family to fall back to. That is
     almost always a typo. A list that names no font at all (e.g. `""`) gets
     "No font family given".
   - **Warning** (amber, saved): some families are missing. They are listed as
     "will be skipped". A list exists to fall back past missing fonts, and also
     per glyph (e.g. a Latin font before a CJK one), so this must not block it.
     The warning is shown again when the popup reopens.

   How families are checked: the list is split the way CSS reads it (commas
   inside quotes or escaped as `\,` stay in the name, and escapes such as `\"`
   or `\5F3E ` are resolved). Each non-generic family is measured on a canvas
   against two fallbacks (`monospace` and `serif`); if the width matches both,
   the browser fell back and the family is missing. Unquoted generic families
   (`serif`, `sans-serif`, `system-ui`, …) always render; a quoted name such as
   `"serif"` is a literal font name and is checked like any other. A CSS-wide
   keyword (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) as the
   whole value is accepted and rendered with the initial font (see
   [rendering.md](rendering.md#text-style)).

   Clearing the field falls back to System, and the select switches to System.
4. **Weight**: Normal / Bold toggle.
5. **Display area**: segmented control with 25% / 50% / 75% / 100%.
6. **Max on screen**: slider, 20 – 300.
7. **Reset to defaults**: restores every setting, including opacity, font size
   and speed, to its default.

Segmented controls and swatches are ARIA radio groups with one tab stop each
(the checked option, or the first when none is checked, e.g. a typed color).
Arrow keys move to the previous or next option and select it, wrapping at the
ends; Home and End jump to the first and last.

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
