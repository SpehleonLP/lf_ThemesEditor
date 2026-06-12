import type { CellGrid, EditorCell, Vec4 } from './types';
import { getEditorMeta } from './document';

export function unflattenCells(flat: readonly EditorCell[]): CellGrid {
  if (!Array.isArray(flat) || flat.length !== 25) throw new Error(`unflattenCells: expected 25 cells, got ${(flat as any)?.length}`);
  const grid: CellGrid = [];
  for (let y = 0; y < 5; ++y) {
    const row: EditorCell[] = [];
    for (let x = 0; x < 5; ++x) {
      const c = flat[y * 5 + x];
      row.push({ rect: [...c.rect] as Vec4, mirrorX: !!c.mirrorX, mirrorY: !!c.mirrorY });
    }
    grid.push(row);
  }
  return grid;
}

export interface EditorSource { source: { overlay?: string; mask?: string; linked?: boolean }; pack: any; sourceCells: CellGrid }

// Read packed-border source state back from Editor metadata; null if absent/invalid.
export function editorSourceCells(entry: any): EditorSource | null {
  const meta = getEditorMeta(entry);
  if (!meta || !Array.isArray(meta.sourceCells)) return null;
  try {
    const valid = meta.sourceCells.every((c: any) => Array.isArray(c?.rect) && c.rect.length === 4);
    if (!valid) return null;
    return { source: meta.source, pack: meta.pack, sourceCells: unflattenCells(meta.sourceCells) };
  } catch {
    return null;
  }
}
