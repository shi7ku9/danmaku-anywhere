export type CommentMode = 'scroll' | 'top' | 'bottom';

export interface Comment {
  /** Seconds from the start of the video (or of loop playback). */
  time: number;
  text: string;
  mode: CommentMode;
  /** '#rrggbb' */
  color: string;
}

export interface Settings {
  opacity: number;
  /** Multiplier on the 25 px base font size. */
  fontScale: number;
  /** Seconds for a scrolling comment to cross the overlay. */
  speed: number;
}

export const DEFAULT_SETTINGS: Settings = { opacity: 0.8, fontScale: 1, speed: 8 };

/** Summary of a stored entry, listed in the popup without loading comments. */
export interface IndexEntry {
  urlKey: string;
  title: string;
  fileName: string;
  count: number;
  /** Epoch milliseconds. */
  importedAt: number;
}

export interface DanmakuEntry {
  /** Seconds added to the clock before lookup; may be negative. */
  offset: number;
  /** Sorted by time. */
  comments: Comment[];
}

export interface ParseResult {
  comments: Comment[];
  skipped: number;
}

export class ParseError extends Error {
  override name = 'ParseError';
}
