import { describe, expect, it } from 'vitest';
import { chooseTarget, listVideos, resolveTarget, videoId } from './video-finder';

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

describe('videoId', () => {
  it('is stable per element and unique across elements', () => {
    const a = video();
    const b = video();
    expect(videoId(a)).toBe(videoId(a));
    expect(videoId(a)).not.toBe(videoId(b));
  });
});

describe('resolveTarget', () => {
  it('returns null for none, even with a playing video', () => {
    expect(resolveTarget('none', null, [video()], area)).toBeNull();
  });

  it('picks automatically for auto', () => {
    const small = video({ size: 10 });
    const big = video({ size: 100 });
    expect(resolveTarget('auto', null, [small, big], area)).toBe(big);
  });

  it('returns the chosen video even when paused and smaller', () => {
    const chosen = video({ size: 10, paused: true });
    expect(resolveTarget(videoId(chosen), null, [chosen, video({ size: 100 })], area)).toBe(chosen);
  });

  it('signals a fallback when the chosen video is gone or has no size', () => {
    const gone = video();
    expect(resolveTarget(videoId(gone), null, [video()], area)).toBeUndefined();
    const hidden = video({ size: 0 });
    expect(resolveTarget(videoId(hidden), null, [hidden], area)).toBeUndefined();
    const detached = video({ isConnected: false });
    expect(resolveTarget(videoId(detached), null, [detached], area)).toBeUndefined();
  });
});

describe('listVideos', () => {
  const size = (v: HTMLVideoElement) => {
    const s = (v as unknown as FakeVideo).size;
    return { width: s, height: s / 2 };
  };

  it('lists videos with a size in order, skipping hidden and detached ones', () => {
    const a = video({ size: 100.4, paused: true });
    const b = video({ size: 50 });
    const list = listVideos([a, video({ size: 0 }), video({ isConnected: false }), b], size);
    expect(list.map((v) => [v.id, v.width, v.height, v.playing])).toEqual([
      [videoId(a), 100, 50, false],
      [videoId(b), 50, 25, true],
    ]);
  });
});
