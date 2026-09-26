# Data Model

## Comment

The parser's output and the renderer's input.

```ts
interface Comment {
  time: number;                     // seconds from start
  text: string;
  mode: 'scroll' | 'top' | 'bottom';
  color: string;                    // '#rrggbb'
}
```

Comments are stored sorted by `time`.

## Input formats

Format is detected from content, not the file extension: a document whose root
element is `<i>` is Bilibili XML; valid JSON is the custom format; anything else
is rejected.

### Bilibili XML

```xml
<i>
  <d p="12.34,1,25,16777215,...">text</d>
</i>
```

Fields used from `p`: index 0 is time (seconds), index 1 is mode, index 3 is color
as a decimal RGB integer.

| Bilibili mode | `Comment.mode` |
|---|---|
| 1, 2, 3 | `scroll` |
| 4 | `bottom` |
| 5 | `top` |
| 7, 8, others | skipped |

The font size field (index 2) is ignored; size comes from the global font scale.

### Custom JSON

Meant to be hand-written, so it is lenient:

```json
[
  { "time": 1.5, "text": "here it comes" },
  { "time": 3, "text": "hello", "mode": "top", "color": "#ff0000" }
]
```

- `time` (number, ≥ 0) and `text` (non-empty string) are required.
- `mode` defaults to `scroll`; `color` defaults to `#ffffff`.
- An item whose `mode` is not one of the three values, or whose `color` is not
  `#rrggbb`, fails validation.
- Items that fail validation are skipped and counted; the import reports
  "imported N, skipped M". A file where every item is invalid is an error.

## URL key

Danmaku is bound to a normalized URL:

- Drop the `#hash`.
- Drop tracking parameters (`utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`,
  `igshid`, `si`) and timestamp parameters (`t`, `start`).
- On YouTube watch pages (`*.youtube.com/watch`), keep only `v`; playlist
  parameters (`list`, `index`, `pp`) depend on how the video was opened.
- Sort the remaining query parameters.
- Keep scheme, host and path as-is.

So `https://www.youtube.com/watch?t=42&v=abc&utm_source=x` becomes
`https://www.youtube.com/watch?v=abc`.

## Storage layout

All data lives in `browser.storage.local`. The extension requests the
`unlimitedStorage` permission because Chrome's default 10 MB quota is easy to
fill with Bilibili files.

| Key | Value |
|---|---|
| `index` | `{ urlKey, title, fileName, count, importedAt }[]`: a summary list for the popup, so it never loads full comment arrays |
| `danmaku:<urlKey>` | `{ offset: number, comments: Comment[] }` |
| `settings` | `{ opacity, fontScale, speed }` |

- One danmaku file per URL key. Importing onto a URL that already has one asks for
  confirmation before replacing it.
- `offset` (seconds, may be negative) is stored per entry, because a sync offset
  describes one file against one video.
- `title` is the page's `document.title` at import time, for display in the library.
- The **enabled state is not stored**. It lives in the content script's memory, so
  every page load starts with danmaku off.

## Settings

| Setting | Range | Default | Meaning |
|---|---|---|---|
| `opacity` | 0.1 – 1 | 0.8 | Overlay opacity |
| `fontScale` | 0.5 – 2 | 1 | Multiplier on the base font size (25 px) |
| `speed` | 4 – 16 | 8 | Seconds for a scrolling comment to cross the overlay |
