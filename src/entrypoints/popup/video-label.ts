import type { Status, VideoInfo } from '../../core/messages';

/** `m:ss`, or `h:mm:ss` from an hour; `–` when unknown (NaN, Infinity for live streams). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** E.g. `Video 2 · 1280×720 · Playing · 3:21 / 10:05`; `index` is 0-based. */
export function videoLabel(info: VideoInfo, index: number): string {
  const state = info.playing ? 'Playing' : 'Paused';
  const time = `${formatTime(info.currentTime)} / ${formatTime(info.duration)}`;
  return `Video ${index + 1} · ${info.width}×${info.height} · ${state} · ${time}`;
}

/** Names what the automatic choice follows, e.g. `Auto (Video 2)` or `Auto (none, loop)`. */
export function autoLabel(status: Pick<Status, 'videos' | 'autoTargetId'>): string {
  if (status.autoTargetId === null) return 'Auto (none, loop)';
  const index = status.videos.findIndex((v) => v.id === status.autoTargetId);
  return index < 0 ? 'Auto' : `Auto (Video ${index + 1})`;
}
