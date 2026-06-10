import { expect, test } from 'vitest';
import { ninePatchGrid } from '../src/cells';

test('ninePatchGrid equals engine 4-cut form with Infinity resolved to image size', () => {
  // cuts: x at 20/40, y at 10/30, image 64×48
  const g = ninePatchGrid([20, 40], [10, 30], [64, 48]);
  expect(g[0][0].rect).toEqual([0, 0, 20, 10]);
  expect(g[2][2].rect).toEqual([40, 30, 64, 48]);
  expect(g[4][4].rect).toEqual([40, 30, 64, 48]);
  expect(g[1][3].rect).toEqual([40, 10, 64, 30]);
  for (const row of g) for (const c of row) { expect(c.mirrorX).toBe(false); expect(c.mirrorY).toBe(false); }
});
