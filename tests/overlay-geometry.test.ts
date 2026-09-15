import { describe, it, expect } from 'vitest';
import { boxRegions, distribute, flexGaps, gridOverlay, parseAreas, parseTrackList, ringBands } from '../utils/overlay-geometry';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const sides = (top: number, right: number, bottom: number, left: number) => ({ top, right, bottom, left });

describe('boxRegions', () => {
  it('splits margin and padding into bands around the border and content boxes', () => {
    const r = boxRegions(box(100, 100, 200, 100), { margin: sides(10, 20, 10, 20), border: sides(1, 1, 1, 1), padding: sides(8, 16, 8, 16) });
    expect(r.content).toEqual(box(117, 109, 166, 82));
    expect(r.margin).toEqual([box(80, 90, 240, 10), box(80, 200, 240, 10), box(80, 100, 20, 100), box(300, 100, 20, 100)]);
    expect(r.padding).toEqual([box(101, 101, 198, 8), box(101, 191, 198, 8), box(101, 109, 16, 82), box(283, 109, 16, 82)]);
  });

  it('draws nothing for zero or negative margins', () => {
    const r = boxRegions(box(0, 0, 50, 50), { margin: sides(-10, 0, 0, 0), border: sides(0, 0, 0, 0), padding: sides(0, 0, 0, 0) });
    expect(r.margin).toEqual([]);
    expect(r.padding).toEqual([]);
  });

  it('omits empty bands', () => {
    expect(ringBands(box(0, 0, 10, 10), box(0, 0, 10, 10))).toEqual([]);
  });
});

describe('grid parsing', () => {
  it('reads resolved px track lists and ignores line names', () => {
    expect(parseTrackList('384px 384px 384px')).toEqual([384, 384, 384]);
    expect(parseTrackList('[full-start] 200px [content] 150.5px')).toEqual([200, 150.5]);
    expect(parseTrackList('none')).toEqual([]);
  });

  it('reads template areas row by row', () => {
    expect(parseAreas('"head head" "nav main"')).toEqual([['head', 'head'], ['nav', 'main']]);
    expect(parseAreas('none')).toEqual([]);
  });

  it('distributes free space like justify-content / align-content', () => {
    expect(distribute(100, 3, 'normal')).toEqual({ offset: 0, extraGap: 0 });
    expect(distribute(100, 3, 'center')).toEqual({ offset: 50, extraGap: 0 });
    expect(distribute(100, 3, 'end')).toEqual({ offset: 100, extraGap: 0 });
    expect(distribute(100, 3, 'space-between')).toEqual({ offset: 0, extraGap: 50 });
    expect(distribute(90, 3, 'space-around')).toEqual({ offset: 15, extraGap: 30 });
    expect(distribute(100, 3, 'space-evenly')).toEqual({ offset: 25, extraGap: 25 });
  });
});

describe('gridOverlay', () => {
  const base = { content: box(16, 16, 1184, 100), columns: [384, 384, 384], rows: [36], columnGap: 16, rowGap: 0, justifyContent: 'normal', alignContent: 'normal', areas: 'none' };

  it('places the fixture’s three columns and two gaps', () => {
    const g = gridOverlay(base);
    expect(g.columns.map(c => c.left)).toEqual([16, 416, 816]);
    expect(g.columnGaps).toEqual([box(400, 16, 16, 36), box(800, 16, 16, 36)]);
    expect(g.rows).toEqual([box(16, 16, 1184, 36)]);
    expect(g.rowGaps).toEqual([]);
  });

  it('shifts tracks for centred content', () => {
    const g = gridOverlay({ ...base, content: box(0, 0, 1284, 36), justifyContent: 'center' });
    expect(g.columns[0]!.left).toBe(50);
  });

  it('computes named areas across tracks and gaps', () => {
    const g = gridOverlay({ content: box(0, 0, 300, 200), columns: [100, 190], rows: [50, 140], columnGap: 10, rowGap: 10, justifyContent: 'normal', alignContent: 'normal', areas: '"head head" "nav main"' });
    expect(g.areas).toEqual([
      { name: 'head', ...box(0, 0, 300, 50) },
      { name: 'nav', ...box(0, 60, 100, 140) },
      { name: 'main', ...box(110, 60, 190, 140) },
    ]);
  });
});

describe('flexGaps', () => {
  it('finds the gaps between row items, whatever the DOM order', () => {
    expect(flexGaps([box(200, 0, 50, 30), box(0, 0, 50, 30), box(100, 5, 50, 20)], 'row')).toEqual([box(50, 0, 50, 30), box(150, 0, 50, 30)]);
  });

  it('finds the gaps between column items', () => {
    expect(flexGaps([box(0, 0, 100, 20), box(0, 28, 80, 20)], 'column')).toEqual([box(0, 20, 100, 8)]);
  });

  it('ignores touching or overlapping items', () => {
    expect(flexGaps([box(0, 0, 50, 10), box(50, 0, 50, 10)], 'row-reverse')).toEqual([]);
  });
});
