import { describe, it, expect } from 'vitest';
import { captureTiles, dataUrlBytes, deviceCrop, screenshotFilename } from '../utils/capture';

describe('captureTiles', () => {
  it('covers a page with whole viewports and a short last tile', () => {
    expect(captureTiles(0, 2000, 800, 1200)).toEqual([
      { scrollY: 0, fromY: 0, height: 800 },
      { scrollY: 800, fromY: 800, height: 800 },
      { scrollY: 1200, fromY: 1600, height: 400 },
    ]);
  });

  it('uses one tile when the range fits', () => {
    expect(captureTiles(0, 600, 800, 0)).toEqual([{ scrollY: 0, fromY: 0, height: 600 }]);
  });

  it('covers a tall element from its own top', () => {
    expect(captureTiles(1000, 2500, 900, 3100)).toEqual([
      { scrollY: 1000, fromY: 1000, height: 900 },
      { scrollY: 1900, fromY: 1900, height: 600 },
    ]);
  });

  it('never double-counts rows when scrolling is capped', () => {
    const tiles = captureTiles(0, 2750, 900, 1850);
    expect(tiles.reduce((sum, t) => sum + t.height, 0)).toBe(2750);
    tiles.forEach((t, i) => i > 0 && expect(t.fromY).toBe(tiles[i - 1]!.fromY + tiles[i - 1]!.height));
    expect(tiles.at(-1)).toEqual({ scrollY: 1850, fromY: 2700, height: 50 });
  });

  it('returns nothing for an empty range or viewport', () => {
    expect(captureTiles(10, 10, 800, 100)).toEqual([]);
    expect(captureTiles(0, 100, 0, 100)).toEqual([]);
  });
});

describe('deviceCrop', () => {
  it('scales by devicePixelRatio and clamps to the capture', () => {
    expect(deviceCrop({ left: 10, top: 20, width: 100, height: 50 }, 2, { width: 2560, height: 1800 })).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
    expect(deviceCrop({ left: -10, top: 850, width: 100, height: 100 }, 1, { width: 1280, height: 900 })).toEqual({ sx: 0, sy: 850, sw: 90, sh: 50 });
  });
});

describe('screenshotFilename', () => {
  it('names by site, kind and UTC time', () => {
    const date = new Date('2026-09-15T05:43:10.123Z');
    expect(screenshotFilename('page', 'www.stripe.com', date)).toBe('stripe.com-page-2026-09-15-05-43-10.png');
    expect(screenshotFilename('element', '', date)).toBe('page-element-2026-09-15-05-43-10.png');
    expect(screenshotFilename('visible', '127.0.0.1', date)).toBe('127.0.0.1-visible-2026-09-15-05-43-10.png');
  });
});

describe('dataUrlBytes', () => {
  it('decodes base64 and plain data URLs', () => {
    expect(dataUrlBytes('data:image/png;base64,iVBORw==')).toEqual({ mime: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    expect(dataUrlBytes('data:text/plain,hi%21').bytes).toEqual(new TextEncoder().encode('hi!'));
    expect(() => dataUrlBytes('https://example.com')).toThrow();
  });
});
