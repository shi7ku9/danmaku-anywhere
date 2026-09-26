import { describe, expect, it } from 'vitest';
import { urlKey } from './url-key';

describe('urlKey', () => {
  it('drops the hash', () => {
    expect(urlKey('https://a.com/p#section')).toBe('https://a.com/p');
  });

  it('keeps YouTube v and drops timestamp and tracking params', () => {
    expect(urlKey('https://www.youtube.com/watch?t=42&v=abc&utm_source=x&si=q')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
  });

  it('keeps only v on YouTube watch pages', () => {
    expect(urlKey('https://www.youtube.com/watch?v=abc&list=PL1&index=3&pp=x')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
    expect(urlKey('https://m.youtube.com/watch?list=PL1&v=abc')).toBe('https://m.youtube.com/watch?v=abc');
  });

  it('keeps list and index on other sites', () => {
    expect(urlKey('https://a.com/p?list=1&index=2')).toBe('https://a.com/p?index=2&list=1');
  });

  it('drops fbclid, gclid and start', () => {
    expect(urlKey('https://a.com/p?fbclid=1&gclid=2&start=30&id=7')).toBe('https://a.com/p?id=7');
  });

  it('sorts the remaining params', () => {
    expect(urlKey('https://a.com/p?b=2&a=1')).toBe('https://a.com/p?a=1&b=2');
  });

  it('omits an empty query', () => {
    expect(urlKey('https://a.com/p?utm_medium=m')).toBe('https://a.com/p');
  });

  it('keeps the port', () => {
    expect(urlKey('http://localhost:8080/x')).toBe('http://localhost:8080/x');
  });

  it('handles file URLs', () => {
    expect(urlKey('file:///home/u/video.html')).toBe('file:///home/u/video.html');
  });
});
