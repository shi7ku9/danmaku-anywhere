import type { Settings } from './types';

/** Font stacks for the preset `fontFamily` keys; any other value is a custom font-family. */
export const FONT_PRESETS: Record<string, string> = {
  system: 'system-ui, sans-serif',
  sans: 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
};

export function fontStack(s: Pick<Settings, 'fontFamily'>): string {
  return Object.hasOwn(FONT_PRESETS, s.fontFamily) ? FONT_PRESETS[s.fontFamily]! : s.fontFamily;
}

type EffectSettings = Pick<
  Settings,
  'effect' | 'outlineWidth' | 'outlineColor' | 'shadowBlur' | 'shadowOffset' | 'shadowColor'
>;

/** Rounds to 2 decimals and drops trailing zeros and negative zero. */
const num = (v: number) => String(Math.round(v * 100) / 100 + 0);

/**
 * Copies of the text offset around a circle of radius `width`, spaced about
 * 1 px apart, so the outline follows the glyphs with round corners. Eight fixed
 * directions would square it off at larger widths, and `-webkit-text-stroke`
 * spikes at sharp glyph corners.
 */
function outline(width: number, color: string): string[] {
  const n = Math.max(8, Math.ceil(2 * Math.PI * width));
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return `${num(Math.cos(a) * width)}px ${num(Math.sin(a) * width)}px 0 ${color}`;
  });
}

/** The `text-shadow` value for the current text effect. */
export function textShadow(s: EffectSettings): string {
  const parts: string[] = [];
  if (s.effect === 'outline' || s.effect === 'both') parts.push(...outline(s.outlineWidth, s.outlineColor));
  if (s.effect === 'shadow' || s.effect === 'both') {
    parts.push(`${s.shadowOffset}px ${s.shadowOffset}px ${s.shadowBlur}px ${s.shadowColor}`);
  }
  return parts.length ? parts.join(', ') : 'none';
}
