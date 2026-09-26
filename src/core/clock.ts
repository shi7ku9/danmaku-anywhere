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

  /** Changes the loop length, keeping the current position within the loop. */
  setPeriod(period: number): void {
    const position = this.now();
    this.period = period;
    this.startedAt = this.perfNow() - position * 1000;
  }

  now(): number {
    const elapsed = (this.perfNow() - this.startedAt) / 1000;
    return this.period > 0 ? elapsed % this.period : elapsed;
  }
}

/** Loop length: the last comment's time plus the longest time a comment stays visible. */
export function loopPeriod(comments: readonly Comment[], speed: number): number {
  const last = comments.at(-1)?.time ?? 0;
  return last + Math.max(speed, FIXED_DURATION);
}
