import { describe, expect, it } from 'vitest';
import { allocateLane, createLanes, scrollX } from './lanes';

const g = { width: 1000, speed: 8 };
const scroll = (time: number, width = 100) => ({ time, mode: 'scroll' as const, width });

describe('scrollX', () => {
  it('starts at the right edge and ends fully past the left edge', () => {
    expect(scrollX(g, 0, 100, 0)).toBe(1000);
    expect(scrollX(g, 0, 100, 8)).toBe(-100);
  });
});

describe('allocateLane: scroll', () => {
  it('puts the first comment in lane 0', () => {
    expect(allocateLane(createLanes(3), g, scroll(0), 0)).toBe(0);
  });

  it('does not stack a comment right behind one that just entered', () => {
    const lanes = createLanes(3);
    allocateLane(lanes, g, scroll(0, 200), 0);
    expect(allocateLane(lanes, g, scroll(0, 200), 0)).toBe(1);
  });

  it('reuses a lane once the previous comment has moved far enough', () => {
    const lanes = createLanes(3);
    allocateLane(lanes, g, scroll(0), 0);
    expect(allocateLane(lanes, g, scroll(2), 2)).toBe(0);
  });

  it('keeps a long fast comment out of a lane where it would catch up', () => {
    const lanes = createLanes(3);
    allocateLane(lanes, g, scroll(0, 50), 0);
    expect(allocateLane(lanes, g, scroll(3, 2000), 3)).toBe(1);
  });

  it('frees a lane once the previous comment has exited', () => {
    const lanes = createLanes(1);
    allocateLane(lanes, g, scroll(0, 5000), 0);
    expect(allocateLane(lanes, g, scroll(8, 5000), 8)).toBe(0);
  });

  it('returns -1 when every lane is busy', () => {
    const lanes = createLanes(2);
    allocateLane(lanes, g, scroll(0), 0);
    allocateLane(lanes, g, scroll(0), 0);
    expect(allocateLane(lanes, g, scroll(0), 0)).toBe(-1);
  });

  it('returns -1 with zero lanes', () => {
    expect(allocateLane(createLanes(0), g, scroll(0), 0)).toBe(-1);
  });
});

describe('allocateLane: top and bottom', () => {
  const fixed = (mode: 'top' | 'bottom', time: number) => ({ time, mode, width: 100 });

  it('fills top lanes from the top and bottom lanes from the bottom', () => {
    const lanes = createLanes(3);
    expect(allocateLane(lanes, g, fixed('top', 0), 0)).toBe(0);
    expect(allocateLane(lanes, g, fixed('top', 0), 0)).toBe(1);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0)).toBe(2);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0)).toBe(-1);
  });

  it('frees a fixed lane after 4 seconds', () => {
    const lanes = createLanes(1);
    allocateLane(lanes, g, fixed('top', 0), 0);
    expect(allocateLane(lanes, g, fixed('top', 3), 3)).toBe(-1);
    expect(allocateLane(lanes, g, fixed('top', 4), 4)).toBe(0);
  });

  it('does not block scroll lanes', () => {
    const lanes = createLanes(1);
    allocateLane(lanes, g, fixed('top', 0), 0);
    expect(allocateLane(lanes, g, scroll(0), 0)).toBe(0);
  });
});

describe('allocateLane: limit', () => {
  const fixed = (mode: 'top' | 'bottom', time: number) => ({ time, mode, width: 100 });

  it('keeps scroll and top comments in the first lanes', () => {
    const lanes = createLanes(10);
    expect(allocateLane(lanes, g, scroll(0), 0, 2)).toBe(0);
    expect(allocateLane(lanes, g, scroll(0), 0, 2)).toBe(1);
    expect(allocateLane(lanes, g, scroll(0), 0, 2)).toBe(-1);
    expect(allocateLane(lanes, g, fixed('top', 0), 0, 2)).toBe(0);
    expect(allocateLane(lanes, g, fixed('top', 0), 0, 2)).toBe(1);
    expect(allocateLane(lanes, g, fixed('top', 0), 0, 2)).toBe(-1);
  });

  it('keeps bottom comments in the last lanes', () => {
    const lanes = createLanes(10);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0, 2)).toBe(9);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0, 2)).toBe(8);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0, 2)).toBe(-1);
  });

  it('shares lanes between top and bottom where the areas overlap', () => {
    const lanes = createLanes(4);
    for (let i = 0; i < 3; i++) allocateLane(lanes, g, fixed('top', 0), 0, 3);
    // Lanes 0–2 are taken by top comments; bottom can only use lane 3.
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0, 3)).toBe(3);
    expect(allocateLane(lanes, g, fixed('bottom', 0), 0, 3)).toBe(-1);
  });
});
