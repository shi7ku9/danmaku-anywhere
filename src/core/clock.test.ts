import { beforeEach, describe, expect, it } from 'vitest';
import { LoopClock, loopPeriod, VideoClock } from './clock';

describe('LoopClock', () => {
  it('starts at 0 and counts seconds', () => {
    let ms = 5000;
    const clock = new LoopClock(100, () => ms);
    expect(clock.now()).toBe(0);
    ms += 2500;
    expect(clock.now()).toBe(2.5);
  });

  it('wraps after the period', () => {
    let ms = 0;
    const clock = new LoopClock(10, () => ms);
    ms = 12_000;
    expect(clock.now()).toBe(2);
  });

  it('keeps the current position when the period changes after a full loop', () => {
    let ms = 0;
    const clock = new LoopClock(38, () => ms);
    ms = 100_000; // 100 s into a 38 s loop: position 24
    expect(clock.now()).toBe(24);
    clock.setPeriod(46);
    expect(clock.now()).toBe(24);
    ms += 1000;
    expect(clock.now()).toBe(25);
  });

  it('wraps into a shorter period that the position already exceeds', () => {
    let ms = 0;
    const clock = new LoopClock(38, () => ms);
    ms = 30_000;
    clock.setPeriod(20);
    expect(clock.now()).toBe(10);
  });

  it('shifts within the loop, wrapping negative positions', () => {
    let ms = 0;
    const clock = new LoopClock(18, () => ms);
    expect(clock.now(-10)).toBe(8);
    ms = 5000;
    expect(clock.now(-10)).toBe(13);
    ms = 12_000;
    expect(clock.now(-10)).toBe(2);
  });

  it('keeps the shifted position when the period changes', () => {
    let ms = 0;
    const clock = new LoopClock(18, () => ms);
    ms = 5000;
    expect(clock.now(-10)).toBe(13);
    clock.setPeriod(26, -10);
    expect(clock.now(-10)).toBe(13);
  });

  it('never wraps with a zero period', () => {
    let ms = 0;
    const clock = new LoopClock(0, () => ms);
    ms = 12_000;
    expect(clock.now()).toBe(12);
  });
});

describe('VideoClock', () => {
  interface FakeVideo {
    currentTime: number;
    paused: boolean;
    ended: boolean;
    seeking: boolean;
    readyState: number;
    playbackRate: number;
  }
  const FRAME = 1000 / 60;

  let ms: number;
  let video: FakeVideo;
  let clock: VideoClock;
  beforeEach(() => {
    ms = 0;
    video = { currentTime: 10, paused: false, ended: false, seeking: false, readyState: 4, playbackRate: 1 };
    clock = new VideoClock(video as unknown as HTMLVideoElement, () => ms);
  });

  /**
   * Plays for `seconds` at 60 fps; `currentTime` shows the true position only
   * every `updateMs` (Firefox-like steps; 0 = every read, like Chromium).
   * Returns the clock readings, one per frame.
   */
  const play = (seconds: number, updateMs: number) => {
    const start = video.currentTime;
    const startMs = ms;
    const readings: number[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      ms += FRAME;
      const elapsed = ms - startMs;
      const shown = updateMs ? Math.floor(elapsed / updateMs) * updateMs : elapsed;
      video.currentTime = start + (shown / 1000) * video.playbackRate;
      readings.push(clock.now());
    }
    return readings;
  };
  const steps = (readings: number[]) => readings.slice(1).map((r, i) => r - readings[i]!);

  it('starts at currentTime', () => {
    expect(clock.now()).toBe(10);
  });

  it('advances on every frame when currentTime updates in coarse steps', () => {
    clock.now();
    const readings = play(3, 50);
    // After settling, every frame moves forward by about one frame's worth, never 0.
    for (const step of steps(readings).slice(60)) {
      expect(step).toBeGreaterThan((FRAME / 1000) * 0.5);
      expect(step).toBeLessThan((FRAME / 1000) * 1.5);
    }
    // And stays close to the true position.
    expect(Math.abs(readings.at(-1)! - (10 + ms / 1000))).toBeLessThan(0.06);
  });

  it('tracks a smoothly updating currentTime closely', () => {
    clock.now();
    const readings = play(2, 0);
    expect(readings.at(-1)).toBeCloseTo(10 + ms / 1000, 3);
  });

  it('follows the playback rate', () => {
    clock.now();
    video.playbackRate = 2;
    const readings = play(2, 50);
    expect(Math.abs(readings.at(-1)! - (10 + (2 * ms) / 1000))).toBeLessThan(0.12);
  });

  it('never moves backwards when currentTime lags behind the clock', () => {
    clock.now();
    play(1, 50);
    const before = clock.now();
    video.currentTime = before - 0.1; // A small correction backwards.
    ms += FRAME;
    const readings = [clock.now(), ...play(0.5, 50)];
    for (const r of [before, ...readings].slice(1)) expect(r).toBeGreaterThanOrEqual(before);
  });

  it('jumps on a seek', () => {
    clock.now();
    play(1, 50);
    video.currentTime = 100;
    ms += FRAME;
    expect(clock.now()).toBe(100);
    video.seeking = true;
    video.currentTime = 50;
    ms += FRAME;
    expect(clock.now()).toBe(50);
  });

  it('holds while paused, and jumps if seeked while paused', () => {
    clock.now();
    play(1, 50);
    video.paused = true;
    const held = clock.now();
    ms += 2000;
    expect(clock.now()).toBe(held);
    video.currentTime = 30;
    expect(clock.now()).toBe(30);
  });

  it('holds while buffering without enough data', () => {
    clock.now();
    play(1, 50);
    video.readyState = 2;
    const held = clock.now();
    ms += 1000;
    expect(clock.now()).toBe(held);
  });

  it('does not run away from a stalled currentTime', () => {
    clock.now();
    play(1, 50);
    const stuck = video.currentTime;
    for (let i = 0; i < 120; i++) {
      ms += FRAME;
      clock.now();
    }
    expect(clock.now()).toBeLessThanOrEqual(stuck + 0.3);
  });
});

describe('loopPeriod', () => {
  it('is the last comment time plus the longest display time', () => {
    const c = (time: number) => ({ time, text: 'x', mode: 'scroll' as const, color: '#ffffff' });
    expect(loopPeriod([c(1), c(30)], 8)).toBe(38);
    expect(loopPeriod([c(30)], 2)).toBe(34);
  });
});
