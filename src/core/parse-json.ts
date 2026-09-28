import { type Comment, type CommentMode, ParseError, type ParseResult } from './types';

const MODES = new Set<string>(['scroll', 'top', 'bottom']);
const COLOR = /^#[0-9a-f]{6}$/i;

/** Parses the custom JSON format: an array of { time, text, mode?, color? }. */
export function parseJson(data: unknown): ParseResult {
  if (!Array.isArray(data)) throw new ParseError('JSON danmaku must be an array of comments');
  const comments: Comment[] = [];
  let skipped = 0;
  for (const item of data) {
    const comment = toComment(item);
    if (comment) comments.push(comment);
    else skipped++;
  }
  return { comments, skipped };
}

function toComment(item: unknown): Comment | null {
  if (typeof item !== 'object' || item === null) return null;
  const { time, text, mode = 'scroll', color = '#ffffff' } = item as Record<string, unknown>;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) return null;
  if (typeof text !== 'string' || text.trim() === '') return null;
  if (typeof mode !== 'string' || !MODES.has(mode)) return null;
  if (typeof color !== 'string' || !COLOR.test(color)) return null;
  return { time, text, mode: mode as CommentMode, color: color.toLowerCase() };
}
