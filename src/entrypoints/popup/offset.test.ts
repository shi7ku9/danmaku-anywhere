import { describe, expect, it } from 'vitest';
import { createOffsetSender, parseOffsetInput } from './offset';

describe('createOffsetSender', () => {
  it('accumulates rapid steps and sends them in order', async () => {
    const sent: number[] = [];
    let inFlight = 0;
    const sender = createOffsetSender(0, async (offset) => {
      inFlight++;
      expect(inFlight).toBe(1);
      await new Promise((r) => setTimeout(r, 5));
      sent.push(offset);
      inFlight--;
    });
    void sender.add(1);
    void sender.add(1);
    const last = sender.add(-0.5);
    expect(sender.value).toBe(1.5);
    await last;
    expect(sent).toEqual([1, 2, 1.5]);
  });

  it('rounds to a tenth of a second', () => {
    const sender = createOffsetSender(0.1, async () => {});
    void sender.add(0.2);
    expect(sender.value).toBe(0.3);
  });

  it('ignores non-finite input', () => {
    const sender = createOffsetSender(2, async () => {});
    void sender.set(Number.NaN);
    expect(sender.value).toBe(2);
  });
});

describe('createOffsetSender.sync', () => {
  it('takes the latest stored offset when nothing is pending', async () => {
    const sent: number[] = [];
    const sender = createOffsetSender(0, async (v) => void sent.push(v));
    sender.sync(5);
    await sender.add(1);
    expect(sent).toEqual([6]);
  });

  it('keeps local steps that have not been sent yet', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sender = createOffsetSender(0, () => gate);
    const pending = sender.add(1);
    void sender.add(1);
    sender.sync(1); // a stale status arriving mid-flight
    expect(sender.value).toBe(2);
    release();
    await pending;
  });
});

describe('parseOffsetInput', () => {
  it('reads numbers, including negative and decimal ones', () => {
    expect(parseOffsetInput('-3.5')).toBe(-3.5);
    expect(parseOffsetInput(' 2 ')).toBe(2);
    expect(parseOffsetInput('0')).toBe(0);
  });

  it('rejects an empty or non-numeric field', () => {
    expect(parseOffsetInput('')).toBeNull();
    expect(parseOffsetInput('   ')).toBeNull();
    expect(parseOffsetInput('abc')).toBeNull();
  });
});
