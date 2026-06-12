import { describe, it, expect } from 'vitest';
import { editorSourceCells, unflattenCells } from '../src/editorReadback';
import { ninePatchGrid } from '../src/cells';

describe('unflattenCells', () => {
  it('rebuilds a 5x5 grid from 25 flat cells, row-major', () => {
    const grid = ninePatchGrid([40, 80], [30, 60], [120, 90]);
    const flat = grid.flat();
    const back = unflattenCells(flat);
    expect(back).toHaveLength(5);
    expect(back[0]).toHaveLength(5);
    expect(back[2][3].rect).toEqual(grid[2][3].rect);
  });
  it('throws on the wrong count', () => {
    expect(() => unflattenCells([] as any)).toThrow();
  });
});

describe('editorSourceCells', () => {
  it('returns source grid + source descriptor when Editor metadata is present and valid', () => {
    const grid = ninePatchGrid([10, 20], [10, 20], [40, 40]);
    const entry = { Editor: { version: 1, source: { overlay: 'src/o.png', linked: true }, sourceCells: grid.flat(), pack: { gutter: 2, align: 4 } } };
    const res = editorSourceCells(entry);
    expect(res).not.toBeNull();
    expect(res!.sourceCells[1][1].rect).toEqual(grid[1][1].rect);
    expect(res!.source.overlay).toBe('src/o.png');
  });
  it('returns null when there is no Editor metadata', () => {
    expect(editorSourceCells({ Overlay: { Cells: '#COPY' } })).toBeNull();
  });
  it('returns null when sourceCells is malformed (falls back to packed)', () => {
    expect(editorSourceCells({ Editor: { version: 1, sourceCells: [1, 2, 3] } })).toBeNull();
  });
});
