export type CommentMode = 'scroll' | 'top' | 'bottom';

export interface Comment {
  /** Seconds from the start of the video (or of loop playback). */
  time: number;
  text: string;
  mode: CommentMode;
  /** '#rrggbb' */
  color: string;
}

export type TextEffect = 'outline' | 'shadow' | 'both' | 'none';

export type FontPreset = 'system' | 'sans' | 'serif' | 'mono';

export interface Settings {
  opacity: number;
  /** Multiplier on the 25 px base font size. */
  fontScale: number;
  /** Seconds for a scrolling comment to cross the overlay. */
  speed: number;
  effect: TextEffect;
  /** px */
  outlineWidth: number;
  /** '#rrggbb' */
  outlineColor: string;
  /** px */
  shadowBlur: number;
  /** px, applied to both x and y. */
  shadowOffset: number;
  /** '#rrggbb' */
  shadowColor: string;
  /** A preset font, or `custom` to use `customFont`. */
  fontFamily: FontPreset | 'custom';
  /** A CSS font-family value; kept while a preset is chosen so switching back restores it. */
  customFont: string;
  fontWeight: 400 | 700;
  /**
   * Fraction of the overlay height that each kind of comment may use: scroll
   * and top comments from the top, bottom comments from the bottom.
   */
  displayArea: number;
  /** Maximum comments on screen at once. */
  maxActive: number;
}

export const DEFAULT_SETTINGS: Settings = {
  opacity: 0.8,
  fontScale: 1,
  speed: 8,
  effect: 'outline',
  outlineWidth: 1,
  outlineColor: '#000000',
  shadowBlur: 4,
  shadowOffset: 1,
  shadowColor: '#000000',
  fontFamily: 'system',
  customFont: '',
  fontWeight: 700,
  displayArea: 1,
  maxActive: 150,
};

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
