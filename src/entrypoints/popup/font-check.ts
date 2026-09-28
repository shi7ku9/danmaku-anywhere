/** Generic families and system keywords that always resolve to some font. */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** CSS-wide keywords; valid only as the whole value and not font names. */
const GLOBAL = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

export interface Family {
  name: string;
  /** A quoted name is always a font name, even `"serif"`. */
  quoted: boolean;
}

/** Splits a font-family list into family names, removing quotes. */
export function parseFamilies(value: string): Family[] {
  const families: Family[] = [];
  let current = '';
  let quote = '';
  let quoted = false;
  const push = () => {
    const name = quoted ? current : current.trim().replace(/\s+/g, ' ');
    if (name) families.push({ name, quoted });
    current = '';
    quoted = false;
  };
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      current = '';
    } else if (ch === ',') {
      push();
    } else if (!quoted) {
      current += ch;
    }
  }
  push();
  return families;
}

/** Measures the width of sample text drawn with a CSS font shorthand. */
export type Measure = (font: string) => number;

const SAMPLE = 'mmmmmmmmmmlli WwQq 0123 弾幕漢字あア';

function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (font) => {
    ctx.font = font;
    return ctx.measureText(SAMPLE).width;
  };
}

/**
 * Names in a font-family list that are not installed. A family counts as
 * installed when text drawn with it differs in width from both fallbacks;
 * the browser silently falls back for a missing one.
 */
export function missingFonts(value: string, measure: Measure = canvasMeasure()): string[] {
  if (GLOBAL.has(value.trim().toLowerCase())) return [];
  const fallbacks = ['monospace', 'serif'];
  const base = fallbacks.map((f) => measure(`72px ${f}`));
  return parseFamilies(value)
    .filter(({ name, quoted }) => {
      if (!quoted && GENERIC.has(name.toLowerCase())) return false;
      const font = `"${name.replace(/["\\]/g, '\\$&')}"`;
      return fallbacks.every((f, i) => measure(`72px ${font}, ${f}`) === base[i]);
    })
    .map(({ name }) => name);
}
