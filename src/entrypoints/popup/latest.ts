/**
 * Serializes the effect of overlapping requests: only the newest request's
 * result is applied, and awaiting any request resolves once the newest one
 * (at that moment) has been applied. A caller that awaits a request can
 * therefore rely on the newest state, even when its own answer was dropped as
 * stale, instead of acting on whatever was there before.
 */
export function createLatest() {
  let newest = 0;
  let newestDone: Promise<void> = Promise.resolve();
  return async <T>(request: Promise<T>, apply: (value: T) => void): Promise<void> => {
    const mine = ++newest;
    const done = request.then((value) => {
      if (mine === newest) apply(value);
    });
    newestDone = done;
    await done;
    // A newer request may have started meanwhile; wait until the newest one has been applied.
    let waited: Promise<void>;
    do {
      waited = newestDone;
      await waited;
    } while (waited !== newestDone);
  };
}
