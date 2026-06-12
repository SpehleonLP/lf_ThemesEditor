import { describe, it, expect } from 'vitest';
import { detectGridMode, extractLines3x3, extractLines5x5, rewrite3x3, rewrite5x5Line } from '../src/gridModes';
import { ninePatchGrid, toEditorGrid, parseCellsJson, resolveInfinity } from '../src/cells';
import type { CellGrid } from '../src/types';

const IMG: [number, number] = [120, 90];

function grid3x3(): CellGrid {
  return ninePatchGrid([40, 80], [30, 60], IMG);
}
function grid5x5(xLines: number[], yLines: number[]): CellGrid {
  const parsed = parseCellsJson([xLines, yLines]);
  if (parsed.kind !== 'grid') throw new Error('expected grid');
  return toEditorGrid(resolveInfinity(parsed.grid, IMG));
}

describe('detectGridMode', () => {
  it('detects a 4-cut 3x3 grid', () => {
    expect(detectGridMode(grid3x3())).toBe('3x3');
  });
  it('mirror flags do not change 3x3 detection', () => {
    const g = grid3x3();
    g[0][0].mirrorX = true; g[0][0].mirrorY = true;
    expect(detectGridMode(g)).toBe('3x3');
  });
  it('detects a 6-line 5x5 partition that is NOT a 3x3', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    expect(detectGridMode(g)).toBe('5x5lines');
  });
  it('an aliased corner rect (rect != implied grid cell) forces free mode', () => {
    const g = grid3x3();
    g[0][0].rect = [5, 5, 35, 25];
    expect(detectGridMode(g)).toBe('free');
  });
});

describe('extractLines3x3', () => {
  it('recovers the two interior cut lines per axis', () => {
    const { xCuts, yCuts } = extractLines3x3(grid3x3());
    expect(xCuts).toEqual([40, 80]);
    expect(yCuts).toEqual([30, 60]);
  });
});

describe('rewrite3x3', () => {
  it('dragging a cut line produces exactly the engine 4-cut rects', () => {
    const before = grid3x3();
    const after = rewrite3x3(before, [50, 80], [30, 60], IMG);
    const expected = ninePatchGrid([50, 80], [30, 60], IMG);
    expect(after.map((r) => r.map((c) => c.rect))).toEqual(expected.map((r) => r.map((c) => c.rect)));
  });
  it('preserves mirror flags through a rewrite', () => {
    const before = grid3x3();
    before[0][0].mirrorX = true;
    const after = rewrite3x3(before, [50, 80], [30, 60], IMG);
    expect(after[0][0].mirrorX).toBe(true);
  });
});

describe('extractLines5x5 + rewrite5x5Line', () => {
  it('recovers the 6 lines per axis', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    const { xLines, yLines } = extractLines5x5(g);
    expect(xLines).toEqual([0, 10, 25, 60, 95, 120]);
    expect(yLines).toEqual([0, 8, 20, 50, 75, 90]);
  });
  it('dragging a 5x5 line clamps between its neighbors and rewrites rects', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    const moved = rewrite5x5Line(g, 'x', 2, 200, IMG);
    const { xLines } = extractLines5x5(moved);
    expect(xLines[2]).toBe(60);
  });
});
