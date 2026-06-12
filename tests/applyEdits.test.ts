import { expect, test } from 'vitest';
import { applyLayerToEntry, applyPackResult } from '../src/document';
import type { PackApply } from '../src/document';
import type { CellGrid, EditorCell } from '../src/types';
import { parseCellsJson, toEditorGrid } from '../src/cells';

const grid = (): CellGrid =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, (): EditorCell => ({ rect: [0, 0, 1, 1], mirrorX: false, mirrorY: false })));

const packApply = (over: Partial<PackApply>): PackApply => ({
  overlayImage: null, maskImage: null, overlayCells: null, maskCells: null,
  linked: false, source: { linked: false }, sourceCells: grid(), pack: { gutter: 8, align: 4 },
  ...over,
});

test('applyLayerToEntry rewrites Cells as 25 pixel rects and preserves other fields', () => {
  const entry: any = { Overlay: { Image: 'a.png', Cells: [10, 20, 30, 40], EdgeFill: ['Tile', 'Stretch'] }, Tessellation: [8, 8, 8, 8] };
  const grid = toEditorGrid((parseCellsJson(Array.from({ length: 25 }, (_, i) => [i, 0, i + 1, 1]) as any) as any).grid);
  applyLayerToEntry(entry, 'Overlay', { cells: grid, edgeFill: ['TILE', 'STRETCH'], centerFill: ['STRETCH', 'STRETCH'] });
  expect(entry.Overlay.Cells).toHaveLength(25);
  expect(entry.Overlay.Cells[1]).toEqual([1, 0, 2, 1]);
  expect(entry.Overlay.Image).toBe('a.png');
  expect(entry.Tessellation).toEqual([8, 8, 8, 8]);
  expect(entry.Overlay.EdgeFill).toEqual(['TILE', 'STRETCH']);
});

test('a #COPY mask layer stays a string', () => {
  const entry: any = { Mask: { Image: 'm.png', Cells: '#COPY' }, Overlay: { Image: 'a.png', Cells: [1, 1, 2, 2] } };
  applyLayerToEntry(entry, 'Mask', { cells: null, edgeFill: ['STRETCH', 'STRETCH'], centerFill: ['STRETCH', 'STRETCH'] });
  expect(entry.Mask.Cells).toBe('#COPY');
});

test('applyPackResult replaces Mask:"#OVERLAY" with an object instead of throwing', () => {
  const entry: any = { Mask: '#OVERLAY' };
  applyPackResult(entry, packApply({ maskImage: 'Images/packed/m.png', maskCells: grid() }));
  expect(typeof entry.Mask).toBe('object');
  expect(entry.Mask.Image).toBe('Images/packed/m.png');
});

test('applyPackResult replaces a string Overlay with an object instead of throwing', () => {
  const entry: any = { Overlay: 'whatever' };
  applyPackResult(entry, packApply({ overlayImage: 'Images/packed/o.png', overlayCells: grid() }));
  expect(typeof entry.Overlay).toBe('object');
  expect(entry.Overlay.Image).toBe('Images/packed/o.png');
});

test('applyPackResult preserves sibling fields when Overlay is already an object', () => {
  const entry: any = { Overlay: { EdgeFill: 'stretch' } };
  applyPackResult(entry, packApply({ overlayImage: 'Images/packed/o.png', overlayCells: grid() }));
  expect(entry.Overlay.Image).toBe('Images/packed/o.png');
  expect(entry.Overlay.EdgeFill).toBe('stretch');
});
