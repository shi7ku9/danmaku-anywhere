import { FIXED_DURATION } from './lanes';
import type { Comment } from './types';

export interface Clock {
  /** Current playback position in seconds. */
  now(): number;
}

/** A gap (s) up to this is smoothed over; beyond it the video was seeked, and the clock jumps. */
const MAX_DRIFT = 0.3;
/** Seconds over which a small gap to `currentTime` is closed. */
const CATCH_UP = 0.25;
/** `HTMLMediaElement.HAVE_FUTURE_DATA`: enough data to keep playing. */
const HAVE_FUTURE_DATA = 3;

/**
 * Follows a video element, so pausing and seeking carry over to danmaku.
 *
 * Firefox updates `currentTime` in coarse steps (Chromium interpolates it), so
 * reading it every frame makes comments stutter. While the video plays, the
 * clock runs on `performance.now()` and only steers toward `currentTime`,
 * without ever moving backwards (the renderer would read that as a seek).
 */
export class VideoClock implements Clock {
  readonly video: HTMLVideoElement;
  private readonly perfNow: () => number;
  /** Last returned position and when (ms); NaN before the first read. */
  private position = Number.NaN;
  private positionAt = 0;
  /** Last `currentTime` seen, to notice when it reports a new value. */
  private reported = Number.NaN;
  /** Gap to `currentTime` still to be closed, in seconds. */
  private drift = 0;

  constructor(video: HTMLVideoElement, perfNow: () => number = () => performance.now()) {
    this.video = video;
    this.perfNow = perfNow;
  }

  now(): number {
    const video = this.video;
    const current = video.currentTime;
    const at = this.perfNow();
    if (Number.isNaN(this.position) || video.seeking) return this.jump(current, at);

    const playing = !video.paused && !video.ended && video.readyState >= HAVE_FUTURE_DATA;
    if (!playing) {
      // Hold still, unless the video is somewhere else (e.g. seeked while paused).
      if (Math.abs(current - this.position) > MAX_DRIFT) return this.jump(current, at);
      this.positionAt = at;
      this.reported = current;
      this.drift = 0;
      return this.position;
    }

    const elapsed = (at - this.positionAt) / 1000;
    let t = this.position + elapsed * video.playbackRate;
    if (current !== this.reported) {
      this.reported = current;
      const gap = current - t;
      if (Math.abs(gap) > MAX_DRIFT) return this.jump(current, at);
      this.drift = gap;
    }
    const step = this.drift * Math.min(1, elapsed / CATCH_UP);
    this.drift -= step;
    t += step;
    // Don't run away from a video that stalls while "playing", and never go backwards.
    t = Math.max(Math.min(t, current + MAX_DRIFT), this.position);
    this.position = t;
    this.positionAt = at;
    return t;
  }

  private jump(current: number, at: number): number {
    this.position = current;
    this.positionAt = at;
    this.reported = current;
    this.drift = 0;
    return current;
  }
}

/** Counts from 0 at creation and wraps after `period` seconds (0 = never). */
export class LoopClock implements Clock {
  private period: number;
  private readonly perfNow: () => number;
  private startedAt: number;

  constructor(period: number, perfNow: () => number = () => performance.now()) {
    this.period = period;
    this.perfNow = perfNow;
    this.startedAt = perfNow();
  }

  /** Changes the loop length, keeping the position as seen with `shift` (see `now`). */
  setPeriod(period: number, shift = 0): void {
    const position = this.now(shift);
    this.period = period;
    this.startedAt = this.perfNow() - (position - shift) * 1000;
  }

  /**
   * Position in the loop, optionally shifted by `shift` seconds. The shift is
   * applied before wrapping so every part of the loop stays reachable.
   */
  now(shift = 0): number {
    const t = (this.perfNow() - this.startedAt) / 1000 + shift;
    return this.period > 0 ? ((t % this.period) + this.period) % this.period : t;
  }
}

/** Loop length: the last comment's time plus the longest time a comment stays visible. */
export function loopPeriod(comments: readonly Comment[], speed: number): number {
  const last = comments.at(-1)?.time ?? 0;
  return last + Math.max(speed, FIXED_DURATION);
}
