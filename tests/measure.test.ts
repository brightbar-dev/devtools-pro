import { describe, it, expect } from 'vitest';
import { distanceGuides, formatLength, isDrag, rulerRect } from '../utils/measure';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('distanceGuides', () => {
  it('measures the gap to a box on the right, level with the shared span', () => {
    const guides = distanceGuides(box(0, 0, 100, 50), box(140, 10, 60, 60));
    expect(guides).toContainEqual({ x1: 100, y1: 30, x2: 140, y2: 30, axis: 'x', length: 40 });
    expect(guides.filter(g => g.axis === 'y').map(g => g.length).sort()).toEqual([10, 20]);
  });

  it('measures the gap to a box below', () => {
    const guides = distanceGuides(box(0, 0, 100, 50), box(0, 74, 100, 20));
    expect(guides).toEqual([{ x1: 50, y1: 50, x2: 50, y2: 74, axis: 'y', length: 24 }]);
  });

  it('measures gaps on both axes for a diagonal box', () => {
    const guides = distanceGuides(box(0, 0, 100, 100), box(130, 150, 20, 20));
    expect(guides).toEqual([
      { x1: 100, y1: 160, x2: 130, y2: 160, axis: 'x', length: 30 },
      { x1: 140, y1: 100, x2: 140, y2: 150, axis: 'y', length: 50 },
    ]);
  });

  it('measures the four insets of a box inside the anchor', () => {
    const guides = distanceGuides(box(0, 0, 200, 100), box(20, 10, 100, 40));
    expect(guides.map(g => [g.axis, g.length])).toEqual([['x', 20], ['x', 80], ['y', 10], ['y', 50]]);
  });

  it('drops zero-length guides for aligned edges', () => {
    const guides = distanceGuides(box(0, 0, 200, 100), box(0, 0, 100, 100));
    expect(guides.map(g => [g.axis, g.length])).toEqual([['x', 100]]);
  });

  it('is symmetric in length when anchor and target swap', () => {
    const a = box(10, 10, 50, 50);
    const b = box(100, 30, 40, 40);
    expect(distanceGuides(a, b).map(g => g.length)).toEqual(distanceGuides(b, a).map(g => g.length));
  });
});

describe('ruler', () => {
  it('normalises a drag in any direction', () => {
    expect(rulerRect({ left: 50, top: 80 }, { left: 10, top: 20 })).toEqual(box(10, 20, 40, 60));
  });

  it('treats tiny movements as a click', () => {
    expect(isDrag({ left: 0, top: 0 }, { left: 3, top: 3 })).toBe(false);
    expect(isDrag({ left: 0, top: 0 }, { left: 0, top: 4 })).toBe(true);
  });

  it('formats lengths as whole or one-decimal pixels', () => {
    expect(formatLength(24)).toBe('24px');
    expect(formatLength(12.46)).toBe('12.5px');
    expect(formatLength(-8)).toBe('8px');
  });
});
