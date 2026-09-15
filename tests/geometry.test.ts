import { describe, it, expect } from 'vitest';
import { frameContentOffset, overlapArea, placePanel, sameRect, translateRect, type Rect } from '../utils/geometry';

const viewport = { width: 1000, height: 800 };
const panel = { width: 200, height: 100 };

const asRect = (p: { left: number; top: number }): Rect => ({ ...p, ...panel });

describe('placePanel', () => {
  it('prefers just below the target, left-aligned', () => {
    const target = { left: 100, top: 100, width: 50, height: 20 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 100, top: 128 });
  });

  it('goes above when there is no room below', () => {
    const target = { left: 100, top: 700, width: 50, height: 50 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 100, top: 592 });
  });

  it('goes to the right of a tall target', () => {
    const target = { left: 10, top: 10, width: 100, height: 780 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 118, top: 10 });
  });

  it('goes to the left when the target hugs the right edge', () => {
    const target = { left: 700, top: 10, width: 290, height: 780 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 492, top: 10 });
  });

  it('keeps a below-placed panel inside the right edge', () => {
    const target = { left: 950, top: 100, width: 40, height: 20 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 792, top: 128 });
  });

  it('never covers the target when any side has room', () => {
    for (let left = 0; left < 1000; left += 97) {
      for (let top = 0; top < 800; top += 83) {
        const target = { left, top, width: 120, height: 60 };
        const p = placePanel(target, panel, viewport);
        expect(overlapArea(asRect(p), target)).toBe(0);
        expect(p.left).toBeGreaterThanOrEqual(8);
        expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.left + panel.width).toBeLessThanOrEqual(992);
        expect(p.top + panel.height).toBeLessThanOrEqual(792);
      }
    }
  });

  it('falls back to the corner that covers the least of a viewport-sized target', () => {
    const target = { left: 0, top: 0, width: 1000, height: 700 };
    expect(placePanel(target, panel, viewport)).toEqual({ left: 792, top: 692 });
  });
});

describe('rect helpers', () => {
  it('computes a frame content offset from border and padding', () => {
    expect(frameContentOffset({ left: 10, top: 20 }, { left: 2, top: 2 }, { left: 5, top: 0 })).toEqual({ dx: 17, dy: 22 });
  });

  it('translates a rect without resizing it', () => {
    expect(translateRect({ left: 1, top: 2, width: 3, height: 4 }, 10, 20)).toEqual({ left: 11, top: 22, width: 3, height: 4 });
  });

  it('measures overlap area, zero for touching rects', () => {
    expect(overlapArea({ left: 0, top: 0, width: 10, height: 10 }, { left: 5, top: 5, width: 10, height: 10 })).toBe(25);
    expect(overlapArea({ left: 0, top: 0, width: 10, height: 10 }, { left: 10, top: 0, width: 10, height: 10 })).toBe(0);
  });

  it('treats sub-pixel jitter as the same rect', () => {
    expect(sameRect({ left: 0, top: 0, width: 10, height: 10 }, { left: 0.3, top: 0, width: 10, height: 10.2 })).toBe(true);
    expect(sameRect({ left: 0, top: 0, width: 10, height: 10 }, { left: 2, top: 0, width: 10, height: 10 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(null, { left: 0, top: 0, width: 0, height: 0 })).toBe(false);
  });
});
