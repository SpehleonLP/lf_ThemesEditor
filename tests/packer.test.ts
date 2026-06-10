import { expect, test } from 'vitest';
import { packLayer } from '../src/packer';
import { normalizeCells, fromEditorGrid, quantizeUnorm16 } from '../src/cells';
import type { CellGrid, EditorCell, Rgba, Vec4 } from '../src/types';

function solidImage(w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; ++y)
    for (let x = 0; x < w; ++x)
      data.set([x & 255, y & 255, (x * 7 + y * 13) & 255, 200], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const cell = (rect: Vec4, mirrorX = false, mirrorY = false): EditorCell => ({ rect, mirrorX, mirrorY });
const gridOf = (c: EditorCell): CellGrid => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => structuredClone(c)));

test('pixels are copied exactly (no premultiply, no resample)', () => {
  const src = solidImage(64, 64);
  const grid = gridOf(cell([8, 8, 24, 24]));
  const r = packLayer([{ name: 'x', source: src, cells: grid }], { gutter: 8, align: 4 });
  const sheet = r.sheets[0];
  const out = r.cells['x'][0][0].rect;
  for (let dy = 0; dy < 16; ++dy)
    for (let dx = 0; dx < 16; ++dx) {
      const a = ((8 + dy) * 64 + (8 + dx)) * 4;
      const b = ((out[1] + dy) * sheet.width + (out[0] + dx)) * 4;
      expect([...sheet.data.slice(b, b + 4)]).toEqual([...src.data.slice(a, a + 4)]);
    }
});

test('identical/mirrored cells dedup to one piece', () => {
  const src = solidImage(64, 64);
  const grid = gridOf(cell([8, 8, 24, 24]));
  grid[0][1] = cell([8, 8, 24, 24], true);       // mirrored twin
  grid[0][2] = cell([24, 8, 8, 24]);             // reversed-order (rotated) twin
  const r = packLayer([{ name: 'x', source: src, cells: grid }], { gutter: 8, align: 4 });
  // one unique piece → smallest legal canvas is tiny
  expect(r.sheets[0].width).toBeLessThanOrEqual(64);
  const a = r.cells['x'][0][0], b = r.cells['x'][0][1], c = r.cells['x'][0][2];
  expect(b.mirrorX).toBe(true);
  expect([Math.min(a.rect[0], a.rect[2]), Math.min(a.rect[1], a.rect[3])])
    .toEqual([Math.min(b.rect[0], b.rect[2]), Math.min(b.rect[1], b.rect[3])]);
  expect(c.rect[0]).toBeGreaterThan(c.rect[2]); // order preserved
});

test('linked mask+overlay share layout; mask emits #COPY-compatible cells', () => {
  const src = solidImage(64, 64);
  const grid = gridOf(cell([0, 0, 32, 32]));
  const r = packLayer([
    { name: 'overlay', source: src, cells: grid },
    { name: 'mask', source: solidImage(64, 64), cells: structuredClone(grid) },
  ], { gutter: 8, align: 4, linked: true });
  expect(r.sheets).toHaveLength(2);
  expect(r.sheets[0].width).toBe(r.sheets[1].width);
  expect(r.cells['mask']).toEqual(r.cells['overlay']); // identical → caller writes "#COPY"
});

test('unorm16 precision: rewritten cells survive normalize+quantize within half a pixel', () => {
  const src = solidImage(512, 512);
  const grid = gridOf(cell([3, 5, 130, 250]));
  const r = packLayer([{ name: 'x', source: src, cells: grid }], { gutter: 8, align: 4 });
  const sheet = r.sheets[0];
  const norm = normalizeCells(fromEditorGrid(r.cells['x']), [sheet.width, sheet.height]);
  for (const row of norm)
    for (const rect of row)
      rect.forEach((v, i) => {
        const err = Math.abs(quantizeUnorm16(v) - Math.abs(v)) * (i % 2 === 0 ? sheet.width : sheet.height);
        expect(err).toBeLessThan(0.5);
      });
});
