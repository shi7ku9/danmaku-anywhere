import { describe, expect, it } from 'vitest';
import { fontStack, textShadow } from './style';
import { DEFAULT_SETTINGS } from './types';

describe('textShadow', () => {
  it('draws a 1px black outline by default', () => {
    const value = textShadow(DEFAULT_SETTINGS);
    expect(value.split(', ')).toHaveLength(8);
    expect(value).toContain('-1px -1px 0 #000000');
    expect(value).toContain('1px 1px 0 #000000');
  });

  it('scales the outline width and color', () => {
    const value = textShadow({ ...DEFAULT_SETTINGS, outlineWidth: 2.5, outlineColor: '#ff0000' });
    expect(value).toContain('-2.5px 0px 0 #ff0000');
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

  it('passes custom values through', () => {
    expect(fontStack({ fontFamily: '"Noto Sans TC", sans-serif' })).toBe('"Noto Sans TC", sans-serif');
  });
});
