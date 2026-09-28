import type { Settings } from './types';

/** Font stacks for the preset `fontFamily` keys; any other value is a custom font-family. */
export const FONT_PRESETS: Record<string, string> = {
  system: 'system-ui, sans-serif',
  sans: 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
};

export function fontStack(s: Pick<Settings, 'fontFamily'>): string {
  return FONT_PRESETS[s.fontFamily] ?? s.fontFamily;
}

type EffectSettings = Pick<
  Settings,
  'effect' | 'outlineWidth' | 'outlineColor' | 'shadowBlur' | 'shadowOffset' | 'shadowColor'
>;

/** The `text-shadow` value for the current text effect. */
export function textShadow(s: EffectSettings): string {
  const parts: string[] = [];
  if (s.effect === 'outline' || s.effect === 'both') {
    const w = s.outlineWidth;
    for (const [x, y] of [[-w, -w], [0, -w], [w, -w], [-w, 0], [w, 0], [-w, w], [0, w], [w, w]]) {
      parts.push(`${x}px ${y}px 0 ${s.outlineColor}`);
    }
  }
  if (s.effect === 'shadow' || s.effect === 'both') {
    parts.push(`${s.shadowOffset}px ${s.shadowOffset}px ${s.shadowBlur}px ${s.shadowColor}`);
  }
  return parts.length ? parts.join(', ') : 'none';
}
