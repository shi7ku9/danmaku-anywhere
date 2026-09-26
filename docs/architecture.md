# Architecture

## Stack

- **WXT**: builds one codebase into a Chrome MV3 and a Firefox extension, with
  TypeScript, hot reload and a typed `storage` wrapper.
- **Rendering**: plain DOM elements moved with CSS transforms, inside a Shadow DOM
  (see [rendering.md](rendering.md)). No danmaku library; the available ones are
  unmaintained and would still need wrapping for our two sync modes.
- **Tests**: Vitest.

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
│ window      │ ─────────┼──────────────────┼───┘
└─────────────┘          │  (shortcut)      │
       │                 └──────────────────┘
       ▼
  browser.storage.local
```

- **Content script**: injected into every page. Owns the overlay and the enabled
  state for its tab.
- **Popup**: queries the active tab's content script for status, sends toggle and
  offset changes, edits global settings, manages the stored library.
- **Import window** (`import.html`): a small extension page opened with
  `windows.create`. It exists because file pickers cannot be opened reliably from
  either the popup (Firefox closes the popup when the picker opens) or the content
  script (the page lacks the user activation required by `input.click()`).
- **Background**: listens for the keyboard shortcut and forwards it to the active
  tab. Relays "reload" from the import window to the target tab.

## Modules

Each module has a single job and can be tested on its own.

| Module | Responsibility | Depends on |
|---|---|---|
| `parser/` | Detect format; parse Bilibili XML or JSON into `Comment[]` | nothing (pure) |
| `url-key` | Normalize a URL into a storage key | nothing (pure) |
| `store` | Read/write danmaku entries, index and settings | WXT storage |
| `clock` | `VideoClock` and `LoopClock`, both exposing `now(): number` | DOM |
| `video-finder` | Pick the target `<video>` and detect when it changes | DOM |
| `renderer` | Lane allocation and DOM updates for a given time | DOM |
| `overlay` | Position the overlay over the video or viewport; fullscreen handling | DOM |
| `controller` | Content script entry: wires everything together, handles messages | all |

The renderer never knows where time comes from; it only calls `clock.now()`.
The difference between video mode and loop mode lives entirely in the clock.
Lane allocation and visible-window lookup are pure functions inside `renderer`
so they can be tested without a DOM.

## Target video selection

`video-finder` picks the `<video>` that is playing and has the largest on-screen
area. If none is playing, the page is treated as having no video (loop mode).
The choice is re-evaluated when videos start playing or are added/removed.

## Messages

| From → To | Message | Payload / reply |
|---|---|---|
| popup → content | `getStatus` | → `{ urlKey, entry?: { fileName, count, offset }, enabled, mode }` |
| popup → content | `setEnabled` | `{ enabled }` |
| popup → content | `setOffset` | `{ offset }` (content persists it) |
| background → content | `toggle` | — |
| import → background → content | `reload` | `{ urlKey }` |

Global settings changes are not messaged; the content script watches the
`settings` storage key and applies changes live.

A failed `getStatus` (no receiver) means the page is restricted or was open
before the extension was installed; see [ui.md](ui.md#error-handling).
