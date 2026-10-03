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
| `library` | `{ id, name, fileName, count, addedAt }[]`: a summary of every saved danmaku, so the popup never loads full comment arrays |
| `danmaku:<id>` | `{ comments: Comment[] }` |
| `bindings` | `Record<urlKey, { danmakuId, offset, title }>`: which danmaku each page uses |
| `settings` | `Settings`: see [Settings](#settings) |

The library holds danmaku **on their own**, independent of any page; a binding
connects a page to one of them.

- **Danmaku**: `id` is a random UUID. `name` starts as the file name and can be
  renamed; `fileName` keeps the original. Comments never change after saving
  (a rename only touches the `library` row), so a danmaku cannot change under a
  page that has it loaded. Importing the same file twice makes two entries; the
  library does not look for duplicates.
- **Binding**: a page (URL key) uses at most one danmaku, and one danmaku can be
  bound to any number of pages, e.g. the same episode on different sites. Using
  another danmaku on a page replaces its binding; the previous danmaku stays in
  the library.
- The **offset** (seconds, may be negative) is stored on the binding, because a
  sync offset describes one danmaku against one video, and the same danmaku may
  need a different offset on each page. A new binding starts at 0. Binding the
  danmaku a page already uses changes nothing. An offset write names the danmaku
  it was set for and is ignored if the page has switched to another one since, so
  a write still queued from before cannot land on the new binding.
- `title` is the page's `document.title` when it was bound, shown in the
  library's list of pages using a danmaku.
- **Deleting** a danmaku removes it and every binding to it; **unbinding** removes
  only that page's binding. Neither touches other danmaku.
- Writes happen in this order, so nothing ever points at data that is not there
  yet (or any more): adding saves the comments, then the `library` row, then the
  binding; deleting removes the bindings, then the `library` row, then the comments.
- Danmaku saved by earlier versions (`index`, `danmaku:<urlKey>`,
  `offset:<urlKey>`) are not migrated. The new keys never collide with them, and
  the old ones are ignored.
- The **enabled state is not stored**. It lives in the content script's memory, so
  every page load starts with danmaku off.

## Settings

| Setting | Range | Default | Meaning |
|---|---|---|---|
| `opacity` | 0.1 – 1 | 0.8 | Overlay opacity |
| `fontScale` | 0.5 – 2 | 1 | Multiplier on the base font size (25 px) |
| `speed` | 4 – 16 | 8 | Seconds for a scrolling comment to cross the overlay |
| `effect` | `outline` / `shadow` / `both` / `none` | `outline` | Text effect for readability |
| `outlineWidth` | 0.5 – 4 | 1 | Outline width in px |
| `outlineColor` | `#rrggbb` | `#000000` | Outline color |
| `shadowBlur` | 0 – 10 | 4 | Drop shadow blur radius in px |
| `shadowOffset` | 0 – 5 | 1 | Drop shadow offset in px, applied to both x and y |
| `shadowColor` | `#rrggbb` | `#000000` | Drop shadow color |
| `fontFamily` | `system` / `sans` / `serif` / `mono` / `custom` | `system` | Font preset, or `custom` to use `customFont` |
| `customFont` | any CSS `font-family` | `''` | Custom font list; kept while a preset is chosen, so switching back to Custom restores it |
| `fontWeight` | 400 / 700 | 700 | Normal or bold |
| `displayArea` | 0.25 / 0.5 / 0.75 / 1 | 1 | Fraction of the overlay height that comments may use: scroll and top comments from the top, bottom comments from the bottom |
| `maxActive` | 20 – 300 | 150 | Maximum comments on screen at once |

Settings are global and apply to every site. The outline and shadow fields are
kept even when `effect` does not use them, so switching effects restores the
previous fine-tuning. The defaults reproduce the original look (1 px black
outline, bold system font, full height, 150 comments).

`getSettings()` merges the stored value over the defaults, so settings saved by
an older version gain the new fields without a migration.
