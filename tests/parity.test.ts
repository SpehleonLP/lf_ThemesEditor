import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { computeBands } from '../src/bands';
import { parseCellsJson, toEditorGrid, resolveInfinity, fromEditorGrid, normalizeCells, quantizeUnorm16 } from '../src/cells';

test('shipping-file geometry snapshot', async () => {
  const doc = JSON.parse(await readFile('tests/fixtures/borders.json', 'utf-8'));
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries<any>(doc)) {
    const cellsJson = entry?.Overlay?.Cells ?? entry?.Mask?.Cells;
    if (cellsJson == null) continue;
    const parsed = parseCellsJson(cellsJson);
    out[name] = {
      bands: computeBands(entry.Tessellation ?? [0, 0, 0, 0], entry.CenterTile ?? [1, 1, -1, -1], [240, 160]),
      cells: parsed.kind === 'grid'
        ? normalizeCells(fromEditorGrid(toEditorGrid(resolveInfinity(parsed.grid, [512, 512]))), [512, 512])
            .flat().map((r) => r.map(quantizeUnorm16))
        : 'copy',
    };
  }
  expect(out).toMatchSnapshot();
});
