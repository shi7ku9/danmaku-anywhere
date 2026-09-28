# Rendering and Sync

## Clocks

Both clocks expose `now(): number` in seconds. The renderer uses
`t = clock.now() + entry.offset`.

- **`VideoClock`**: returns `video.currentTime`. Pausing the video pauses the
  comments automatically, since positions are derived from time alone.
- **`LoopClock`**: returns `(performance.now() - startedAt) / 1000`, starting when
  danmaku is turned on. After the last comment's time plus the display duration,
  it wraps back to 0. The entry's offset shifts the position within the loop
  (applied before wrapping), so a negative offset never cuts off the last comments.

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
`floor(overlayHeight / laneHeight)`. The display area limits each comment to
`limit = max(1, floor(overlayHeight × displayArea / laneHeight))` lanes (at least
one, so a small area on a short overlay never hides every comment): scroll and top
comments use the first `limit` lanes, bottom comments the last `limit`. Both
numbers are computed when the lanes are rebuilt, not per comment. A smaller
display area therefore keeps the middle of the video clear while bottom comments
stay at the bottom. Where the two ranges overlap (above 50%), top and bottom
comments share the same lanes and never overlap each other.

- **Scroll**: pick the first lane from the top where the previous comment's tail
  has already entered the overlay (no overlap now) and the new comment will not
  catch up with it before the previous one exits (no overlap later).
- **Top**: first free lane from the top; occupied for 4 s.
- **Bottom**: first free lane from the bottom; occupied for 4 s.

Lane allocation is a pure function of lane state, comment and time, and is unit-tested.

## DOM and performance

- The overlay is a host element with a Shadow DOM, so page CSS cannot affect it
  and our CSS cannot leak out.
- Each comment is an absolutely positioned `<div>`. Font family, weight and
  text effect come from the settings and are set on the stage, so every comment
  inherits them (see [Text style](#text-style)).
- Divs that leave the screen go back to a pool and are reused.
- At most `maxActive` comments are on screen at once; beyond that, new ones are dropped.
- The overlay has `pointer-events: none` and never blocks clicks.
- Text width is measured once when a comment is first shown.

## Text style

`src/core/style.ts` turns settings into CSS and is shared by the overlay and the
popup preview, so the preview always matches what is drawn:

- `textShadow(settings)`: the `text-shadow` value for the current `effect`.
  - `outline`: copies of the text, with no blur, in `outlineColor`, offset
    evenly around a circle of radius `outlineWidth`: `max(8, ⌈2π × width⌉)`
    copies, about 1 px apart, so the outline follows the glyphs with round
    corners. Eight fixed directions would square it off at larger widths, and
    `-webkit-text-stroke` grows spikes at sharp glyph corners.
  - `shadow`: one copy offset by `shadowOffset` down and right, blurred by
    `shadowBlur`, in `shadowColor`.
  - `both`: the outline followed by the shadow.
  - `none`: `none`.
- `fontStack(settings)`: maps the presets to font stacks (`system` →
  `system-ui, sans-serif`, `sans` → `sans-serif`, `serif` → `serif`, `mono` →
  `monospace`). For `custom` it uses `customFont` as-is, so a custom value that
  happens to match a preset name (e.g. `sans`) stays a literal font name. An
  empty custom font or an unknown `fontFamily` falls back to `system`. A
  CSS-wide keyword (`inherit`, `initial`, `unset`, `revert`, `revert-layer`)
  becomes `initial`: on the stage every one of them ends up at the initial
  font, inherited from the host's `all: initial`, and mapping them here keeps
  the popup preview from inheriting the popup's own font instead.
- `BASE_FONT_SIZE` (25 px): the comment font size at scale 1, shared by the
  renderer and the popup preview.

## Settings changes

The renderer compares new settings with the previous ones:

- **Relayout** (clear the screen; the next frame re-spawns what should be
  visible): `fontScale`, the resolved font (`fontStack`, so editing the custom
  font while a preset is chosen does not redraw), `fontWeight` (text width and
  lane height),
  `speed` (positions) and `displayArea` (lane limit).
- **Restyle only**: `opacity`, `effect` and the outline and shadow fields update
  the stage style in place.
- `maxActive` takes effect on the next spawn; comments already on screen stay.

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
