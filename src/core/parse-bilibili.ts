import { ParseError, type Comment, type CommentMode, type ParseResult } from './types';

const MODES: Record<string, CommentMode> = {
  '1': 'scroll',
  '2': 'scroll',
  '3': 'scroll',
  '4': 'bottom',
  '5': 'top',
};

/** Parses a Bilibili danmaku XML document. Unsupported comments are skipped. */
export function parseBilibili(xml: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.nodeName !== 'i') {
    throw new ParseError('Unrecognized format: expected Bilibili XML or JSON');
  }

  const comments: Comment[] = [];
  let skipped = 0;
  for (const d of Array.from(doc.getElementsByTagName('d'))) {
    // p = "time,mode,fontSize,color,..."
    const p = (d.getAttribute('p') ?? '').split(',');
    const time = Number(p[0]);
    const mode = MODES[(p[1] ?? '').trim()];
    const text = d.textContent ?? '';
    if (!Number.isFinite(time) || time < 0 || !mode || text.trim() === '') {
      skipped++;
      continue;
    }
    comments.push({ time, text, mode, color: toHexColor(p[3]) });
  }
  return { comments, skipped };
}

/** Converts Bilibili's decimal RGB integer to '#rrggbb'. */
function toHexColor(value: string | undefined): string {
  const n = Number(value);
  if (value === undefined || value.trim() === '' || !Number.isInteger(n) || n < 0) return '#ffffff';
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}
