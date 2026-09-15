import { describe, it, expect } from 'vitest';
import { coalesceToFrames } from '../utils/schedule';

/** A manual animation-frame queue. */
function frames() {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    request: (cb: () => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancel: (id: number) => {
      queue.delete(id);
    },
    flush() {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach(cb => cb());
    },
    get size() {
      return queue.size;
    },
  };
}

describe('coalesceToFrames', () => {
  it('runs once per frame however many events arrive', () => {
    const f = frames();
    let runs = 0;
    const c = coalesceToFrames(() => runs++, f.request, f.cancel);
    for (let i = 0; i < 50; i++) c.schedule();
    expect(f.size).toBe(1);
    expect(c.pending).toBe(true);
    f.flush();
    expect(runs).toBe(1);
    expect(c.pending).toBe(false);
  });

  it('schedules again after a frame has run', () => {
    const f = frames();
    let runs = 0;
    const c = coalesceToFrames(() => runs++, f.request, f.cancel);
    c.schedule();
    f.flush();
    c.schedule();
    c.schedule();
    f.flush();
    expect(runs).toBe(2);
  });

  it('cancel drops a pending run', () => {
    const f = frames();
    let runs = 0;
    const c = coalesceToFrames(() => runs++, f.request, f.cancel);
    c.schedule();
    c.cancel();
    f.flush();
    expect(runs).toBe(0);
    expect(c.pending).toBe(false);
  });

  it('allows the run to schedule the next frame', () => {
    const f = frames();
    let runs = 0;
    const c = coalesceToFrames(() => {
      runs++;
      if (runs < 3) c.schedule();
    }, f.request, f.cancel);
    c.schedule();
    f.flush();
    f.flush();
    f.flush();
    expect(runs).toBe(3);
  });
});
