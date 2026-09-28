import type { VideoChoice, VideoInfo } from '../core/messages';

/** Rendered size of a video in px, regardless of scroll position. */
export function renderedSize(video: HTMLVideoElement): { width: number; height: number } {
  const r = video.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

/** Rendered size of a video in px², regardless of scroll position. */
export function renderedArea(video: HTMLVideoElement): number {
  const { width, height } = renderedSize(video);
  return width * height;
}

const ids = new WeakMap<HTMLVideoElement, number>();
let nextId = 1;

/** A stable id for a video element, never reused while the page lives. */
export function videoId(video: HTMLVideoElement): number {
  let id = ids.get(video);
  if (id === undefined) {
    id = nextId++;
    ids.set(video, id);
  }
  return id;
}

/**
 * Keeps the current target while it is still in the document and has a size,
 * even when paused, so pausing freezes danmaku instead of switching to loop
 * mode. Otherwise picks the largest playing video, or null for none.
 */
export function chooseTarget(
  current: HTMLVideoElement | null,
  videos: Iterable<HTMLVideoElement>,
  area: (video: HTMLVideoElement) => number = renderedArea,
): HTMLVideoElement | null {
  if (current?.isConnected && area(current) > 0) return current;
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const video of videos) {
    if (video.paused || video.ended) continue;
    const a = area(video);
    if (a > bestArea) {
      best = video;
      bestArea = a;
    }
  }
  return best;
}

/**
 * The target for a choice: null for none (loop mode), the automatic pick for
 * auto, or the chosen video. Returns undefined when the chosen video is gone or
 * has no size, so the caller can fall back to auto.
 */
export function resolveTarget(
  choice: VideoChoice,
  current: HTMLVideoElement | null,
  videos: Iterable<HTMLVideoElement>,
  area: (video: HTMLVideoElement) => number = renderedArea,
): HTMLVideoElement | null | undefined {
  if (choice === 'none') return null;
  if (choice === 'auto') return chooseTarget(current, videos, area);
  for (const video of videos) {
    if (videoId(video) === choice) return video.isConnected && area(video) > 0 ? video : undefined;
  }
  return undefined;
}

/** Videos with a size, in document order, for the popup's selector. */
export function listVideos(
  videos: Iterable<HTMLVideoElement>,
  size: (video: HTMLVideoElement) => { width: number; height: number } = renderedSize,
): VideoInfo[] {
  const list: VideoInfo[] = [];
  for (const video of videos) {
    const { width, height } = size(video);
    if (!video.isConnected || width * height <= 0) continue;
    list.push({
      id: videoId(video),
      width: Math.round(width),
      height: Math.round(height),
      playing: !video.paused && !video.ended,
      currentTime: video.currentTime,
      duration: video.duration,
    });
  }
  return list;
}
