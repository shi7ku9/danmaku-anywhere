import { describe, expect, it } from 'vitest';
import { chooseTarget } from './video-finder';

interface FakeVideo {
  paused: boolean;
  ended: boolean;
  isConnected: boolean;
  size: number;
}

const video = (v: Partial<FakeVideo> = {}) =>
  ({ paused: false, ended: false, isConnected: true, size: 100, ...v }) as unknown as HTMLVideoElement;
const area = (v: HTMLVideoElement) => (v as unknown as FakeVideo).size;

describe('chooseTarget', () => {
  it('picks the largest playing video', () => {
    const small = video({ size: 10 });
    const big = video({ size: 500 });
    expect(chooseTarget(null, [small, big], area)).toBe(big);
  });

  it('ignores paused and ended videos when picking', () => {
    const paused = video({ paused: true, size: 900 });
    const ended = video({ ended: true, size: 900 });
    const playing = video({ size: 10 });
    expect(chooseTarget(null, [paused, ended, playing], area)).toBe(playing);
  });

  it('returns null when nothing is playing', () => {
    expect(chooseTarget(null, [video({ paused: true })], area)).toBeNull();
  });

  it('ignores playing videos with no size', () => {
    expect(chooseTarget(null, [video({ size: 0 })], area)).toBeNull();
  });

  it('keeps a paused current target', () => {
    const current = video({ paused: true, size: 100 });
    const other = video({ size: 900 });
    expect(chooseTarget(current, [current, other], area)).toBe(current);
  });

  it('drops a current target that left the document or has no size', () => {
    const other = video({ size: 50 });
    expect(chooseTarget(video({ isConnected: false }), [other], area)).toBe(other);
    expect(chooseTarget(video({ size: 0 }), [other], area)).toBe(other);
  });
});
