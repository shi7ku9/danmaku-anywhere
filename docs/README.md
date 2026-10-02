# Danmaku Extension

A Chrome/Firefox extension that overlays danmaku (bullet comments) on any website.
A personal project: the goal is something fun and pleasant to use, not a store-ready product.

## Goals

- Import a danmaku file for the current page, or add it to the library, and
  toggle it on/off.
- **Video mode**: when the page has a playing video, comments follow the video's timeline
  (pause, seek and fullscreen all behave correctly).
- **Loop mode**: when there is no video, or the user picks None in the video
  selector, comments play from the moment they are turned on, following the
  file's timestamps, and loop when finished.
- **Video selector**: when a page has several videos, the user can pick which
  one danmaku follows instead of the automatic choice.
- Danmaku is saved in a local **library**, independent of any page. A page URL is
  bound to one danmaku from the library, and the same danmaku can serve several
  pages. Revisiting the URL loads it automatically, but it stays **off** until the
  user turns it on.
- From the library the user can add files, rename, use a danmaku on the current
  page, see which pages use it, unbind pages, and delete.

## Success criteria

On YouTube, import a Bilibili XML file, press the shortcut, and comments play in
sync with the video, including in fullscreen. Close the tab, reopen the same video,
and one click (or the shortcut) brings the comments back.

## Non-goals

- Honoring per-comment font sizes from the source file
- Bilibili advanced/code comments (modes 7 and 8)
- Keyword filtering / blocking
- Detecting duplicate files in the library
- Migrating danmaku saved by earlier versions
- Cloud sync or any backend
- Fetching danmaku from websites automatically
- Store listing assets, i18n

## Documents

- [architecture.md](architecture.md): runtime contexts, modules, messaging
- [data-model.md](data-model.md): comment format, file formats, storage layout
- [rendering.md](rendering.md): clocks, lane allocation, overlay positioning
- [ui.md](ui.md): popup, import window, keyboard shortcut, error handling
- [testing.md](testing.md): unit tests and the manual test checklist
- [tooling.md](tooling.md): formatting, lint, git hooks and CI
