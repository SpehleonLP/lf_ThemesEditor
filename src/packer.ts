import { findCanvas } from './legality';
import type { CellGrid, EditorCell, Rgba, Vec4 } from './types';

export interface PackLayerInput {
  name: string;
  source: Rgba;
  cells: CellGrid; // source-image pixel rects
}

export interface PackOutput {
  sheets: (Rgba & { name: string })[];
  cells: Record<string, CellGrid>; // rewritten into sheet pixels
}

// orientation-normalized integer key: min-corner rect
function pieceKey(r: Vec4): string {
  const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]);
  const y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
  return `${x0},${y0},${x1},${y1}`;
}

function blit(dst: Rgba, src: Rgba, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; ++y) {
    const from = ((sy + y) * src.width + sx) * 4;
    const to = ((dy + y) * dst.width + dx) * 4;
    dst.data.set(src.data.subarray(from, from + w * 4), to);
  }
}

export function packLayer(
  layers: PackLayerInput[],
  opts: { gutter: number; align: number; linked?: boolean },
): PackOutput {
  // Linked layers share one layout keyed off the FIRST layer's cells; unlinked layers pack independently.
  const groups = opts.linked ? [layers] : layers.map((l) => [l]);
  const out: PackOutput = { sheets: [], cells: {} };

  for (const group of groups) {
    const lead = group[0];
    // 1. dedup unique pieces
    const keyToId = new Map<string, number>();
    const pieces: { id: number; w: number; h: number; sx: number; sy: number }[] = [];
    for (const row of lead.cells)
      for (const c of row) {
        const key = pieceKey(c.rect);
        if (keyToId.has(key)) continue;
        const x0 = Math.min(c.rect[0], c.rect[2]), x1 = Math.max(c.rect[0], c.rect[2]);
        const y0 = Math.min(c.rect[1], c.rect[3]), y1 = Math.max(c.rect[1], c.rect[3]);
        const w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0) continue; // degenerate cells (collapsed bands) carry no pixels
        keyToId.set(key, pieces.length);
        pieces.push({ id: pieces.length, w, h, sx: x0, sy: y0 });
      }

    // 2. smallest legal canvas
    const canvas = findCanvas(pieces, opts);
    if (!canvas) throw new Error(`pack: pieces do not fit any legal canvas <= 4096 (${lead.name})`);

    // 3. blit each layer of the group with the SAME layout; 4. rewrite cells
    for (const layer of group) {
      const sheet: Rgba & { name: string } = {
        name: layer.name, width: canvas.w, height: canvas.h,
        data: new Uint8Array(canvas.w * canvas.h * 4),
      };
      for (const pl of canvas.placed) {
        const p = pieces[pl.id];
        blit(sheet, layer.source, p.sx, p.sy, p.w, p.h, pl.x, pl.y);
      }
      out.sheets.push(sheet);

      const byId = new Map(canvas.placed.map((pl) => [pl.id, pl]));
      out.cells[layer.name] = lead.cells.map((row) => row.map((c): EditorCell => {
        const key = pieceKey(c.rect);
        if (!keyToId.has(key)) return structuredClone(c); // degenerate — pass through
        const pl = byId.get(keyToId.get(key)!)!;
        const xRev = c.rect[0] > c.rect[2], yRev = c.rect[1] > c.rect[3];
        const rect: Vec4 = [
          xRev ? pl.x + pl.w : pl.x, yRev ? pl.y + pl.h : pl.y,
          xRev ? pl.x : pl.x + pl.w, yRev ? pl.y : pl.y + pl.h,
        ];
        return { rect, mirrorX: c.mirrorX, mirrorY: c.mirrorY };
      }));
    }
  }
  return out;
}
