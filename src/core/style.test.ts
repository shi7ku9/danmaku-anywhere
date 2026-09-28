import { describe, expect, it } from 'vitest';
import { fontStack, textShadow } from './style';
import { DEFAULT_SETTINGS, type Settings } from './types';

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
  const font = (fontFamily: Settings['fontFamily'], customFont = '') => fontStack({ fontFamily, customFont });

  it('maps presets to font stacks', () => {
    expect(font('system')).toBe('system-ui, sans-serif');
    expect(font('mono')).toBe('monospace');
  });

  it('ignores the custom font while a preset is chosen', () => {
    expect(font('serif', '"Noto Sans TC"')).toBe('serif');
  });

  it('uses the custom font as-is', () => {
    expect(font('custom', '"Noto Sans TC", sans-serif')).toBe('"Noto Sans TC", sans-serif');
  });

  it('keeps a custom value that matches a preset name literal', () => {
    expect(font('custom', 'sans')).toBe('sans');
  });

  it('falls back to the system font for an empty custom font or unknown preset', () => {
    expect(font('custom', '  ')).toBe('system-ui, sans-serif');
    expect(font('Georgia, serif' as Settings['fontFamily'])).toBe('system-ui, sans-serif');
  });

  it('resolves CSS-wide keywords to the initial font', () => {
    expect(font('custom', 'inherit')).toBe('initial');
    expect(font('custom', ' Unset ')).toBe('initial');
  });
});
