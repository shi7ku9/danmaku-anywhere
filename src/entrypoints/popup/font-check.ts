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

let shared: Measure | undefined;

/** One canvas for every check, created on first use. */
function canvasMeasure(): Measure {
  if (!shared) {
    const ctx = document.createElement('canvas').getContext('2d')!;
    shared = (font) => {
      ctx.font = font;
      return ctx.measureText(SAMPLE).width;
    };
  }
  return shared;
}

const FALLBACKS = ['monospace', 'serif'];
/** Fallback widths per measure; installed fonts don't change while the popup is open. */
const baselines = new WeakMap<Measure, number[]>();

function baseline(measure: Measure): number[] {
  let widths = baselines.get(measure);
  if (!widths) {
    widths = FALLBACKS.map((f) => measure(`72px ${f}`));
    baselines.set(measure, widths);
  }
  return widths;
}

export interface FontCheck {
  /** Named families that are not installed; the browser skips them. */
  missing: string[];
  /** Whether anything in the list renders: an installed family or a generic one. */
  usable: boolean;
}

/**
 * Checks each family in a font-family list. A family counts as installed when
 * text drawn with it differs in width from both fallbacks; the browser
 * silently falls back for a missing one.
 */
export function checkFonts(value: string, measure: Measure = canvasMeasure()): FontCheck {
  if (isCssWideKeyword(value)) return { missing: [], usable: true };
  const base = baseline(measure);
  const missing: string[] = [];
  let usable = false;
  for (const { name, quoted } of parseFamilies(value)) {
    if (!quoted && GENERIC.has(name.toLowerCase())) {
      usable = true;
      continue;
    }
    const font = `"${name.replace(/["\\]/g, '\\$&')}"`;
    if (FALLBACKS.every((f, i) => measure(`72px ${font}, ${f}`) === base[i])) missing.push(name);
    else usable = true;
  }
  return { missing, usable };
}

export interface FontStatus {
  /** `error` blocks saving; `warning` saves but tells the user. */
  level: 'ok' | 'warning' | 'error';
  message: string;
}

/**
 * Whether a custom font-family can be saved. Missing families are only a
 * warning, since a list exists to fall back past them (and per glyph, e.g. a
 * Latin font before a CJK one); it is an error only when nothing in the list
 * would render, which almost always means a typo.
 */
export function fontStatus(
  value: string,
  supports: (value: string) => boolean = (v) => CSS.supports('font-family', v),
  measure?: Measure,
): FontStatus {
  // The browser ignores an invalid font-family and keeps the old font.
  if (!supports(value)) return { level: 'error', message: 'Not a valid CSS font-family' };
  const { missing, usable } = checkFonts(value, measure);
  // E.g. `""`: valid CSS, but it names no font at all.
  if (!usable && !missing.length) return { level: 'error', message: 'No font family given' };
  if (!usable) return { level: 'error', message: `Not installed: ${missing.join(', ')}` };
  if (missing.length) return { level: 'warning', message: `Not installed, will be skipped: ${missing.join(', ')}` };
  return { level: 'ok', message: '' };
}
