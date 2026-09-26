import { describe, expect, it } from 'vitest';
import { lowerBound } from './timeline';

const at = (...times: number[]) => times.map((time) => ({ time }));

describe('lowerBound', () => {
  it('finds the first comment at or after t', () => {
    expect(lowerBound(at(0, 1, 1, 2), 1)).toBe(1);
    expect(lowerBound(at(0, 1, 1, 2), 1.5)).toBe(3);
  });

  it('returns 0 before the first comment and length after the last', () => {
    expect(lowerBound(at(0, 1, 2), -5)).toBe(0);
    expect(lowerBound(at(0, 1, 2), 5)).toBe(3);
  });

  it('handles an empty list', () => {
    expect(lowerBound([], 1)).toBe(0);
  });
});
