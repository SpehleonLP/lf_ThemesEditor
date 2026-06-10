import { expect, test } from 'vitest';
import { applyPackResult } from '../src/document';
import type { CellGrid, EditorCell } from '../src/types';

const grid = (c: EditorCell): CellGrid => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => structuredClone(c)));

test('applyPackResult writes images, 25-rect cells, #COPY for linked mask, and Editor metadata', () => {
  const entry: any = { Mask: { Image: 'old_m.png', Cells: '#COPY' }, Overlay: { Image: 'old.png', Cells: [1, 1, 2, 2] } };
  const packed = grid({ rect: [4, 4, 20, 20], mirrorX: false, mirrorY: false });
  applyPackResult(entry, {
    overlayImage: 'Images/packed/Window_0_overlay.png',
    maskImage: 'Images/packed/Window_0_mask.png',
    overlayCells: packed,
    maskCells: packed,        // identical → emit #COPY
    linked: true,
    source: { overlay: 'SourceArt/win.png', mask: 'SourceArt/win_m.png', linked: true },
    sourceCells: packed,
    pack: { gutter: 8, align: 4 },
  });
  expect(entry.Overlay.Image).toBe('Images/packed/Window_0_overlay.png');
  expect(entry.Overlay.Cells).toHaveLength(25);
  expect(entry.Mask.Image).toBe('Images/packed/Window_0_mask.png');
  expect(entry.Mask.Cells).toBe('#COPY');
  expect(entry.Editor.version).toBe(1);
  expect(entry.Editor.sourceCells).toHaveLength(25);
});
