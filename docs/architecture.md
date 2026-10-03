# Architecture

## Stack

- **WXT**: builds one codebase into a Chrome MV3 and a Firefox extension, with
  TypeScript, hot reload and a typed `storage` wrapper. Auto-imports are off;
  everything is imported explicitly.
- **Rendering**: plain DOM elements moved with CSS transforms, inside a Shadow DOM
  (see [rendering.md](rendering.md)). No danmaku library; the available ones are
  unmaintained and would still need wrapping for our two sync modes.
- **Tests**: Vitest with happy-dom and WXT's fake browser.
- **Permissions**: `storage`, `unlimitedStorage`, and `activeTab`. With `activeTab`
  the popup can read the tab URL and tell restricted pages apart from tabs that
  need a reload.

## Runtime contexts

```
┌─────────────┐   messages    ┌──────────────────────┐
│  Popup      │ ◄───────────► │  Content script      │
│  (toggle,   │               │  (one per tab,       │
│   settings, │               │   render + sync)     │
│   library)  │               └──────────────────────┘
└─────────────┘                    ▲            ▲
       │ opens                     │ toggle     │ reload
       ▼                           │            │
┌─────────────┐          ┌──────────────────┐   │
│ Import      │          │  Background      │   │
│ window      │ ──┐      │  (shortcut)      │   │
└─────────────┘   │      └──────────────────┘   │
       │          └─────────────────────────────┘
       ▼
  browser.storage.local
```

- **Content script**: injected into every top-level page. Owns the overlay and
  the enabled state for its tab.
- **Popup**: queries the active tab's content script for status and sends
  toggles, writes offset changes to storage, edits global settings, and manages
  the library (add, rename, delete, use on the current page, unbind). It re-reads the page status before acting, so a site that
  navigates while the popup is open never gets another page's changes.
- **Import window** (`import.html`): a small extension page opened with
  `windows.create`. It exists because file pickers cannot be opened reliably from
  either the popup (Firefox closes the popup when the picker opens) or the content
  script (the page lacks the user activation required by `input.click()`). It
  saves the file to the library and, when opened for a page, binds it to that
  page, then sends `reload` straight to the target tab.
- **Background**: listens for the keyboard shortcut and forwards it to the active
  tab.

## Modules

Each module has a single job and can be tested on its own.

| Module | Responsibility | Depends on |
|---|---|---|
| `core/parse*` | Detect format; parse Bilibili XML or JSON into `Comment[]` | nothing (pure) |
| `core/url-key` | Normalize a URL into a storage key | nothing (pure) |
| `core/timeline` | Binary search over comments sorted by time | nothing (pure) |
| `core/lanes` | Lane allocation and scroll positions | nothing (pure) |
| `core/clock` | `VideoClock` and `LoopClock`, both exposing `now(): number` | video element |
| `storage/store` | Library (danmaku and bindings) and settings | WXT storage |
| `content/video-finder` | Pick the target `<video>` | DOM |
| `content/renderer` | DOM comment elements for a given time | DOM, `core` |
| `content/overlay` | Position the overlay over the video or viewport; fullscreen handling | DOM |
| `content/controller` | Wires everything together, runs the frame loop, handles messages | all |

The renderer never knows where time comes from; the controller passes it
`clock.now() + offset`. The difference between video mode and loop mode lives
entirely in the clock.

## Target video selection

The popup's video selector sets a **choice** in the content script:

| Choice | Target |
|---|---|
| `auto` (default) | Automatic, below |
| a video id | That video, even when another one is larger or playing |
| `none` | No video: loop mode, even on a page with videos |

**Automatic**: `video-finder` keeps the current target while it is still in the
document and has a non-zero size, even when paused, so pausing freezes danmaku
instead of switching to loop mode. Otherwise it picks the largest playing video,
or none (loop mode). A video that starts playing takes over from loop mode.

**Video ids** come from a `WeakMap` from element to a counter, so a video keeps
its id for as long as it exists and ids are never reused. If the chosen video
leaves the document or loses its size (e.g. a player replaces its element), the
choice falls back to `auto`.

The controller resolves the choice every frame while danmaku is on; changing it
clears the screen and rebuilds the clock, so switching between a video and loop
mode takes effect on the next frame. Like the enabled state, the choice lives
only in the content script's memory: it resets to `auto` on reload and when the
URL key changes.

## Messages

| From → To | Message | Payload |
|---|---|---|
| popup → content | `getStatus` | — |
| popup → content | `setEnabled` | `{ enabled, urlKey }` (ignored if `urlKey` is not the current page) |
| popup → content | `setVideo` | `{ choice, urlKey }`: `choice` is `'auto'`, `'none'` or a video id (ignored if `urlKey` is not the current page) |
| background → content | `toggle` | — |
| import / popup → content | `reload` | — |

Every message is answered with a `Status`:
`{ urlKey, title, entry: { id, bindingId, name, count, offset } | null, enabled, mode, videos, choice, autoTargetId }`.
`entry` describes the danmaku bound to the page: `id` is its library id and
`bindingId` identifies the page's binding, which the popup's offset writes name.

- `videos`: the page's videos with a non-zero size, in document order, each
  `{ id, width, height, playing, currentTime, duration }`.
- `choice`: the current choice.
- `autoTargetId`: the id of the video `auto` follows, or would follow if chosen
  while another choice is active, or `null` when it would loop. The popup names
  it in the Auto option, so the option describes Auto itself rather than the
  current choice. Whether danmaku currently follows a video is `mode`.

Global settings changes are not messaged; the content script watches the
`settings` storage key and applies changes live. It also follows the library
through `storage.onChanged`, looking only at its own page and danmaku:

- **Its `bindings` row** (the page's URL key): a different binding (a different
  `id` or `danmakuId`, or the row disappearing) reloads it, since the binding is
  written last, so the comments are in place, and a new binding carries its own
  offset; a changed `offset` alone is applied in place, keeping playback.
- **Its danmaku's `library` row**: a changed `name` alone is updated in place,
  without clearing the screen. The latest names seen are kept, so a reload that
  read the library before a rename cannot bring the old name back. Deleting the
  danmaku removes the binding first, which the `bindings` rule above handles.

Every library change (add, rename, delete, bind, unbind, offset) runs under one
Web Lock (`danmaku-library`) covering the danmaku, the `library` row and the
bindings together, so overlapping changes from different windows cannot leave
them out of sync. Web Locks are per origin, so these writes happen only in
extension pages (popup, import window); content scripts run in the page's origin
and never write the library.

Before handling any message, the content script re-checks the page URL, so a
single-page navigation that has not been picked up yet never binds an import
or a toggle to the previous page. A page's danmaku is loaded from its binding;
a binding whose comments are missing is treated as no danmaku.

Reloads can overlap: using a danmaku from the popup writes the binding, which
both makes the popup send `reload` and makes the content script see the storage
change, and the two can arrive in either order. Only the newest reload applies
its result, and an older one resolves only once the newest has been applied, so
the reply to a `reload` message never carries state older than that reload (a
stale reply would leave the popup showing no danmaku and its switch disabled).

A failed message (no receiver) means the page is restricted or was open before
the extension was installed; see [ui.md](ui.md#error-handling).
