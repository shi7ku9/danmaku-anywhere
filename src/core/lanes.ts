import type { CommentMode } from './types';

/** Seconds a top/bottom comment stays on screen. */
export const FIXED_DURATION = 4;

/** Minimum horizontal gap between scrolling comments in one lane, in px. */
const GAP = 16;

export interface StageGeometry {
  /** Overlay width in px. */
  width: number;
  /** Seconds for a scrolling comment to cross the overlay. */
  speed: number;
}

interface ScrollOccupant {
  time: number;
  width: number;
}

export interface Lanes {
  /** The last scrolling comment placed in each lane. */
  scroll: (ScrollOccupant | null)[];
  /** Time until which each lane is held by a top/bottom comment. */
  fixed: number[];
}

export function createLanes(count: number): Lanes {
  return {
    scroll: Array.from({ length: count }, () => null),
    fixed: Array.from({ length: count }, () => -Infinity),
  };
}

/**
 * Left edge (px) of a scrolling comment at time t. It enters at the right edge
 * at `time` and has fully left the overlay after `speed` seconds.
 */
export function scrollX(g: StageGeometry, time: number, width: number, t: number): number {
  return g.width - ((t - time) * (g.width + width)) / g.speed;
}

/**
 * Picks a lane for a comment shown at time t and records it; returns -1 if none fits.
 * Scroll and top comments use only the first `limit` lanes, bottom comments only
 * the last `limit`, so a reduced display area keeps the middle clear.
 */
export function allocateLane(
  lanes: Lanes,
  g: StageGeometry,
  c: { time: number; mode: CommentMode; width: number },
  t: number,
  limit = lanes.fixed.length,
): number {
  const count = lanes.fixed.length;
  limit = Math.min(limit, count);
  if (c.mode === 'scroll') {
    for (let i = 0; i < limit; i++) {
      const prev = lanes.scroll[i];
      if (!prev || fitsAfter(g, prev, c, t)) {
        lanes.scroll[i] = { time: c.time, width: c.width };
        return i;
      }
    }
    return -1;
  }

  for (let k = 0; k < limit; k++) {
    const i = c.mode === 'top' ? k : count - 1 - k;
    if (lanes.fixed[i]! <= t) {
      lanes.fixed[i] = c.time + FIXED_DURATION;
      return i;
    }
  }
  return -1;
}

/**
 * Whether `c` can follow `prev` in the same lane. The gap between them changes
 * linearly, so checking now and when `prev` exits covers the whole overlap.
 */
function fitsAfter(g: StageGeometry, prev: ScrollOccupant, c: { time: number; width: number }, t: number): boolean {
  const prevExit = prev.time + g.speed;
  if (t >= prevExit) return true;
  const clearNow = scrollX(g, prev.time, prev.width, t) + prev.width + GAP <= scrollX(g, c.time, c.width, t);
  const clearLater = scrollX(g, c.time, c.width, prevExit) >= 0;
  return clearNow && clearLater;
}
