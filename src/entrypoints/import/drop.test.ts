import { describe, expect, it } from 'vitest';
import { pickDroppedFile } from './drop';

const transfer = (files: File[]) => ({ files }) as unknown as DataTransfer;
const file = (name: string) => new File(['[]'], name);

describe('pickDroppedFile', () => {
  it('returns the single dropped file', () => {
    const f = file('a.xml');
    expect(pickDroppedFile(transfer([f]))).toEqual({ file: f, extra: 0 });
  });

  it('takes the first of several files and counts the rest', () => {
    const f = file('a.xml');
    expect(pickDroppedFile(transfer([f, file('b.json'), file('c.json')]))).toEqual({ file: f, extra: 2 });
  });

  it('returns null when nothing but text was dropped', () => {
    expect(pickDroppedFile(transfer([]))).toBeNull();
    expect(pickDroppedFile(null)).toBeNull();
  });
});
