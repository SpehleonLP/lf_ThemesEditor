// Expansion-aware preview geometry. The engine draws the quad grown per-side by Expansion
// (gui_panelbuilder.comp:228-238) and runs band math on the expanded size (gui_panel.tese:100).
// JSON works in y-down [l,t,r,b] throughout; the caller (previewPanel) draws top above / bottom below.
import type { Vec2, Vec4 } from '../types';

// Panel size grown by Expansion [l,t,r,b] -> the drawn-quad size in pt.
export function expandedSize(panelSize: Vec2, expansion: Vec4): Vec2 {
  return [panelSize[0] + expansion[0] + expansion[2], panelSize[1] + expansion[1] + expansion[3]];
}

export interface RectFrac { x0: number; y0: number; x1: number; y1: number }

// The layout rect expressed as 0..1 fractions of the drawn (expanded) quad.
export function layoutRectFraction(panelSize: Vec2, expansion: Vec4): RectFrac {
  const [w, h] = expandedSize(panelSize, expansion);
  return {
    x0: expansion[0] / w,
    y0: expansion[1] / h,
    x1: 1 - expansion[2] / w,
    y1: 1 - expansion[3] / h,
  };
}

// A tessellation point value as a fraction of its axis size, and back. Used when a drag writes
// pt deltas but the axis is currently authored in fraction units (deciding component <= 1).
export function tessPtToFraction(valuePt: number, axisSizePt: number): number {
  return axisSizePt > 0 ? valuePt / axisSizePt : 0;
}
export function tessFractionToPt(fraction: number, axisSizePt: number): number {
  return fraction * axisSizePt;
}
