const DROPPED_PARAMS = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'si', 't', 'start']);

/** Normalizes a page URL into the key its danmaku is stored under. */
export function urlKey(href: string): string {
  const url = new URL(href);
  const params = [...url.searchParams].filter(
    ([name]) => !name.startsWith('utm_') && !DROPPED_PARAMS.has(name),
  );
  params.sort(([a, av], [b, bv]) => (a === b ? compare(av, bv) : compare(a, b)));
  const search = new URLSearchParams(params).toString();
  return `${url.protocol}//${url.host}${url.pathname}${search ? `?${search}` : ''}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
