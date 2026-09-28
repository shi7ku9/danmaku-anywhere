import { describe, expect, it } from 'vitest';
import type { VideoInfo } from '../../core/messages';
import { autoLabel, formatTime, videoLabel } from './video-label';

const info = (v: Partial<VideoInfo> = {}): VideoInfo => ({
  id: 1,
  width: 1280,
  height: 720,
  playing: true,
  currentTime: 201,
  duration: 605,
  ...v,
});

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(201.9)).toBe('3:21');
  });

  it('adds hours from an hour on', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('shows a dash when the time is unknown', () => {
    expect(formatTime(Number.NaN)).toBe('–');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('–');
  });
});

describe('videoLabel', () => {
  it('describes size, state and time', () => {
    expect(videoLabel(info(), 1)).toBe('Video 2 · 1280×720 · Playing · 3:21 / 10:05');
    expect(videoLabel(info({ playing: false, duration: Number.POSITIVE_INFINITY }), 0)).toBe(
      'Video 1 · 1280×720 · Paused · 3:21 / –',
    );
  });
});

describe('autoLabel', () => {
  it('names the followed video by its position', () => {
    expect(autoLabel({ videos: [info({ id: 4 }), info({ id: 7 })], autoTargetId: 7 })).toBe('Auto (Video 2)');
  });

  it('says loop when nothing is followed', () => {
    expect(autoLabel({ videos: [info()], autoTargetId: null })).toBe('Auto (none, loop)');
  });
});
