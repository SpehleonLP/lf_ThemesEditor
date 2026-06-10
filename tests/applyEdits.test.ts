import { expect, test } from 'vitest';
import { applyLayerToEntry } from '../src/document';
import { parseCellsJson, toEditorGrid } from '../src/cells';

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
