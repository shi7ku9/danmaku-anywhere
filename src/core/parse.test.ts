import { describe, expect, it } from 'vitest';
import { parseDanmaku } from './parse';
import { ParseError } from './types';

const xml = (...ds: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><i><chatserver>chat.bilibili.com</chatserver><maxlimit>3000</maxlimit>${ds.join('')}</i>`;

describe('parseDanmaku: Bilibili XML', () => {
  it('maps modes and colors', () => {
    const { comments, skipped } = parseDanmaku(
      xml(
        '<d p="1.5,1,25,16777215,0,0,0,0">scroll</d>',
        '<d p="2,4,25,16711680">bottom</d>',
        '<d p="3,5,25,255">top</d>',
      ),
    );
    expect(skipped).toBe(0);
    expect(comments).toEqual([
      { time: 1.5, text: 'scroll', mode: 'scroll', color: '#ffffff' },
      { time: 2, text: 'bottom', mode: 'bottom', color: '#ff0000' },
      { time: 3, text: 'top', mode: 'top', color: '#0000ff' },
    ]);
  });

  it('treats modes 2 and 3 as scroll and skips modes 7 and 8', () => {
    const { comments, skipped } = parseDanmaku(
      xml('<d p="1,2,25,0">a</d>', '<d p="1,3,25,0">b</d>', '<d p="1,7,25,0">[1,2]</d>', '<d p="1,8,25,0">code</d>'),
    );
    expect(comments.map((c) => c.mode)).toEqual(['scroll', 'scroll']);
    expect(skipped).toBe(2);
  });

  it('sorts by time', () => {
    const { comments } = parseDanmaku(xml('<d p="5,1,25,0">late</d>', '<d p="1,1,25,0">early</d>'));
    expect(comments.map((c) => c.text)).toEqual(['early', 'late']);
  });

  it('parses a realistic Bilibili file', () => {
    const file = `﻿${xml('<d p="0,1,25,16777215,1600000000,0,abc,123">a &amp; b &lt;3</d>', '<d p="x,1,25,0">bad time</d>')}`;
    const { comments, skipped } = parseDanmaku(file);
    expect(comments).toEqual([{ time: 0, text: 'a & b <3', mode: 'scroll', color: '#ffffff' }]);
    expect(skipped).toBe(1);
  });

  it('defaults an invalid color to white', () => {
    const { comments } = parseDanmaku(xml('<d p="1,1,25,oops">a</d>'));
    expect(comments[0]?.color).toBe('#ffffff');
  });

  it('rejects malformed XML', () => {
    expect(() => parseDanmaku('<i><d p="1,1,25,0">a</i>')).toThrow(ParseError);
  });

  it('rejects XML with another root element', () => {
    expect(() => parseDanmaku('<html><body></body></html>')).toThrow(ParseError);
  });

  it('rejects a file with no usable comments', () => {
    expect(() => parseDanmaku(xml('<d p="1,7,25,0">[]</d>'))).toThrow('No valid comments found');
  });
});

describe('parseDanmaku: JSON', () => {
  it('applies defaults for mode and color', () => {
    const { comments } = parseDanmaku('[{ "time": 1.5, "text": "hi" }]');
    expect(comments).toEqual([{ time: 1.5, text: 'hi', mode: 'scroll', color: '#ffffff' }]);
  });

  it('keeps explicit mode and lowercases color', () => {
    const { comments } = parseDanmaku('[{ "time": 3, "text": "t", "mode": "top", "color": "#FF0000" }]');
    expect(comments).toEqual([{ time: 3, text: 't', mode: 'top', color: '#ff0000' }]);
  });

  it('skips and counts invalid items', () => {
    const { comments, skipped } = parseDanmaku(
      JSON.stringify([
        { time: 1, text: 'ok' },
        { text: 'no time' },
        { time: -1, text: 'negative' },
        { time: 2, text: '   ' },
        { time: 2, text: 'bad mode', mode: 'left' },
        { time: 2, text: 'bad color', color: 'red' },
        'string',
        null,
      ]),
    );
    expect(comments.map((c) => c.text)).toEqual(['ok']);
    expect(skipped).toBe(7);
  });

  it('sorts by time', () => {
    const { comments } = parseDanmaku('[{"time":2,"text":"b"},{"time":1,"text":"a"}]');
    expect(comments.map((c) => c.text)).toEqual(['a', 'b']);
  });

  it('rejects a non-array document', () => {
    expect(() => parseDanmaku('{"time":1,"text":"a"}')).toThrow(ParseError);
  });

  it('rejects when every item is invalid', () => {
    expect(() => parseDanmaku('[{"text":"a"}]')).toThrow('No valid comments found');
  });
});

describe('parseDanmaku: unknown input', () => {
  it('rejects text that is neither XML nor JSON', () => {
    expect(() => parseDanmaku('hello world')).toThrow(ParseError);
  });

  it('rejects an empty file', () => {
    expect(() => parseDanmaku('')).toThrow(ParseError);
  });
});
