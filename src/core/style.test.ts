import { describe, expect, it } from 'vitest';
import { fontStack, textShadow } from './style';
import { DEFAULT_SETTINGS } from './types';

describe('textShadow', () => {
  it('draws a 1px black outline by default', () => {
    const parts = textShadow(DEFAULT_SETTINGS).split(', ');
    expect(parts).toHaveLength(8);
    expect(parts).toContain('1px 0px 0 #000000');
    expect(parts).toContain('-1px 0px 0 #000000');
    expect(parts).toContain('0px 1px 0 #000000');
  });

  it('keeps every outline copy on a circle about 1px apart', () => {
    const parts = textShadow({ ...DEFAULT_SETTINGS, outlineWidth: 4, outlineColor: '#ff0000' }).split(', ');
    expect(parts.length).toBe(Math.ceil(2 * Math.PI * 4));
    for (const part of parts) {
      const [x, y] = part.split(' ').map(parseFloat) as [number, number];
      expect(Math.hypot(x, y)).toBeCloseTo(4, 1);
      expect(part.endsWith('#ff0000')).toBe(true);
    }
  });

  it('draws a blurred drop shadow', () => {
    expect(textShadow({ ...DEFAULT_SETTINGS, effect: 'shadow', shadowOffset: 2, shadowBlur: 6 })).toBe(
      '2px 2px 6px #000000',
    );
  });

  it('puts the shadow after the outline for both', () => {
    const parts = textShadow({ ...DEFAULT_SETTINGS, effect: 'both' }).split(', ');
    expect(parts).toHaveLength(9);
    expect(parts.at(-1)).toBe('1px 1px 4px #000000');
  });

  it('returns none without an effect', () => {
    expect(textShadow({ ...DEFAULT_SETTINGS, effect: 'none' })).toBe('none');
  });
});

describe('fontStack', () => {
  it('maps presets to font stacks', () => {
    expect(fontStack({ fontFamily: 'system' })).toBe('system-ui, sans-serif');
    expect(fontStack({ fontFamily: 'mono' })).toBe('monospace');
  });

  it('resolves CSS-wide keywords to the initial font', () => {
    expect(fontStack({ fontFamily: 'inherit' })).toBe('initial');
    expect(fontStack({ fontFamily: ' Unset ' })).toBe('initial');
  });

  it('passes custom values through', () => {
    expect(fontStack({ fontFamily: '"Noto Sans TC", sans-serif' })).toBe('"Noto Sans TC", sans-serif');
  });
});
