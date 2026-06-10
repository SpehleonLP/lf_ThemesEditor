import { expect, test } from 'vitest';
import { buildBandMesh } from '../src/preview/mesh';
import { computeBands } from '../src/bands';

test('mesh has 36 vertices, 150 indices, tese-style attributes', () => {
  const bands = computeBands([10, 10, 10, 10], [1, 1, -1, -1], [100, 100]);
  const mesh = buildBandMesh(bands);
  expect(mesh.positions).toHaveLength(36 * 2);
  expect(mesh.cells).toHaveLength(36 * 2);
  expect(mesh.adjust).toHaveLength(36 * 2);
  expect(mesh.indices).toHaveLength(25 * 6);
  // vertex (1,0): pos = (positionsX[1], 0), cell = (1, 0), adjust = (left, top) since 1<=2 and 0<=2
  const v = 0 * 6 + 1;
  expect(mesh.positions[v * 2]).toBeCloseTo(bands.positionsX[1], 6);
  expect(mesh.cells[v * 2]).toBe(1);
  expect(mesh.adjust[v * 2]).toBeCloseTo(bands.adjustment[0], 6);
  // vertex (4,5): adjust = (right, bottom) since 4>2 and 5>2
  const w = 5 * 6 + 4;
  expect(mesh.adjust[w * 2]).toBeCloseTo(bands.adjustment[2], 6);
  expect(mesh.adjust[w * 2 + 1]).toBeCloseTo(bands.adjustment[3], 6);
});
