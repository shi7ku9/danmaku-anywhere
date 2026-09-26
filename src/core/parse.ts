import { parseBilibili } from './parse-bilibili';
import { parseJson } from './parse-json';
import { ParseError, type ParseResult } from './types';

/** Detects the format from content, parses it and sorts comments by time. */
export function parseDanmaku(text: string): ParseResult {
  // trim() also strips a leading BOM.
  const trimmed = text.trim();
  let result: ParseResult;
  if (trimmed.startsWith('<')) {
    result = parseBilibili(trimmed);
  } else {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new ParseError('Unrecognized format: expected Bilibili XML or JSON');
    }
    result = parseJson(data);
  }
  if (result.comments.length === 0) throw new ParseError('No valid comments found');
  result.comments.sort((a, b) => a.time - b.time);
  return result;
}
