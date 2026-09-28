/** Rendered size of a video in px², regardless of scroll position. */
export function renderedArea(video: HTMLVideoElement): number {
  const r = video.getBoundingClientRect();
  return r.width * r.height;
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
