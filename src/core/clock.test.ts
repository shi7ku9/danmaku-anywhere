import { describe, expect, it } from 'vitest';
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
