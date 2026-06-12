// Detect which higher-level editing mode a 25-rect CellGrid is already in, and rewrite rects when
// a cut/partition line is dragged. Detection compares rect MAGNITUDES (mirror flags ignored);
// rewrites PRESERVE existing mirror flags. Entering a mode never mutates data.
import type { CellGrid, Vec4 } from './types';
import { ninePatchGrid } from './cells';

export type GridMode = '3x3' | '5x5lines' | 'free';

const EPS = 1e-3;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const lo = (c: { rect: Vec4 }, i: 0 | 1) => Math.min(Math.abs(c.rect[i]), Math.abs(c.rect[i + 2]));
const hi = (c: { rect: Vec4 }, i: 0 | 1) => Math.max(Math.abs(c.rect[i]), Math.abs(c.rect[i + 2]));
const eqRect = (a: Vec4, b: Vec4) =>
  eq(Math.abs(a[0]), Math.abs(b[0])) && eq(Math.abs(a[1]), Math.abs(b[1])) &&
  eq(Math.abs(a[2]), Math.abs(b[2])) && eq(Math.abs(a[3]), Math.abs(b[3]));

// For 3x3: the engine 4-cut form (ix = Math.min(x, 2)) duplicates column 2 into columns 3 and 4,
// and row 2 into rows 3 and 4. Check that the 3x3 logical cells [0..2][0..2] tile correctly, and
// that columns/rows 3 and 4 are byte-equal copies of column/row 2 (magnitudes only).
function is3x3(cells: CellGrid): boolean {
  // Verify cols 3 and 4 are duplicates of col 2 for every row
  for (let y = 0; y < 5; ++y) {
    if (!eqRect(cells[y][3].rect, cells[y][2].rect)) return false;
    if (!eqRect(cells[y][4].rect, cells[y][2].rect)) return false;
  }
  // Verify rows 3 and 4 are duplicates of row 2 for every col
  for (let x = 0; x < 5; ++x) {
    if (!eqRect(cells[3][x].rect, cells[2][x].rect)) return false;
    if (!eqRect(cells[4][x].rect, cells[2][x].rect)) return false;
  }
  // Verify the 3x3 logical cells form a proper partition: each cell's rect must match
  // [xLines[ix], yLines[iy], xLines[ix+1], yLines[iy+1]] for the 3x3 cut lines.
  const xL = [lo(cells[0][0], 0), hi(cells[0][0], 0), hi(cells[0][1], 0), hi(cells[0][2], 0)];
  const yL = [lo(cells[0][0], 1), hi(cells[0][0], 1), hi(cells[1][0], 1), hi(cells[2][0], 1)];
  for (let iy = 0; iy < 3; ++iy)
    for (let ix = 0; ix < 3; ++ix) {
      const c = cells[iy][ix];
      if (!eq(lo(c, 0), xL[ix]) || !eq(hi(c, 0), xL[ix + 1])) return false;
      if (!eq(lo(c, 1), yL[iy]) || !eq(hi(c, 1), yL[iy + 1])) return false;
    }
  return true;
}

function lines(cells: CellGrid): { xLines: number[]; yLines: number[] } {
  const xLines: number[] = [];
  const yLines: number[] = [];
  for (let x = 0; x < 5; ++x) xLines.push(lo(cells[0][x], 0));
  xLines.push(hi(cells[0][4], 0));
  for (let y = 0; y < 5; ++y) yLines.push(lo(cells[y][0], 1));
  yLines.push(hi(cells[4][0], 1));
  return { xLines, yLines };
}

function isPartition(cells: CellGrid, xLines: number[], yLines: number[]): boolean {
  for (let y = 0; y < 5; ++y)
    for (let x = 0; x < 5; ++x) {
      const c = cells[y][x];
      if (!eq(lo(c, 0), xLines[x]) || !eq(hi(c, 0), xLines[x + 1])) return false;
      if (!eq(lo(c, 1), yLines[y]) || !eq(hi(c, 1), yLines[y + 1])) return false;
    }
  return true;
}

export function detectGridMode(cells: CellGrid): GridMode {
  if (is3x3(cells)) return '3x3';
  const { xLines, yLines } = lines(cells);
  if (!isPartition(cells, xLines, yLines)) return 'free';
  return '5x5lines';
}

export function extractLines3x3(cells: CellGrid): { xCuts: [number, number]; yCuts: [number, number] } {
  const { xLines, yLines } = lines(cells);
  return { xCuts: [xLines[1], xLines[2]], yCuts: [yLines[1], yLines[2]] };
}

export function extractLines5x5(cells: CellGrid): { xLines: number[]; yLines: number[] } {
  return lines(cells);
}

export function rewrite3x3(
  prev: CellGrid,
  xCuts: [number, number],
  yCuts: [number, number],
  imageSize: [number, number],
): CellGrid {
  const fresh = ninePatchGrid(xCuts, yCuts, imageSize);
  return fresh.map((row, y) => row.map((c, x) => ({ rect: c.rect, mirrorX: prev[y][x].mirrorX, mirrorY: prev[y][x].mirrorY })));
}

export function rewrite5x5Line(
  prev: CellGrid,
  axis: 'x' | 'y',
  lineIndex: number,
  newValue: number,
  imageSize: [number, number],
): CellGrid {
  const { xLines, yLines } = lines(prev);
  const arr = axis === 'x' ? xLines.slice() : yLines.slice();
  const max = axis === 'x' ? imageSize[0] : imageSize[1];
  const lower = lineIndex > 0 ? arr[lineIndex - 1] : 0;
  const upper = lineIndex < 5 ? arr[lineIndex + 1] : max;
  arr[lineIndex] = Math.max(lower, Math.min(upper, newValue));
  const nx = axis === 'x' ? arr : xLines;
  const ny = axis === 'y' ? arr : yLines;
  return prev.map((row, y) => row.map((c, x) => ({
    rect: [nx[x], ny[y], nx[x + 1], ny[y + 1]] as Vec4,
    mirrorX: c.mirrorX,
    mirrorY: c.mirrorY,
  })));
}
