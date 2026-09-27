/**
 * Tracks the offset locally and sends changes one at a time, so rapid clicks
 * accumulate instead of reading a stale value, and are persisted in order.
 */
export function createOffsetSender(initial: number, send: (offset: number) => Promise<void>) {
  let value = initial;
  let chain = Promise.resolve();
  let pending = 0;
  return {
    get value(): number {
      return value;
    },
    set(offset: number): Promise<void> {
      if (!Number.isFinite(offset)) return chain;
      value = Math.round(offset * 10) / 10;
      const target = value;
      pending++;
      chain = chain.then(() => send(target)).finally(() => pending--);
      return chain;
    },
    /** Adopts the stored offset (changed elsewhere) unless local changes are still in flight. */
    sync(offset: number): void {
      if (pending === 0) value = offset;
    },
    add(delta: number): Promise<void> {
      return this.set(value + delta);
    },
  };
}

/** Reads the offset field; null for an empty or non-numeric value, which must not be sent. */
export function parseOffsetInput(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
