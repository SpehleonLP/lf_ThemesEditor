import { state, notify } from './state';
import { computeBands, type BandLayout } from '../bands';
import { previewDrawnSizePt } from './previewPanel';
import type { EditorCell, Vec4 } from '../types';

// ── Pure logic (unit-tested in cellMap.test.ts) ──────────────────────────────────

export interface CellGlyphs {
  mirrorX: boolean;
  mirrorY: boolean;
  rotated: boolean;     // stored coord order reversed on exactly one axis
  degenerate: boolean;  // zero-area source rect
}

// rotated: exactly one axis reversed -> the signed-area product is negative.
//   A BOTH-axes-reversed rect has a POSITIVE product and is deliberately NOT flagged
//   rotated: it's a 180° flip, not a transpose. Don't "fix" this to abs/!== checks.
// degenerate: zero width or zero height source rect.
export function cellGlyphs(cell: EditorCell): CellGlyphs {
  const r = cell.rect;
  return {
    mirrorX: cell.mirrorX,
    mirrorY: cell.mirrorY,
    rotated: (r[2] - r[0]) * (r[3] - r[1]) < 0,
    degenerate: r[2] === r[0] || r[3] === r[1],
  };
}

// A band is collapsed when its two bounding positions coincide. 6 positions -> 5 bands.
// cols[i]/rows[i] true means band i has zero extent; cell [y][x] is dimmed when cols[x]||rows[y].
export function collapsedBands(bands: BandLayout): { cols: boolean[]; rows: boolean[] } {
  const collapse = (p: number[]): boolean[] => {
    const out: boolean[] = [];
    for (let i = 0; i < 5; ++i) out.push(p[i] === p[i + 1]);
    return out;
  };
  return { cols: collapse(bands.positionsX), rows: collapse(bands.positionsY) };
}

// ── 5×5 grid widget ──────────────────────────────────────────────────────────────

let tiles: HTMLButtonElement[][] | null = null; // [y][x], built once

export function mountCellMap(host: HTMLElement): void {
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'cm-grid';
  tiles = [];
  for (let y = 0; y < 5; ++y) {
    const row: HTMLButtonElement[] = [];
    for (let x = 0; x < 5; ++x) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'cm-tile';
      tile.innerHTML = '<span class="cm-glyphs"></span>';
      tile.onclick = () => {
        if (!state.layers?.[state.activeLayer]?.cells) return; // disabled tile: no cells
        state.selectedCell = [y, x];
        notify(); // selection, not an edit — must NOT set state.dirty
      };
      grid.appendChild(tile);
      row.push(tile);
    }
    tiles.push(row);
  }
  host.appendChild(grid);
  updateCellMap();
}

// Re-derive glyphs, selection and dimming by toggling classes on the existing tiles.
// Never rebuilds the DOM — mount() built the 25 tiles once.
export function updateCellMap(): void {
  if (!tiles) return;
  const cells = state.layers?.[state.activeLayer]?.cells ?? null;
  const sel = state.selectedCell;

  // Collapsed-band dimming from the previewed expanded size + selected entry's Tess/CenterTile.
  let cols: boolean[] | null = null, rows: boolean[] | null = null;
  const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
  if (cells && entry) {
    const { w, h } = previewDrawnSizePt();
    const tess = (entry.Tessellation ?? [0, 0, 0, 0]) as Vec4;
    const centerTile = (entry.CenterTile ?? [1, 1, -1, -1]) as Vec4;
    try {
      const bands = computeBands(tess, centerTile, [w, h]);
      ({ cols, rows } = collapsedBands(bands));
    } catch { /* invalid size — skip dimming */ }
  }

  for (let y = 0; y < 5; ++y)
    for (let x = 0; x < 5; ++x) {
      const tile = tiles[y][x];
      const cell = cells?.[y]?.[x] ?? null;
      tile.classList.toggle('cm-disabled', !cell);
      tile.classList.toggle('cm-selected', !!cell && !!sel && sel[0] === y && sel[1] === x);
      tile.classList.toggle('cm-dimmed', !!cell && !!cols && !!rows && (cols[x] || rows[y]));

      const glyphHost = tile.querySelector<HTMLElement>('.cm-glyphs')!;
      if (!cell) { glyphHost.textContent = ''; continue; }
      const g = cellGlyphs(cell);
      let txt = '';
      if (g.degenerate) txt += '∅';
      if (g.rotated) txt += '↻';
      if (g.mirrorX) txt += '⇋';
      if (g.mirrorY) txt += '⇅';
      glyphHost.textContent = txt;
    }
}
