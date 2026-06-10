export type Vec4 = [number, number, number, number];
export type Vec2 = [number, number];

export type FillMode = 'STRETCH' | 'TILE' | 'SNAP' | 'FLEXIBLE' | 'CENTER';
// PatchFillType values the engine packs (gui_themepackage.h / gui_packagebuilder.cpp)
export const FILL_VALUE: Record<FillMode, number> =
  { STRETCH: 1, TILE: 2, SNAP: 3, FLEXIBLE: 4, CENTER: 5 };

export interface EditorCell {
  rect: Vec4;        // |x0,y0,x1,y1| — sign stripped; order preserved (reversed order = rotated cell)
  mirrorX: boolean;
  mirrorY: boolean;
}
export type CellGrid = EditorCell[][]; // [y][x], 5×5

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, row-major from top-left, NOT premultiplied
}
