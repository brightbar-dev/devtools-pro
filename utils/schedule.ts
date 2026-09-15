/** Event coalescing for the on-page inspector. */

export interface FrameCoalescer {
  /** Ask for one run on the next animation frame; repeat calls before then are free. */
  schedule(): void;
  cancel(): void;
  readonly pending: boolean;
}

/**
 * Coalesce bursts of events (mousemove, scroll) into at most one `run` per animation frame.
 * The frame functions are injected so the logic is testable without a browser.
 */
export function coalesceToFrames(
  run: () => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (handle: number) => void,
): FrameCoalescer {
  let handle: number | null = null;
  return {
    schedule() {
      if (handle !== null) return;
      handle = requestFrame(() => {
        handle = null;
        run();
      });
    },
    cancel() {
      if (handle === null) return;
      cancelFrame(handle);
      handle = null;
    },
    get pending() {
      return handle !== null;
    },
  };
}
