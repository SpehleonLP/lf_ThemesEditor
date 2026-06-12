import { describe, it, expect } from 'vitest';
import { cellGlyphs, collapsedBands } from '../src/ui/cellMap';
import { computeBands } from '../src/bands';
import type { EditorCell } from '../src/types';

const cell = (rect: [number, number, number, number], mirrorX = false, mirrorY = false): EditorCell =>
  ({ rect, mirrorX, mirrorY });

describe('cellGlyphs', () => {
  it('reports no glyphs for a normal cell', () => {
    const g = cellGlyphs(cell([0, 0, 10, 10]));
    expect(g).toEqual({ mirrorX: false, mirrorY: false, rotated: false, degenerate: false });
  });

  it('passes through mirror flags', () => {
    const g = cellGlyphs(cell([0, 0, 10, 10], true, false));
    expect(g.mirrorX).toBe(true);
    expect(g.mirrorY).toBe(false);
    expect(g.rotated).toBe(false);
    expect(g.degenerate).toBe(false);

    const g2 = cellGlyphs(cell([0, 0, 10, 10], false, true));
    expect(g2.mirrorY).toBe(true);
  });

  it('detects a rotated cell (one axis reversed)', () => {
    // x reversed (x1 < x0), y normal -> (x1-x0)*(y1-y0) < 0
    expect(cellGlyphs(cell([10, 0, 0, 10])).rotated).toBe(true);
    // y reversed only
    expect(cellGlyphs(cell([0, 10, 10, 0])).rotated).toBe(true);
    // both reversed -> product positive -> NOT rotated
    expect(cellGlyphs(cell([10, 10, 0, 0])).rotated).toBe(false);
  });

  it('detects a degenerate (zero-area) cell', () => {
    expect(cellGlyphs(cell([5, 0, 5, 10])).degenerate).toBe(true); // zero width
    expect(cellGlyphs(cell([0, 7, 10, 7])).degenerate).toBe(true); // zero height
    expect(cellGlyphs(cell([0, 0, 10, 10])).degenerate).toBe(false);
  });
});

describe('collapsedBands', () => {
  it('collapses the center band for a default CenterTile [1,1,-1,-1]', () => {
    // Default CenterTile [1,1,-1,-1] -> center band collapses (positions[2] === positions[3]).
    const bands = computeBands([0, 0, 0, 0], [1, 1, -1, -1], [240, 160]);
    const { cols, rows } = collapsedBands(bands);
    expect(cols).toHaveLength(5);
    expect(rows).toHaveLength(5);
    // center column/row (index 2) is the collapsed one
    expect(cols[2]).toBe(true);
    expect(rows[2]).toBe(true);
  });

  it('does not collapse the center band when CenterTile gives it width', () => {
    const bands = computeBands([0.2, 0.2, 0.2, 0.2], [-40, -40, 40, 40], [240, 160]);
    const { cols, rows } = collapsedBands(bands);
    expect(cols[2]).toBe(false);
    expect(rows[2]).toBe(false);
  });

  it('marks a column collapsed when two adjacent X positions are equal', () => {
    const bands = {
      positionsX: [0, 0, 0.5, 0.5, 1, 1],
      positionsY: [0, 0.2, 0.4, 0.6, 0.8, 1],
      adjustment: [0, 0, 0, 0] as [number, number, number, number],
    };
    const { cols, rows } = collapsedBands(bands);
    expect(cols).toEqual([true, false, true, false, true]);
    expect(rows).toEqual([false, false, false, false, false]);
  });
});
