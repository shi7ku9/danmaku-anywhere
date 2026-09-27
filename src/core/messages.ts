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
  // `urlKey` names the page the sender saw; a stale change for another page is ignored.
  | { type: 'setEnabled'; enabled: boolean; urlKey?: string }
  | { type: 'toggle' }
  | { type: 'setOffset'; offset: number; urlKey?: string }
  | { type: 'reload' };
