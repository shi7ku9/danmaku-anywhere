/**
 * Tracks overlapping requests so only the newest one's result is used: each
 * call wraps a request that has just been sent, and resolves to `{ value }` if
 * no newer request was tracked since, or `null` if it went stale meanwhile.
 */
export function createLatest() {
  let newest = 0;
  return async <T>(request: Promise<T>): Promise<{ value: T } | null> => {
    const mine = ++newest;
    const value = await request;
    return mine === newest ? { value } : null;
  };
}
