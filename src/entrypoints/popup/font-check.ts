import { isCssWideKeyword } from '../../core/style';

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

export interface Family {
  name: string;
  /** A quoted name is always a font name, even `"serif"`. */
  quoted: boolean;
}

const HEX_DIGIT = /[0-9a-f]/i;
const SPACE = /[ \t\n\r\f]/;

/**
 * Splits a font-family list into family names, removing quotes and resolving
 * CSS escapes, so `Foo\, Bar` and `"A\"B"` stay one name each.
 */
export function parseFamilies(value: string): Family[] {
  const chars = [...value];
  const families: Family[] = [];
  // Unquoted names collapse unescaped whitespace; escaped characters are kept as is.
  let current: { ch: string; escaped: boolean }[] = [];
  let quoted = false;
  let quote = '';

  const push = () => {
    let name: string;
    if (quoted) {
      name = current.map((c) => c.ch).join('');
    } else {
      name = '';
      let space = false;
      for (const c of current) {
        if (!c.escaped && SPACE.test(c.ch)) {
          space = name !== '';
        } else {
          if (space) name += ' ';
          space = false;
          name += c.ch;
        }
      }
    }
    if (name) families.push({ name, quoted });
    current = [];
    quoted = false;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === '\\') {
      let hex = '';
      while (hex.length < 6 && i + 1 < chars.length && HEX_DIGIT.test(chars[i + 1]!)) hex += chars[++i];
      if (hex) {
        if (i + 1 < chars.length && SPACE.test(chars[i + 1]!)) i++;
        const code = parseInt(hex, 16);
        const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
        current.push({ ch: String.fromCodePoint(valid ? code : 0xfffd), escaped: true });
      } else if (i + 1 < chars.length) {
        current.push({ ch: chars[++i]!, escaped: true });
      }
    } else if (quote) {
      if (ch === quote) quote = '';
      else current.push({ ch, escaped: false });
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      current = [];
    } else if (ch === ',') {
      push();
    } else if (!quoted) {
      current.push({ ch, escaped: false });
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
  if (isCssWideKeyword(value)) return [];
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
