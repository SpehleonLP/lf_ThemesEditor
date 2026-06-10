import type { Vec2, Vec4 } from './types';

export interface BandLayout {
  positionsX: number[]; // 6 entries, 0..1 panel space
  positionsY: number[];
  adjustment: Vec4;     // [left, top, right, bottom] — tese adjustmentFactors
}

// Port of gui_panel.tese Fix() (:75-91). c = (cLow, cHigh) for this axis.
function fix(p: number[], cLow: number, cHigh: number): void {
  for (let i = 1; i < 4; i += 2) {
    if (p[i] > p[i + 1]) p[i] = p[i + 1] = (p[i] + p[i + 1]) / 2;
  }
  if (p[1] > p[4]) {
    const sum = p[1] + p[2] + p[3] + p[4];
    p[1] = p[2] = p[3] = p[4] = sum / 4;
  } else if (cLow > cHigh) {
    p[2] = p[3] = p[4];
  }
}

// Port of gui_panel.tese main() :99-148 (border_flags mirror handling intentionally omitted).
export function computeBands(tessellation: Vec4, centerTile: Vec4, sizePt: Vec2): BandLayout {
  if (!(sizePt[0] > 0) || !(sizePt[1] > 0))
    throw new Error(`computeBands: panel size must be positive, got [${sizePt[0]}, ${sizePt[1]}]`);
  const m = tessellation; // [left, top, right, bottom]
  let left = m[0], top = m[1], right = m[2], bottom = m[3];
  if (m[2] > 1.0) { left /= sizePt[0]; right /= sizePt[0]; }
  if (m[1] > 1.0) { top /= sizePt[1]; bottom /= sizePt[1]; }

  const c: Vec4 = [
    centerTile[0] / sizePt[0], centerTile[1] / sizePt[1],
    centerTile[2] / sizePt[0], centerTile[3] / sizePt[1],
  ];

  const px = [0, left, 0.5 + c[0], 0.5 + c[2], 1 - right, 1];
  const py = [0, top, 0.5 + c[1], 0.5 + c[3], 1 - bottom, 1];
  fix(px, c[0], c[2]);
  fix(py, c[1], c[3]);

  const adjustment: Vec4 = [
    px[1] / Math.max(left, 1e-6),
    py[1] / Math.max(top, 1e-6),
    (1 - px[4]) / Math.max(right, 1e-6),
    (1 - py[4]) / Math.max(bottom, 1e-6),
  ];
  return { positionsX: px, positionsY: py, adjustment };
}
