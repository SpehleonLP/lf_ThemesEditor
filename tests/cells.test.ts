import { expect, test } from 'vitest';
import {
  parseCellsJson, toEditorGrid, fromEditorGrid, serializeCells, resolveInfinity,
} from '../src/cells';
import type { Vec4 } from '../src/types';

test('string form means copy', () => {
  expect(parseCellsJson('#COPY')).toEqual({ kind: 'copy' });
});

test('4-cut form [y0,x0,y1,x1]: x cuts 0,x0,x1,INF; y cuts 0,y0,y1,INF', () => {
  const r = parseCellsJson([10, 20, 30, 40]); // y0=10 x0=20 y1=30 x1=40
  if (r.kind !== 'grid') throw new Error('expected grid');
  expect(r.grid[0][0]).toEqual([0, 0, 20, 10]);
  expect(r.grid[0][1]).toEqual([20, 0, 40, 10]);
  expect(r.grid[0][2]).toEqual([40, 0, Infinity, 10]);
  expect(r.grid[0][3]).toEqual([40, 0, Infinity, 10]); // min(x,2) duplicates the last column
  expect(r.grid[1][1]).toEqual([20, 10, 40, 30]);
  expect(r.grid[4][4]).toEqual([40, 30, Infinity, Infinity]);
});

test('2-array form pads to 6 lines like the C++ resize trick', () => {
  // xLines [0,4,8,12] (len 4): s=max(4-2,0)=2 → resize to 6 with back()=12 → [0,4,8,12,12,12], then [4]=orig[2]=8
  const r = parseCellsJson([[0, 4, 8, 12], [0, 5, 10, 15]]);
  if (r.kind !== 'grid') throw new Error('expected grid');
  // x lines: [0,4,8,12,8,12]; y lines: [0,5,10,15,10,15]
  expect(r.grid[0][0]).toEqual([0, 0, 4, 5]);
  expect(r.grid[0][3]).toEqual([12, 0, 8, 5]);  // reversed x order — preserved, engine treats as rotation
  expect(r.grid[0][4]).toEqual([8, 0, 12, 5]);
  expect(r.grid[4][4]).toEqual([8, 10, 12, 15]);
});

test('9-rect form maps rows/cols via min(i,2) — bands 3,4 reuse rect index 2', () => {
  const rects: Vec4[] = Array.from({ length: 9 }, (_, i) => [i, i, i + 100, i + 100] as Vec4);
  const r = parseCellsJson(rects);
  if (r.kind !== 'grid') throw new Error('expected grid');
  expect(r.grid[0][0]).toEqual(rects[0]);
  expect(r.grid[1][1]).toEqual(rects[4]);
  expect(r.grid[2][2]).toEqual(rects[8]);
  expect(r.grid[3][3]).toEqual(rects[8]);
  expect(r.grid[4][1]).toEqual(rects[7]);
});

test('25-rect form is direct row-major', () => {
  const rects: Vec4[] = Array.from({ length: 25 }, (_, i) => [i, 0, i + 1, 1] as Vec4);
  const r = parseCellsJson(rects);
  if (r.kind !== 'grid') throw new Error('expected grid');
  expect(r.grid[3][2]).toEqual(rects[17]);
});

test('mirror signs strip to flags and re-apply on both coords', () => {
  const parsed = parseCellsJson(Array.from({ length: 25 }, () => [-10, 5, -20, 15] as Vec4));
  if (parsed.kind !== 'grid') throw new Error('expected grid');
  const grid = parsed.grid;
  const ed = toEditorGrid(grid);
  expect(ed[0][0]).toEqual({ rect: [10, 5, 20, 15], mirrorX: true, mirrorY: false });
  const back = fromEditorGrid(ed);
  expect(back[0][0]).toEqual([-10, 5, -20, 15]); // sign normalized onto BOTH x coords (engine ORs them)
});

test('serializeCells emits 25 pixel rects and rejects Infinity', () => {
  const parsed = parseCellsJson([10, 20, 30, 40]);
  if (parsed.kind !== 'grid') throw new Error('expected grid');
  const grid = parsed.grid;
  expect(() => serializeCells(toEditorGrid(grid))).toThrow(/non-finite/);
  const resolved = resolveInfinity(grid, [512, 256]); // Infinity → image dims
  const json = serializeCells(toEditorGrid(resolved));
  expect(json).toHaveLength(25);
  expect(json[24]).toEqual([40, 30, 512, 256]);
});

test('bad shapes throw', () => {
  expect(() => parseCellsJson([1, 2, 3])).toThrow();
  expect(() => parseCellsJson([[], [1]])).toThrow();
  expect(() => parseCellsJson([[1, 2, 3, 4, 5, 6, 7], [1]])).toThrow();
  expect(() => parseCellsJson([[], [], [], []])).toThrow(/all 4 values must be numbers/);
});
