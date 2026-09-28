import { describe, expect, it } from 'vitest';
import { checkFonts, fontStatus, parseFamilies, type Measure } from './font-check';

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

describe('checkFonts', () => {
  // Pretends only "Installed" and "Foo, Bar" exist: they change the width, anything else falls back.
  const measure: Measure = (font) => {
    if (font.includes('"Installed"') || font.includes('"Foo, Bar"')) return 120;
    return font.endsWith('monospace') ? 100 : 90;
  };

  it('finds every family that falls back', () => {
    expect(checkFonts('Installed, Nope, "Also Nope", sans-serif', measure)).toEqual({
      missing: ['Nope', 'Also Nope'],
      usable: true,
    });
  });

  it('accepts installed and generic families', () => {
    expect(checkFonts('Installed, system-ui, Serif', measure)).toEqual({ missing: [], usable: true });
  });

  it('is unusable when nothing in the list renders', () => {
    expect(checkFonts('Nope, "Also Nope"', measure)).toEqual({ missing: ['Nope', 'Also Nope'], usable: false });
  });

  it('treats a quoted generic name as a font name', () => {
    expect(checkFonts('"serif", Installed', measure).missing).toEqual(['serif']);
  });

  it('checks a name with an escaped comma as one font', () => {
    expect(checkFonts('Foo\\, Bar, serif', measure)).toEqual({ missing: [], usable: true });
  });

  it('accepts CSS-wide keywords', () => {
    expect(checkFonts('inherit', measure).usable).toBe(true);
    expect(checkFonts(' Revert-Layer ', measure).missing).toEqual([]);
  });

  describe('fontStatus', () => {
    const valid = () => true;

    it('errors on invalid CSS', () => {
      expect(fontStatus('Foo,', () => false, measure).level).toBe('error');
    });

    it('only warns when some families are missing', () => {
      expect(fontStatus('Nope, Installed', valid, measure)).toEqual({
        level: 'warning',
        message: 'Not installed, will be skipped: Nope',
      });
      expect(fontStatus('Nope, sans-serif', valid, measure).level).toBe('warning');
    });

    it('errors when nothing in the list renders', () => {
      expect(fontStatus('Nope, "Also Nope"', valid, measure)).toEqual({
        level: 'error',
        message: 'Not installed: Nope, Also Nope',
      });
    });

    it('is fine when everything is installed', () => {
      expect(fontStatus('Installed, serif', valid, measure).level).toBe('ok');
    });
  });
});
