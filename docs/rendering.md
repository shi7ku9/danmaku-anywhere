# Rendering and Sync

## Clocks

Both clocks expose `now(): number` in seconds. The renderer uses
`t = clock.now() + entry.offset`.

- **`VideoClock`**: returns `video.currentTime`. Pausing the video pauses the
  comments automatically, since positions are derived from time alone.
- **`LoopClock`**: returns `(performance.now() - startedAt) / 1000`, starting when
  danmaku is turned on. After the last comment's time plus the display duration,
  it wraps back to 0.

The controller uses `VideoClock` when `video-finder` has a target, otherwise
`LoopClock`. If the target video changes or disappears, the controller swaps the
clock and clears the screen.

## Frame loop

Runs on `requestAnimationFrame` only while danmaku is enabled.

1. Read `t`. If it moved backwards or jumped forward by more than 1 s since the
   last frame (a seek or loop wrap), clear all active comments and rewind the
   cursor with a binary search to the first comment at `t − max(speed, 4)`.
2. A cursor over the sorted comments spawns each comment once its time arrives,
   provided it is still inside its visible window `time ∈ [t − duration, t]`,
   where `duration` is `speed` for scrolling comments and 4 s for top/bottom
   comments.
3. Allocate a lane to each newly visible comment (below). If no lane fits, the
   comment is dropped and not retried.
4. Update each scrolling comment's position:
   `x = overlayWidth − (t − comment.time) × (overlayWidth + textWidth) / speed`,
   applied as `transform: translateX(x px)`.
5. Remove comments whose time has left the visible window.

Because `speed` is "seconds to cross", comments feel equally fast on any overlay size.

## Lane allocation

Lane height is the line height at the current font scale; the lane count is
`floor(overlayHeight / laneHeight)`.

- **Scroll**: pick the first lane from the top where the previous comment's tail
  has already entered the overlay (no overlap now) and the new comment will not
  catch up with it before the previous one exits (no overlap later).
- **Top**: first free lane from the top; occupied for 4 s.
- **Bottom**: first free lane from the bottom; occupied for 4 s.

Lane allocation is a pure function of lane state, comment and time, and is unit-tested.

## DOM and performance

- The overlay is a host element with a Shadow DOM, so page CSS cannot affect it
  and our CSS cannot leak out.
- Each comment is an absolutely positioned `<div>` with white-ish text and a dark
  text outline (`text-shadow`) for readability on any background.
- Divs that leave the screen go back to a pool and are reused.
- At most 150 comments are on screen at once; beyond that, new ones are dropped.
- The overlay has `pointer-events: none` and never blocks clicks.
- Text width is measured once when a comment is first shown.

## Overlay positioning

- **Video mode**: `position: fixed`, matched to the video's
  `getBoundingClientRect()`. Repositioned every frame; polling while danmaku is on
  covers scrolling, resizing and layout changes without observers.
- **Loop mode**: covers the viewport.
- **Fullscreen**: each frame, if `document.fullscreenElement` changed, move the
  overlay host into it; move it back to `document.documentElement` on exit.
  If the fullscreen element is the `<video>` itself, nothing can be drawn over it.
  This is a platform limitation and is accepted.
- `z-index` is the maximum value.

## Page and video changes

Single-page sites (e.g. YouTube) change the URL without reloading. The controller
checks the URL key on WXT's location-change event and on a 1 s interval as a
fallback. When the key changes:

1. Turn danmaku off and clear the overlay.
2. Load the entry for the new key (if any).

The target video is re-evaluated every frame (see
[architecture.md](architecture.md#target-video-selection)).
