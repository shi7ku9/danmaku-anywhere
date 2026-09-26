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
- **Popup**: queries the active tab's content script for status, sends toggle and
  offset changes, edits global settings, manages the stored library.
- **Import window** (`import.html`): a small extension page opened with
  `windows.create`. It exists because file pickers cannot be opened reliably from
  either the popup (Firefox closes the popup when the picker opens) or the content
  script (the page lacks the user activation required by `input.click()`). After
  saving, it sends `reload` straight to the target tab.
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
| `storage/store` | Read/write danmaku entries, index and settings | WXT storage |
| `content/video-finder` | Pick the target `<video>` | DOM |
| `content/renderer` | DOM comment elements for a given time | DOM, `core` |
| `content/overlay` | Position the overlay over the video or viewport; fullscreen handling | DOM |
| `content/controller` | Wires everything together, runs the frame loop, handles messages | all |

The renderer never knows where time comes from; the controller passes it
`clock.now() + offset`. The difference between video mode and loop mode lives
entirely in the clock.

## Target video selection

`video-finder` keeps the current target while it is still in the document and
has a non-zero size, even when paused, so pausing freezes danmaku instead of
switching to loop mode. Otherwise it picks the largest playing video, or none
(loop mode). The controller re-evaluates this every frame while danmaku is on,
so a video that starts playing takes over from loop mode.

## Messages

| From → To | Message | Payload |
|---|---|---|
| popup → content | `getStatus` | — |
| popup → content | `setEnabled` | `{ enabled }` |
| popup → content | `setOffset` | `{ offset }` (content persists it) |
| background → content | `toggle` | — |
| import / popup → content | `reload` | — |

Every message is answered with a `Status`:
`{ urlKey, title, entry: { fileName, count, offset } | null, enabled, mode }`.

Global settings changes are not messaged; the content script watches the
`settings` storage key and applies changes live. It also watches its own
`danmaku:<urlKey>` key, so deleting the entry from any page unloads it.

Index updates (import, delete) run under a Web Lock (`danmaku-index`), so two
import windows or a popup saving at once cannot overwrite each other's rows.

A failed message (no receiver) means the page is restricted or was open before
the extension was installed; see [ui.md](ui.md#error-handling).
