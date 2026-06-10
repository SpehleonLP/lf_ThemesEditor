import type { BandLayout } from '../bands';

export interface BandMesh {
  positions: Float32Array; // 36 × vec2, panel space 0..1
  cells: Float32Array;     // 36 × vec2, grid indices (interpolates like p.cell)
  adjust: Float32Array;    // 36 × vec2, adjustmentFactor
  indices: Uint16Array;    // 25 quads
}

export function buildBandMesh(b: BandLayout): BandMesh {
  const positions = new Float32Array(36 * 2);
  const cells = new Float32Array(36 * 2);
  const adjust = new Float32Array(36 * 2);
  for (let j = 0; j < 6; ++j)
    for (let i = 0; i < 6; ++i) {
      const v = j * 6 + i;
      positions[v * 2] = b.positionsX[i];
      positions[v * 2 + 1] = b.positionsY[j];
      cells[v * 2] = i;
      cells[v * 2 + 1] = j;
      adjust[v * 2] = i <= 2 ? b.adjustment[0] : b.adjustment[2];
      adjust[v * 2 + 1] = j <= 2 ? b.adjustment[1] : b.adjustment[3];
    }
  const indices = new Uint16Array(25 * 6);
  let k = 0;
  for (let j = 0; j < 5; ++j)
    for (let i = 0; i < 5; ++i) {
      const a = j * 6 + i;
      indices.set([a, a + 1, a + 6, a + 1, a + 7, a + 6], k);
      k += 6;
    }
  return { positions, cells, adjust, indices };
}
