import { describe, expect, it } from 'vitest';
import { LoopClock, VideoClock, loopPeriod } from './clock';

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

  it('never wraps with a zero period', () => {
    let ms = 0;
    const clock = new LoopClock(0, () => ms);
    ms = 12_000;
    expect(clock.now()).toBe(12);
  });
});

describe('VideoClock', () => {
  it('follows currentTime', () => {
    const video = document.createElement('video');
    const clock = new VideoClock(video);
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    expect(clock.now()).toBe(42);
  });
});

describe('loopPeriod', () => {
  it('is the last comment time plus the longest display time', () => {
    const c = (time: number) => ({ time, text: 'x', mode: 'scroll' as const, color: '#ffffff' });
    expect(loopPeriod([c(1), c(30)], 8)).toBe(38);
    expect(loopPeriod([c(30)], 2)).toBe(34);
  });
});
