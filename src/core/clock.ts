import { FIXED_DURATION } from './lanes';
import type { Comment } from './types';

export interface Clock {
  /** Current playback position in seconds. */
  now(): number;
}

/** Follows a video element, so pausing and seeking carry over to danmaku. */
export class VideoClock implements Clock {
  readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  now(): number {
    return this.video.currentTime;
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
