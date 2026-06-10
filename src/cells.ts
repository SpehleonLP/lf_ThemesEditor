import type { CellGrid, EditorCell, Vec4 } from './types';

export const NO_CELLS = 5;
type Grid = Vec4[][];

const emptyGrid = (): Grid =>
  Array.from({ length: NO_CELLS }, () => Array.from({ length: NO_CELLS }, () => [0, 0, 0, 0] as Vec4));

// Port of gui_packagebuilder.cpp:142-250. Engine floats: signed, Infinity = FLT_MAX.
export function parseCellsJson(json: unknown): { kind: 'copy' } | { kind: 'grid'; grid: Grid } {
  if (typeof json === 'string') return { kind: 'copy' };
  if (!Array.isArray(json)) throw new Error('Cells must be a string or an array');
  const grid = emptyGrid();

  if (json.length === 4 && json.every((v) => typeof v === 'number')) {
    // JSON order is [y0, x0, y1, x1] (y first) — see c[] index math at :221-240
    const [y0, x0, y1, x1] = json as number[];
    const cx = [0, x0, x1, Infinity];
    const cy = [0, y0, y1, Infinity];
    for (let y = 0; y < NO_CELLS; ++y)
      for (let x = 0; x < NO_CELLS; ++x) {
        const ix = Math.min(x, 2), iy = Math.min(y, 2);
        grid[y][x] = [cx[ix], cy[iy], cx[ix + 1], cy[iy + 1]];
      }
    return { kind: 'grid', grid };
  }

  if (json.length === 4)
    throw new Error('Cells 4-cut form: all 4 values must be numbers');

  if (json.length === 2) {
    const lines = (json as number[][]).map((a) => {
      if (!Array.isArray(a) || a.length === 0) throw new Error('Cells x/y form: subarrays cannot be empty');
      if (a.length > NO_CELLS + 1) throw new Error('Cells x/y form: subarray has too many members');
      if (a.length === 6) return a.slice();
      // C++: s = max(size-2, 0); resize(6, back()); c[4] = c[s];
      const s = Math.max(a.length - 2, 0);
      const out = a.slice();
      while (out.length < 6) out.push(a[a.length - 1]);
      out[4] = out[s];
      return out;
    });
    for (let y = 0; y < NO_CELLS; ++y)
      for (let x = 0; x < NO_CELLS; ++x)
        grid[y][x] = [lines[0][x], lines[1][y], lines[0][x + 1], lines[1][y + 1]];
    return { kind: 'grid', grid };
  }

  if (json.length === 9 || json.length === 25) {
    const rects = json as Vec4[];
    for (const r of rects)
      if (!Array.isArray(r) || r.length !== 4) throw new Error('Cells rects must be 4 numbers each');
    for (let y = 0; y < NO_CELLS; ++y)
      for (let x = 0; x < NO_CELLS; ++x) {
        const i = json.length === 25
          ? y * NO_CELLS + x
          : Math.min(y, 2) * 3 + Math.min(x, 2);
        grid[y][x] = rects[i].slice() as Vec4;
      }
    return { kind: 'grid', grid };
  }

  throw new Error('field Cells should have either 2, 4, 9 or 25 members');
}

export function toEditorGrid(grid: Grid): CellGrid {
  return grid.map((row) => row.map((r): EditorCell => ({
    rect: [Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2]), Math.abs(r[3])],
    mirrorX: r[0] < 0 || r[2] < 0,
    mirrorY: r[1] < 0 || r[3] < 0,
  })));
}

// Mirror re-applies to BOTH coords of the axis; the engine ORs the signs (cpp:1414-1417)
// so this is semantically identical to any original single-coord sign. Caveat: a coord of 0
// can't carry a sign (JSON has no -0) — the paired coord carries it; both-zero is degenerate anyway.
export function fromEditorGrid(cells: CellGrid): Grid {
  return cells.map((row) => row.map((c): Vec4 => [
    c.mirrorX ? -c.rect[0] : c.rect[0],
    c.mirrorY ? -c.rect[1] : c.rect[1],
    c.mirrorX ? -c.rect[2] : c.rect[2],
    c.mirrorY ? -c.rect[3] : c.rect[3],
  ]));
}

// Infinity only arises from the 4-cut form; pin it to the actual image dims before editing/serializing.
export function resolveInfinity(grid: Grid, imageSize: [number, number]): Grid {
  return grid.map((row) => row.map((r): Vec4 => [
    r[0] === Infinity ? imageSize[0] : r[0],
    r[1] === Infinity ? imageSize[1] : r[1],
    r[2] === Infinity ? imageSize[0] : r[2],
    r[3] === Infinity ? imageSize[1] : r[3],
  ]));
}

// The editor always emits the lossless 25-rect pixel form.
export function serializeCells(cells: CellGrid): Vec4[] {
  const grid = fromEditorGrid(cells);
  const out: Vec4[] = [];
  for (const row of grid)
    for (const r of row) {
      if (r.some((v) => !Number.isFinite(v))) throw new Error('serializeCells: non-finite value present — call resolveInfinity first');
      out.push(r);
    }
  return out;
}
