import { describe, expect, it } from 'vitest';
import { missingFonts, parseFamilies, type Measure } from './font-check';

describe('parseFamilies', () => {
  it('splits on commas and removes quotes', () => {
    expect(parseFamilies(`"Noto Sans TC", 'A, B', serif`)).toEqual([
      { name: 'Noto Sans TC', quoted: true },
      { name: 'A, B', quoted: true },
      { name: 'serif', quoted: false },
    ]);
  });

  it('keeps escaped commas and quotes inside a name', () => {
    expect(parseFamilies('Foo\\, Bar, serif').map((f) => f.name)).toEqual(['Foo, Bar', 'serif']);
    expect(parseFamilies(`"A\\"B", 'C\\'D'`).map((f) => f.name)).toEqual(['A"B', "C'D"]);
  });

  it('resolves hex escapes and keeps escaped spaces', () => {
    expect(parseFamilies('\\5F3E \\5E55, A\\  B').map((f) => f.name)).toEqual(['弾幕', 'A  B']);
  });

  it('collapses whitespace in unquoted names', () => {
    expect(parseFamilies('Noto   Sans TC ,  mono').map((f) => f.name)).toEqual(['Noto Sans TC', 'mono']);
  });
});

describe('missingFonts', () => {
  // Pretends only "Installed" exists: it changes the width, anything else falls back.
  const measure: Measure = (font) => {
    const fallback = font.endsWith('monospace') ? 100 : 90;
    return font.includes('"Installed"') ? 120 : fallback;
  };

  it('finds every family that falls back', () => {
    expect(missingFonts('Installed, Nope, "Also Nope", sans-serif', measure)).toEqual(['Nope', 'Also Nope']);
  });

  it('accepts installed and generic families', () => {
    expect(missingFonts('Installed, system-ui, Serif', measure)).toEqual([]);
  });

  it('treats a quoted generic name as a font name', () => {
    expect(missingFonts('"serif", Installed', measure)).toEqual(['serif']);
  });

  it('checks a name with an escaped comma as one font', () => {
    const only: Measure = (font) => (font.includes('"Foo, Bar"') ? 120 : font.endsWith('monospace') ? 100 : 90);
    expect(missingFonts('Foo\\, Bar, serif', only)).toEqual([]);
  });

  it('accepts CSS-wide keywords', () => {
    expect(missingFonts('inherit', measure)).toEqual([]);
    expect(missingFonts(' Revert-Layer ', measure)).toEqual([]);
  });
});
