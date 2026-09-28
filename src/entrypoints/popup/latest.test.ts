import { describe, expect, it } from 'vitest';
import { createLatest } from './latest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createLatest', () => {
  it('uses a lone request', async () => {
    const latest = createLatest();
    expect(await latest(Promise.resolve('a'))).toEqual({ value: 'a' });
  });

  it('drops an older request that finishes after a newer one', async () => {
    const latest = createLatest();
    const a = deferred<string>();
    const b = deferred<string>();
    const first = latest(a.promise);
    const second = latest(b.promise);
    b.resolve('b');
    expect(await second).toEqual({ value: 'b' });
    a.resolve('a');
    expect(await first).toBeNull();
  });

  it('drops an older request even when it finishes first', async () => {
    const latest = createLatest();
    const a = deferred<string>();
    const b = deferred<string>();
    const first = latest(a.promise);
    const second = latest(b.promise);
    a.resolve('a');
    expect(await first).toBeNull();
    b.resolve('b');
    expect(await second).toEqual({ value: 'b' });
  });
});
