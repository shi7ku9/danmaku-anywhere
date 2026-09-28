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
  it('applies a lone request', async () => {
    const latest = createLatest();
    const applied: string[] = [];
    await latest(Promise.resolve('a'), (v) => applied.push(v));
    expect(applied).toEqual(['a']);
  });

  it('drops an older answer that arrives after a newer one', async () => {
    const latest = createLatest();
    const applied: string[] = [];
    const a = deferred<string>();
    const b = deferred<string>();
    const first = latest(a.promise, (v) => applied.push(v));
    const second = latest(b.promise, (v) => applied.push(v));
    b.resolve('b');
    await second;
    a.resolve('a');
    await first;
    expect(applied).toEqual(['b']);
  });

  it('makes an older request wait for the newest one to be applied', async () => {
    const latest = createLatest();
    const applied: string[] = [];
    const a = deferred<string>();
    const b = deferred<string>();
    let firstDone = false;
    const first = latest(a.promise, (v) => applied.push(v)).then(() => {
      firstDone = true;
    });
    const second = latest(b.promise, (v) => applied.push(v));
    a.resolve('a');
    await Promise.resolve();
    await Promise.resolve();
    // Its own answer is stale and dropped, but it must not return before the newest state is in.
    expect(firstDone).toBe(false);
    b.resolve('b');
    await Promise.all([first, second]);
    expect(applied).toEqual(['b']);
    expect(firstDone).toBe(true);
  });

  it('also waits for requests started while it was waiting', async () => {
    const latest = createLatest();
    const applied: string[] = [];
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    const first = latest(a.promise, (v) => applied.push(v));
    latest(b.promise, (v) => applied.push(v));
    a.resolve('a');
    const third = latest(c.promise, (v) => applied.push(v));
    b.resolve('b');
    c.resolve('c');
    await Promise.all([first, third]);
    expect(applied).toEqual(['c']);
  });
});
