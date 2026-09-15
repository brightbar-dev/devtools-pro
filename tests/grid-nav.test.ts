import { describe, it, expect } from 'vitest';
import { gridLayout, moveFocus } from '../utils/grid-nav';
import { TOOLS } from '../utils/tools';
import { TOOL_ICONS, toolIcon } from '../utils/icons';

describe('gridLayout', () => {
  it('lays thirteen tools out as four rows of three and a full-width last row', () => {
    const cells = gridLayout(13, 3, new Set([12]));
    expect(cells.slice(0, 4)).toEqual([{ row: 0, col: 0, span: 1 }, { row: 0, col: 1, span: 1 }, { row: 0, col: 2, span: 1 }, { row: 1, col: 0, span: 1 }]);
    expect(cells[11]).toEqual({ row: 3, col: 2, span: 1 });
    expect(cells[12]).toEqual({ row: 4, col: 0, span: 3 });
  });

  it('starts a new row for a full-width item after a partial row', () => {
    expect(gridLayout(3, 3, new Set([1]))).toEqual([{ row: 0, col: 0, span: 1 }, { row: 1, col: 0, span: 3 }, { row: 2, col: 0, span: 1 }]);
  });
});

describe('moveFocus', () => {
  const cells = gridLayout(13, 3, new Set([12]));

  it('moves left and right in reading order, stopping at the ends', () => {
    expect(moveFocus(cells, 0, 'ArrowRight')).toBe(1);
    expect(moveFocus(cells, 2, 'ArrowRight')).toBe(3);
    expect(moveFocus(cells, 0, 'ArrowLeft')).toBe(0);
    expect(moveFocus(cells, 12, 'ArrowRight')).toBe(12);
  });

  it('moves up and down by column', () => {
    expect(moveFocus(cells, 1, 'ArrowDown')).toBe(4);
    expect(moveFocus(cells, 4, 'ArrowUp')).toBe(1);
    expect(moveFocus(cells, 0, 'ArrowUp')).toBe(0);
  });

  it('reaches the full-width row from any column and returns to the first column', () => {
    expect(moveFocus(cells, 9, 'ArrowDown')).toBe(12);
    expect(moveFocus(cells, 11, 'ArrowDown')).toBe(12);
    expect(moveFocus(cells, 12, 'ArrowUp')).toBe(9);
    expect(moveFocus(cells, 12, 'ArrowDown')).toBe(12);
  });

  it('jumps to the ends with Home and End and ignores other keys', () => {
    expect(moveFocus(cells, 7, 'Home')).toBe(0);
    expect(moveFocus(cells, 7, 'End')).toBe(12);
    expect(moveFocus(cells, 7, 'Enter')).toBe(7);
  });
});

describe('tool icons', () => {
  it('has a decorative inline SVG for every tool', () => {
    for (const tool of TOOLS) {
      const icon = TOOL_ICONS[tool.id];
      expect(icon, tool.id).toMatch(/^<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"[^>]*>.*<\/svg>$/);
      expect(icon).not.toMatch(/<script|on\w+=|href/i);
    }
  });

  it('falls back to a visible square for unknown ids', () => {
    expect(toolIcon('nope')).toContain('<rect');
  });
});
