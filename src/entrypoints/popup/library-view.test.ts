import { describe, expect, it } from 'vitest';
import type { Bindings } from '../../core/types';
import { deleteLabel, pagesUsing, usedByLabel } from './library-view';

const bindings: Bindings = {
  'https://a.com/1': { danmakuId: 'x', offset: 0, title: 'One' },
  'https://b.com/2': { danmakuId: 'y', offset: 0, title: 'Two' },
  'https://c.com/3': { danmakuId: 'x', offset: 2, title: 'Three' },
};

describe('pagesUsing', () => {
  it('lists the pages bound to a danmaku', () => {
    expect(pagesUsing(bindings, 'x')).toEqual([
      { urlKey: 'https://a.com/1', title: 'One' },
      { urlKey: 'https://c.com/3', title: 'Three' },
    ]);
    expect(pagesUsing(bindings, 'none')).toEqual([]);
  });
});

describe('labels', () => {
  it('words the number of pages', () => {
    expect(usedByLabel(0)).toBe('');
    expect(usedByLabel(1)).toBe('Used by 1 page');
    expect(usedByLabel(3)).toBe('Used by 3 pages');
  });

  it('names what deleting also unbinds', () => {
    expect(deleteLabel(0)).toBe('Delete?');
    expect(deleteLabel(1)).toBe('Delete? Unbinds 1 page');
    expect(deleteLabel(2)).toBe('Delete? Unbinds 2 pages');
  });
});
