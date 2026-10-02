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

/** A saved danmaku in the library; its comments are stored apart, under `danmaku:<id>`. */
export interface LibraryEntry {
  id: string;
  /** Starts as the file name; can be renamed. */
  name: string;
  /** The file it was imported from. */
  fileName: string;
  count: number;
  /** Epoch milliseconds. */
  addedAt: number;
}

/** Which danmaku a page uses, and how far it is shifted against that page's video. */
export interface Binding {
  danmakuId: string;
  /** Seconds added to the clock before lookup; may be negative. */
  offset: number;
  /** The page's title when it was bound, for the library's list of pages. */
  title: string;
}

/** Bindings by page URL key. */
export type Bindings = Record<string, Binding>;

/** A page's danmaku as the content script uses it. */
export interface PageDanmaku {
  id: string;
  name: string;
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
