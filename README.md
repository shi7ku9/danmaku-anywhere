# Danmaku

Bullet comments (danmaku) on any website, for Chrome and Firefox.

Import a danmaku file for the page you are on, turn it on, and comments fly across
the video in sync with playback. A personal project: everything stays in your
browser, with no account and no backend.

## Features

- **Video sync**: comments follow the page's video through play, pause, seek and
  fullscreen.
- **Loop mode**: on pages without a video, comments play from the moment you turn
  them on and loop when finished.
- **Bound to the page**: danmaku is saved for the page URL (tracking parameters
  are ignored; YouTube keeps only the video ID) and loaded automatically next
  time, but stays off until you turn it on.
- **Sync offset** per page, adjustable live.
- **Styles**: opacity, font size and speed, plus advanced options: outline and/or
  shadow with width, blur and color; font presets or any custom font list
  (checked against installed fonts); weight; display area to keep the middle of
  the video clear; and a cap on comments on screen. A live preview shows the
  result.
- **Keyboard shortcut**: `Alt+Shift+D` toggles danmaku on the current page
  (rebindable in the browser's extension shortcut settings).

## Supported files

- **Bilibili XML**: scrolling, top and bottom comments (modes 1–5) with their
  colors. Advanced comments (modes 7 and 8) are skipped.
- **JSON**: a simple format meant to be written by hand.

  ```json
  [
    { "time": 1.5, "text": "here it comes" },
    { "time": 3, "text": "hello", "mode": "top", "color": "#ff0000" }
  ]
  ```

  `time` (seconds) and `text` are required; `mode` is `scroll` (default), `top`
  or `bottom`; `color` is `#rrggbb` (default white). Invalid items are skipped
  and counted.

The format is detected from the content, not the file extension. See
[docs/data-model.md](docs/data-model.md) for details.

## Install

The extension is not published on the browser stores. Build it from source
(requires Node.js and [pnpm](https://pnpm.io/)):

```bash
pnpm install
pnpm build            # Chrome → .output/chrome-mv3
pnpm build:firefox    # Firefox → .output/firefox-mv2
```

- **Chrome**: open `chrome://extensions`, enable Developer mode, click
  *Load unpacked* and choose `.output/chrome-mv3`.
- **Firefox**: open `about:debugging#/runtime/this-firefox`, click
  *Load Temporary Add-on…* and choose `.output/firefox-mv2/manifest.json`.
  Temporary add-ons are removed when Firefox restarts.

## Usage

1. Open the page with the video and click the extension icon.
2. Click **Import file…** and pick (or drop) a Bilibili XML or JSON file.
3. Turn danmaku on with the switch or `Alt+Shift+D`.
4. If comments are early or late, adjust the **Offset**.
5. Tune the look with the sliders and **Advanced style**; changes apply live to
   all tabs.
6. **Library** lists every saved page and lets you delete entries.

## Development

| Command | What it does |
|---|---|
| `pnpm dev` | Run in Chrome with live reload |
| `pnpm dev:firefox` | Run in Firefox with live reload |
| `pnpm build` / `pnpm build:firefox` | Production build |
| `pnpm compile` | Type-check |
| `pnpm test` | Unit tests (Vitest) |

Built with TypeScript and [WXT](https://wxt.dev/). Source layout:

- `src/core/`: pure logic, such as parsers, URL keys, clocks, lane allocation and
  text styles
- `src/content/`: the overlay, renderer and page controller
- `src/storage/`: local storage access
- `src/entrypoints/`: background, content script, popup and import window

Design documents live in [docs/](docs/README.md):
[architecture](docs/architecture.md), [data model](docs/data-model.md),
[rendering](docs/rendering.md), [UI](docs/ui.md) and
[testing](docs/testing.md), which includes the manual checklist to run in both
browsers before a change is done.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Privacy

All data, including danmaku files, offsets and settings, is kept in the browser's
local extension storage. Nothing is collected or sent anywhere.

## License

[MIT](LICENSE)
