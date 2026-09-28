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

/** Splits a font-family list into family names, removing quotes. */
export function parseFamilies(value: string): string[] {
  const names: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      names.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  names.push(current.trim());
  return names.map((name) => name.replace(/\s+/g, ' ')).filter(Boolean);
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
  const fallbacks = ['monospace', 'serif'];
  const base = fallbacks.map((f) => measure(`72px ${f}`));
  return parseFamilies(value).filter((name) => {
    if (GENERIC.has(name.toLowerCase())) return false;
    const quoted = `"${name.replace(/["\\]/g, '\\$&')}"`;
    return fallbacks.every((f, i) => measure(`72px ${quoted}, ${f}`) === base[i]);
  });
}
