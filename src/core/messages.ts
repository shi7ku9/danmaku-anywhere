export type Mode = 'video' | 'loop';

/** Which video danmaku follows: automatic, a specific video by id, or none (loop mode). */
export type VideoChoice = 'auto' | 'none' | number;

/** A video on the page, as listed in the popup's video selector. */
export interface VideoInfo {
  id: number;
  /** Rendered size in px. */
  width: number;
  height: number;
  playing: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds; NaN or Infinity when unknown (e.g. live streams). */
  duration: number;
}

/** The content script's answer to every message. */
export interface Status {
  urlKey: string;
  title: string;
  entry: { fileName: string; count: number; offset: number } | null;
  enabled: boolean;
  mode: Mode;
  /** Videos with a non-zero size, in document order. */
  videos: VideoInfo[];
  choice: VideoChoice;
  /** The video actually followed (what `auto` picked), or null in loop mode. */
  targetId: number | null;
}

// Offsets are written to storage by the popup (under the library lock); content
// scripts follow them through storage.onChanged.
export type Message =
  | { type: 'getStatus' }
  // `urlKey` names the page the sender saw; a stale change for another page is ignored.
  | { type: 'setEnabled'; enabled: boolean; urlKey?: string }
  | { type: 'setVideo'; choice: VideoChoice; urlKey?: string }
  | { type: 'toggle' }
  | { type: 'reload' };
