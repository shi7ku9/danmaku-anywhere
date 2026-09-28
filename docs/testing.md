# Testing

## Unit tests (Vitest)

Cover the pure logic, where bugs are cheap to catch:

- **`parser`**: Bilibili modes 1–5 mapping, skipped modes 7/8, decimal-to-hex
  color, JSON defaults, invalid items skipped and counted, all-invalid and
  unrecognized input rejected, output sorted by time.
- **`url-key`**: hash removal, tracking and timestamp parameters dropped,
  parameter ordering, YouTube `v=` preserved.
- **Lane allocation**: scroll lanes avoid present and future overlap, top/bottom
  lanes fill from their edge, a full screen drops the comment.
- **Visible window**: binary-search boundaries, seeks and backward jumps.
- **`LoopClock`**: starts at 0 and wraps after the last comment.

DOM positioning, fullscreen and real video sync are not unit-tested; mocking them
buys little. They are covered by the manual checklist.

## Manual checklist

Run in both Chrome and Firefox before calling a change done.

- [ ] YouTube: import Bilibili XML; toggle with popup and shortcut.
- [ ] Pause, seek forward and back: comments follow the video.
- [ ] Offset `+1s`/`−1s` shifts comments live and persists after reload.
- [ ] Player fullscreen: comments remain visible.
- [ ] Switch to another video in the same tab: danmaku turns off; the new video's
      danmaku (if any) is loaded.
- [ ] Reload the page: danmaku is loaded but off.
- [ ] Page with two videos: Auto follows the larger playing one; choosing the
      other moves the overlay onto it; removing the chosen video from the page
      returns the select to Auto.
- [ ] Video page with None chosen: comments loop even while the video plays;
      Auto brings back video sync. Reloading resets the choice to Auto.
- [ ] Plain article page: import JSON; comments play from 0 and loop.
- [ ] Settings sliders apply live to an open tab.
- [ ] Delete an entry from the library; the page shows "no danmaku".
- [ ] Restricted page (`chrome://extensions` / `about:addons`): popup shows the
      unavailable message.
- [ ] Clicks pass through the overlay to the page underneath.
