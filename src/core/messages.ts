export type Mode = 'video' | 'loop';

/** The content script's answer to every message. */
export interface Status {
  urlKey: string;
  title: string;
  entry: { fileName: string; count: number; offset: number } | null;
  enabled: boolean;
  mode: Mode;
}

export type Message =
  | { type: 'getStatus' }
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'toggle' }
  | { type: 'setOffset'; offset: number }
  | { type: 'reload' };
