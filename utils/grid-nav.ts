/** Arrow-key movement across the popup's tool grid, including items that span the full row. */

export interface GridCell {
  row: number;
  col: number;
  span: number;
}

/** Lay `count` items out in `columns` columns; indices in `fullWidth` take a row of their own. */
export function gridLayout(count: number, columns: number, fullWidth: ReadonlySet<number> = new Set()): GridCell[] {
  const cells: GridCell[] = [];
  let row = 0;
  let col = 0;
  for (let i = 0; i < count; i++) {
    if (fullWidth.has(i)) {
      if (col !== 0) row++;
      cells.push({ row, col: 0, span: columns });
      row++;
      col = 0;
      continue;
    }
    cells.push({ row, col, span: 1 });
    col++;
    if (col === columns) {
      row++;
      col = 0;
    }
  }
  return cells;
}

const covers = (cell: GridCell, col: number) => col >= cell.col && col < cell.col + cell.span;

/** The index focus moves to for a key, or the same index when the key does not move it. */
export function moveFocus(cells: readonly GridCell[], index: number, key: string): number {
  const current = cells[index];
  if (!current) return index;
  switch (key) {
    case 'ArrowRight': return Math.min(index + 1, cells.length - 1);
    case 'ArrowLeft': return Math.max(index - 1, 0);
    case 'Home': return 0;
    case 'End': return cells.length - 1;
    case 'ArrowDown':
    case 'ArrowUp': {
      const targetRow = current.row + (key === 'ArrowDown' ? 1 : -1);
      const inRow = cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell.row === targetRow);
      if (inRow.length === 0) return index;
      const exact = inRow.find(({ cell }) => covers(cell, current.col));
      if (exact) return exact.i;
      // A short last row: go to the nearest cell in it.
      return inRow.reduce((best, c) => (Math.abs(c.cell.col - current.col) < Math.abs(best.cell.col - current.col) ? c : best)).i;
    }
    default:
      return index;
  }
}
