import { state, notify, type LayerName } from './state';
import { mountCellMap, updateCellMap } from './cellMap';
import {
  detectGridMode,
  extractLines3x3,
  extractLines5x5,
  rewrite3x3,
  rewrite5x5Line,
  type GridMode,
} from '../gridModes';
import type { EditorCell, Rgba } from '../types';

const HANDLE = 6; // px, screen-space

interface View { zoom: number; ox: number; oy: number; }
const view: View = { zoom: 1, ox: 20, oy: 20 };

// Grid editing mode. 'free' = per-cell rect/handle/move drag (Phase 2). '3x3' and '5x5lines'
// expose the IMPLIED partition lines of the current cells as draggable line overlays. Entering a
// mode never mutates data — it only seeds the local working line state below from the cells. A
// line DRAG that moves a boundary is the only thing that commits (dirty + notify), via rewrite*.
let gridMode: GridMode = 'free';
// Local working line state for the line modes, seeded on mode-enter / after a commit. Pixel-space;
// must be dropped across border/image switches (see resetGridMode) so it can't leak.
let cuts3x3: { xCuts: [number, number]; yCuts: [number, number] } | null = null;
let lines5x5: { xLines: number[]; yLines: number[] } | null = null;

// Decoded display image, cached per Rgba identity. The same Rgba buffer is reused across
// notify()s/redraws while a border stays selected, so identity keying avoids re-decoding.
const imageCanvasCache = new WeakMap<Rgba, HTMLCanvasElement>();

function ensureImageCanvas(): HTMLCanvasElement | null {
  const image = state.layers?.[state.activeLayer]?.image;
  if (!image) return null;
  const cached = imageCanvasCache.get(image);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const id = new ImageData(new Uint8ClampedArray(image.data), c.width, c.height);
  c.getContext('2d')!.putImageData(id, 0, 0); // display only — pixels never read back
  imageCanvasCache.set(image, c);
  return c;
}

const toScreen = (x: number, y: number): [number, number] => [x * view.zoom + view.ox, y * view.zoom + view.oy];
const toImage = (sx: number, sy: number): [number, number] => [(sx - view.ox) / view.zoom, (sy - view.oy) / view.zoom];

type DragMode =
  | { kind: 'pan' }
  | { kind: 'move' }
  | { kind: 'handle'; hx: 0 | 1 | -1; hy: 0 | 1 | -1 }
  | { kind: 'cut'; axis: 'x' | 'y'; index: 0 | 1 }          // 3x3 inner cut line
  | { kind: 'line'; axis: 'x' | 'y'; index: number };       // 5x5 partition line
// `changed` tracks whether the drag mutated cell rects / lines (vs a view-only pan), so pointerup
// commits (dirty + notify) exactly once and only when something actually changed.
let drag: { mode: DragMode; lastX: number; lastY: number; changed: boolean } | null = null;

function activeCells(): EditorCell[][] | null {
  return state.layers?.[state.activeLayer]?.cells ?? null;
}

function cellAt(ix: number, iy: number): [number, number] | null {
  const cells = activeCells();
  if (!cells) return null;
  for (let y = 4; y >= 0; --y)
    for (let x = 4; x >= 0; --x) {
      const r = cells[y][x].rect;
      const [x0, x1] = [Math.min(r[0], r[2]), Math.max(r[0], r[2])];
      const [y0, y1] = [Math.min(r[1], r[3]), Math.max(r[1], r[3])];
      if (ix >= x0 && ix <= x1 && iy >= y0 && iy <= y1) return [y, x];
    }
  return null;
}

function hitHandle(r: number[], sx: number, sy: number): DragMode | null {
  const [ax, ay] = toScreen(Math.min(r[0], r[2]), Math.min(r[1], r[3]));
  const [bx, by] = toScreen(Math.max(r[0], r[2]), Math.max(r[1], r[3]));
  const nx = Math.abs(sx - ax) < HANDLE ? -1 : Math.abs(sx - bx) < HANDLE ? 1 : 0;
  const ny = Math.abs(sy - ay) < HANDLE ? -1 : Math.abs(sy - by) < HANDLE ? 1 : 0;
  if (nx === 0 && ny === 0) return sx > ax && sx < bx && sy > ay && sy < by ? { kind: 'move' } : null;
  return { kind: 'handle', hx: nx as any, hy: ny as any };
}

function editTargets(): EditorCell[] {
  const out: EditorCell[] = [];
  if (!state.layers || !state.selectedCell) return out;
  const [y, x] = state.selectedCell;
  const layers: LayerName[] = state.linked ? ['mask', 'overlay'] : [state.activeLayer];
  for (const ln of layers) {
    const c = state.layers[ln]?.cells?.[y]?.[x];
    if (c) out.push(c);
  }
  return out;
}

// Layers a grid rewrite (3x3 / 5x5) writes to, respecting the linked flag.
function rewriteTargets(): LayerName[] {
  return state.linked ? ['mask', 'overlay'] : [state.activeLayer];
}

// Mutate the in-memory rect(s) only. Caller (pointermove) redraws directly; the commit
// (state.dirty + notify) happens once on pointerup, not here.
function applyDrag(dxImg: number, dyImg: number, mode: DragMode): void {
  for (const cell of editTargets()) {
    const r = cell.rect;
    if (mode.kind === 'move') { r[0] += dxImg; r[2] += dxImg; r[1] += dyImg; r[3] += dyImg; }
    else if (mode.kind === 'handle') {
      // operate on min/max ends regardless of stored (possibly rotated) order
      const xi = mode.hx === -1 ? (r[0] <= r[2] ? 0 : 2) : (r[0] <= r[2] ? 2 : 0);
      const yi = mode.hy === -1 ? (r[1] <= r[3] ? 1 : 3) : (r[1] <= r[3] ? 3 : 1);
      if (mode.hx !== 0) r[xi] += dxImg;
      if (mode.hy !== 0) r[yi] += dyImg;
    }
    for (let i = 0; i < 4; ++i) r[i] = Math.round(r[i]);
  }
}

function activeImage(): { width: number; height: number } | null {
  return state.layers?.[state.activeLayer]?.image ?? null;
}

function imageSize(): [number, number] {
  const img = activeImage();
  return [img?.width ?? 0, img?.height ?? 0];
}

// Availability of the line modes, derived from the ACTIVE layer's cells. '5x5lines' is also
// available whenever '3x3' is (3x3 is a special partition). 'free' is always available.
function modeAvailability(): { has3x3: boolean; has5x5: boolean; reason: string } {
  const cells = activeCells();
  if (!cells) return { has3x3: false, has5x5: false, reason: 'no cells (layer is #COPY or absent)' };
  const det = detectGridMode(cells);
  if (det === '3x3') return { has3x3: true, has5x5: true, reason: '' };
  if (det === '5x5lines') return { has3x3: false, has5x5: true, reason: '' };
  return { has3x3: false, has5x5: false, reason: 'aliased / non-partition cells — free mode only' };
}

// Seed the local working line state for the line modes from the current cells. Never mutates data.
function seedLines(): void {
  const cells = activeCells();
  if (!cells) { cuts3x3 = null; lines5x5 = null; return; }
  if (gridMode === '3x3') cuts3x3 = extractLines3x3(cells);
  else if (gridMode === '5x5lines') lines5x5 = extractLines5x5(cells);
}

// Switch editing mode. VIEW-ONLY: seeds local lines + redraws + refreshes the toolbar; it does
// NOT set state.dirty. Only an actual line drag (rewrite*) commits.
function setGridMode(mode: GridMode): void {
  if (mode === '3x3' || mode === '5x5lines') {
    const a = modeAvailability();
    if ((mode === '3x3' && !a.has3x3) || (mode === '5x5lines' && !a.has5x5)) return; // unavailable
  }
  gridMode = mode;
  cuts3x3 = null; lines5x5 = null;
  seedLines();
  if (canvas) { draw(canvas); updateCellMap(); }
  refreshModeBar();
}

// Drop transient line-drag state and fall back to Free. Used on border/layer switches so
// pixel-space lines from the previous image never leak. Recomputes default mode = Free (the
// view-only invariant: never auto-converts data, and switching modes never dirties).
export function resetGridMode(): void {
  gridMode = 'free';
  cuts3x3 = null;
  lines5x5 = null;
}

// Hit-test the nearest 3x3 inner cut line within HANDLE screen-px of the cursor.
function hitCut(sx: number, sy: number): DragMode | null {
  if (!cuts3x3) return null;
  let best: DragMode | null = null;
  let bestDist = HANDLE;
  for (const index of [0, 1] as const) {
    const dxScreen = Math.abs(toScreen(cuts3x3.xCuts[index], 0)[0] - sx);
    if (dxScreen < bestDist) { bestDist = dxScreen; best = { kind: 'cut', axis: 'x', index }; }
    const dyScreen = Math.abs(toScreen(0, cuts3x3.yCuts[index])[1] - sy);
    if (dyScreen < bestDist) { bestDist = dyScreen; best = { kind: 'cut', axis: 'y', index }; }
  }
  return best;
}

// Hit-test the nearest 5x5 partition line within HANDLE screen-px of the cursor (all 6 per axis).
function hitLine(sx: number, sy: number): DragMode | null {
  if (!lines5x5) return null;
  let best: DragMode | null = null;
  let bestDist = HANDLE;
  for (let index = 0; index < 6; ++index) {
    const dxScreen = Math.abs(toScreen(lines5x5.xLines[index], 0)[0] - sx);
    if (dxScreen < bestDist) { bestDist = dxScreen; best = { kind: 'line', axis: 'x', index }; }
    const dyScreen = Math.abs(toScreen(0, lines5x5.yLines[index])[1] - sy);
    if (dyScreen < bestDist) { bestDist = dyScreen; best = { kind: 'line', axis: 'y', index }; }
  }
  return best;
}

function dragCut(mode: Extract<DragMode, { kind: 'cut' }>, ix: number, iy: number): void {
  const img = activeImage();
  if (!cuts3x3 || !img) return;
  if (mode.axis === 'x') {
    const v = Math.max(0, Math.min(img.width, Math.round(ix)));
    // clamp to the sibling so the held line never crosses (index stays put)
    cuts3x3.xCuts[mode.index] = mode.index === 0
      ? Math.min(v, cuts3x3.xCuts[1])
      : Math.max(v, cuts3x3.xCuts[0]);
  } else {
    const v = Math.max(0, Math.min(img.height, Math.round(iy)));
    cuts3x3.yCuts[mode.index] = mode.index === 0
      ? Math.min(v, cuts3x3.yCuts[1])
      : Math.max(v, cuts3x3.yCuts[0]);
  }
}

function dragLine(mode: Extract<DragMode, { kind: 'line' }>, ix: number, iy: number): void {
  const img = activeImage();
  if (!lines5x5 || !img) return;
  const arr = mode.axis === 'x' ? lines5x5.xLines : lines5x5.yLines;
  const max = mode.axis === 'x' ? img.width : img.height;
  const raw = Math.round(mode.axis === 'x' ? ix : iy);
  // clamp to neighbors so lines never cross (rewrite5x5Line clamps identically on commit)
  const lower = mode.index > 0 ? arr[mode.index - 1] : 0;
  const upper = mode.index < 5 ? arr[mode.index + 1] : max;
  arr[mode.index] = Math.max(0, Math.min(max, Math.max(lower, Math.min(upper, raw))));
}

// --- Panel: built once via mountCellsPanel, refreshed in place via updateCellsPanel. ---

let canvas: HTMLCanvasElement | null = null;
// Stable host (toolbar + cells-row) cached at mount: its height does NOT depend on
// the canvas, unlike `canvas.parentElement` (the flex:1 `.cells-canvas-col`, whose
// height is DRIVEN by the canvas). Sizing off the column would shrink the canvas on
// every notify(). Height comes from `cellsPanelHost`; width from the canvas column.
let cellsPanelHost: HTMLElement | null = null;
// Toolbar row height subtracted from the panel host to get the canvas height.
const CELLS_TOOLBAR_H = 30;
// Map-column width fallback: must track `.cm-host` flex-basis (132) + `.cells-row` gap (8).
const MAP_COL_W = 140;
let linkedInput: HTMLInputElement | null = null;
let mxInput: HTMLInputElement | null = null;
let myInput: HTMLInputElement | null = null;
let modeFreeBtn: HTMLButtonElement | null = null;
let mode3x3Btn: HTMLButtonElement | null = null;
let mode5x5Btn: HTMLButtonElement | null = null;
let readoutEl: HTMLElement | null = null;

export function mountCellsPanel(host: HTMLElement): void {
  host.innerHTML = `
    <div style="padding:4px;display:flex;gap:8px;align-items:center">
      <button data-layer="overlay">Overlay</button><button data-layer="mask">Mask</button>
      <label><input type="checkbox" id="linked"> linked layout</label>
      <label><input type="checkbox" id="mirror-x"> mirror X</label>
      <label><input type="checkbox" id="mirror-y"> mirror Y</label>
      <button id="mode-free" data-mode="free">Free</button>
      <button id="mode-3x3" data-mode="3x3">3×3</button>
      <button id="mode-5x5" data-mode="5x5lines">5×5 lines</button>
      <span id="readout" style="margin-left:auto;font-family:monospace"></span>
    </div>
    <div class="cells-row" style="display:flex;gap:8px;align-items:stretch">
      <div class="cells-canvas-col" style="flex:1;min-width:0">
        <canvas id="rect-canvas" style="display:block;background:#333"></canvas>
      </div>
      <div id="cell-map-host" class="cm-host"></div>
    </div>`;
  canvas = host.querySelector<HTMLCanvasElement>('#rect-canvas')!;
  cellsPanelHost = host;
  sizeCanvasToHost();

  mountCellMap(host.querySelector<HTMLElement>('#cell-map-host')!);

  host.querySelectorAll<HTMLButtonElement>('button[data-layer]').forEach((b) => {
    // Reset transient grid-drag state before switching layer so pixel-space lines from the
    // previous layer's cells can't leak; the remount re-seeds from the new layer.
    b.onclick = () => { resetGridMode(); state.activeLayer = b.dataset.layer as LayerName; notify(); };
  });
  linkedInput = host.querySelector<HTMLInputElement>('#linked')!;
  linkedInput.onchange = () => { state.linked = linkedInput!.checked; notify(); };
  mxInput = host.querySelector<HTMLInputElement>('#mirror-x')!;
  myInput = host.querySelector<HTMLInputElement>('#mirror-y')!;
  mxInput.onchange = () => { for (const c of editTargets()) c.mirrorX = mxInput!.checked; state.dirty = true; notify(); };
  myInput.onchange = () => { for (const c of editTargets()) c.mirrorY = myInput!.checked; state.dirty = true; notify(); };

  modeFreeBtn = host.querySelector<HTMLButtonElement>('#mode-free')!;
  mode3x3Btn = host.querySelector<HTMLButtonElement>('#mode-3x3')!;
  mode5x5Btn = host.querySelector<HTMLButtonElement>('#mode-5x5')!;
  modeFreeBtn.onclick = () => setGridMode('free');
  mode3x3Btn.onclick = () => setGridMode('3x3');
  mode5x5Btn.onclick = () => setGridMode('5x5lines');
  readoutEl = host.querySelector<HTMLElement>('#readout')!;

  // Fresh mount (border/layer/linked switch). resetGridMode cleared lines in selectBorder; ensure
  // the local mode is valid for the new cells: if the previous mode is no longer available, fall
  // back to Free. Then seed lines for whatever mode we land in.
  const a = modeAvailability();
  if ((gridMode === '3x3' && !a.has3x3) || (gridMode === '5x5lines' && !a.has5x5)) gridMode = 'free';
  seedLines();
  refreshModeBar();

  const c = canvas;
  c.onwheel = (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.25 : 0.8;
    const [ix, iy] = toImage(e.offsetX, e.offsetY);
    view.zoom *= f;
    view.zoom = Math.max(0.05, Math.min(64, view.zoom));
    view.ox = e.offsetX - ix * view.zoom;
    view.oy = e.offsetY - iy * view.zoom;
    draw(c); // view-only: never dirty, never notify
  };

  c.onpointerdown = (e) => {
    if (gridMode === '3x3' || gridMode === '5x5lines') {
      if (e.button === 1 || e.shiftKey) { drag = { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY, changed: false }; c.setPointerCapture(e.pointerId); return; }
      const hit = gridMode === '3x3' ? hitCut(e.offsetX, e.offsetY) : hitLine(e.offsetX, e.offsetY);
      drag = hit
        ? { mode: hit, lastX: e.offsetX, lastY: e.offsetY, changed: false }
        : { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY, changed: false };
      c.setPointerCapture(e.pointerId);
      return;
    }
    const cells = activeCells();
    if (e.button === 1 || e.shiftKey || !cells) { drag = { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY, changed: false }; c.setPointerCapture(e.pointerId); return; }
    const sel = state.selectedCell && cells[state.selectedCell[0]][state.selectedCell[1]];
    const h = sel && hitHandle(sel.rect, e.offsetX, e.offsetY);
    if (h) { drag = { mode: h, lastX: e.offsetX, lastY: e.offsetY, changed: false }; c.setPointerCapture(e.pointerId); return; }
    const [ix, iy] = toImage(e.offsetX, e.offsetY);
    state.selectedCell = cellAt(ix, iy);
    drag = state.selectedCell ? { mode: { kind: 'move' }, lastX: e.offsetX, lastY: e.offsetY, changed: false } : { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY, changed: false };
    c.setPointerCapture(e.pointerId);
    notify(); // selection change: commit so other panels reflect the new selectedCell
  };

  c.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.offsetX - drag.lastX, dy = e.offsetY - drag.lastY;
    drag.lastX = e.offsetX; drag.lastY = e.offsetY;
    if (drag.mode.kind === 'pan') { view.ox += dx; view.oy += dy; } // view-only
    else if (drag.mode.kind === 'cut') { const [ix, iy] = toImage(e.offsetX, e.offsetY); dragCut(drag.mode, ix, iy); drag.changed = true; }
    else if (drag.mode.kind === 'line') { const [ix, iy] = toImage(e.offsetX, e.offsetY); dragLine(drag.mode, ix, iy); drag.changed = true; }
    else { applyDrag(dx / view.zoom, dy / view.zoom, drag.mode); drag.changed = true; }
    draw(c); // mutate local lines / in-memory rects only; commit happens on pointerup
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    const mode = drag.mode;
    const changed = drag.changed;
    drag = null;
    if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    if (!changed) return; // pan-only / pure selection (already notified): nothing to commit
    if (mode.kind === 'cut') commit3x3();
    else if (mode.kind === 'line') commit5x5(mode.axis, mode.index);
    else { state.dirty = true; notify(); }
  };
  c.onpointerup = endDrag;
  c.onpointercancel = endDrag;

  draw(c);
}

// Commit the 3x3 working cuts to the layer(s) via rewrite3x3 (preserves mirror flags), then
// dirty + notify once. notify() re-runs updateCellsPanel which re-seeds the lines from the
// now-updated cells.
function commit3x3(): void {
  if (!cuts3x3 || !state.layers) return;
  const size = imageSize();
  for (const ln of rewriteTargets()) {
    const layer = state.layers[ln];
    if (!layer?.cells) continue;
    layer.cells = rewrite3x3(layer.cells, cuts3x3.xCuts, cuts3x3.yCuts, size);
  }
  state.dirty = true;
  notify();
}

// Commit one dragged 5x5 partition line to the layer(s) via rewrite5x5Line (clamps + preserves
// mirror flags), then dirty + notify once.
function commit5x5(axis: 'x' | 'y', index: number): void {
  if (!lines5x5 || !state.layers) return;
  const size = imageSize();
  const newValue = (axis === 'x' ? lines5x5.xLines : lines5x5.yLines)[index];
  for (const ln of rewriteTargets()) {
    const layer = state.layers[ln];
    if (!layer?.cells) continue;
    layer.cells = rewrite5x5Line(layer.cells, axis, index, newValue, size);
  }
  state.dirty = true;
  notify();
}

// Size the canvas off STABLE handles so repeated notifies don't progressively shrink it:
//   height  <- panel host (toolbar + cells-row), independent of the canvas
//   width   <- the canvas's own flex column (excludes the map column)
// Used identically at mount and on every update so first paint and refresh agree.
function sizeCanvasToHost(): void {
  if (!canvas) return;
  const col = canvas.parentElement as HTMLElement | null; // .cells-canvas-col (flex:1)
  const w = (col?.clientWidth) || ((cellsPanelHost?.clientWidth || 800) - MAP_COL_W);
  const h = (cellsPanelHost?.clientHeight || 600) - CELLS_TOOLBAR_H;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

// Reflect the current mode + availability onto the three mode-bar buttons. View-only.
function refreshModeBar(): void {
  const a = modeAvailability();
  const set = (btn: HTMLButtonElement | null, mode: GridMode, enabled: boolean) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.title = enabled ? '' : a.reason;
    btn.setAttribute('aria-pressed', String(gridMode === mode));
  };
  set(modeFreeBtn, 'free', true);
  set(mode3x3Btn, '3x3', a.has3x3);
  set(mode5x5Btn, '5x5lines', a.has5x5);
}

// Cheap in-place refresh: resize canvas if image dims changed, sync toolbar control states
// without rebuilding the DOM, re-seed line modes from the (possibly updated) cells unless a drag
// is in progress, refresh the mode bar, then redraw.
export function updateCellsPanel(): void {
  if (!canvas) return;
  sizeCanvasToHost();

  if (linkedInput) linkedInput.checked = state.linked;
  const selCell = state.selectedCell && state.layers?.[state.activeLayer]?.cells?.[state.selectedCell[0]]?.[state.selectedCell[1]];
  if (mxInput) mxInput.checked = !!selCell?.mirrorX;
  if (myInput) myInput.checked = !!selCell?.mirrorY;

  // If the current mode is no longer available for these cells (e.g. an edit aliased them),
  // fall back to Free. Re-seed the working lines from the updated cells — but NOT mid-drag, so
  // an in-progress line drag isn't clobbered by a notify().
  if (!drag) {
    const a = modeAvailability();
    if ((gridMode === '3x3' && !a.has3x3) || (gridMode === '5x5lines' && !a.has5x5)) gridMode = 'free';
    seedLines();
  }
  refreshModeBar();

  draw(canvas);
  updateCellMap();
}

// Draw the 3x3 inner cut lines + readout.
function drawCuts3x3(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null): void {
  if (!cuts3x3) return;
  const w = (img?.width ?? 0) * view.zoom;
  const h = (img?.height ?? 0) * view.zoom;
  ctx.strokeStyle = '#0af';
  ctx.lineWidth = 1;
  for (const cx of cuts3x3.xCuts) {
    const [sx] = toScreen(cx, 0);
    ctx.beginPath(); ctx.moveTo(sx, view.oy); ctx.lineTo(sx, view.oy + h); ctx.stroke();
  }
  for (const cy of cuts3x3.yCuts) {
    const [, sy] = toScreen(0, cy);
    ctx.beginPath(); ctx.moveTo(view.ox, sy); ctx.lineTo(view.ox + w, sy); ctx.stroke();
  }
  if (readoutEl) readoutEl.textContent =
    `3×3  x=[${cuts3x3.xCuts.join(', ')}]  y=[${cuts3x3.yCuts.join(', ')}]`;
}

// Draw the 5x5 partition lines (6 per axis) + readout.
function drawLines5x5(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null): void {
  if (!lines5x5) return;
  const w = (img?.width ?? 0) * view.zoom;
  const h = (img?.height ?? 0) * view.zoom;
  ctx.strokeStyle = '#0af';
  ctx.lineWidth = 1;
  for (const lx of lines5x5.xLines) {
    const [sx] = toScreen(lx, 0);
    ctx.beginPath(); ctx.moveTo(sx, view.oy); ctx.lineTo(sx, view.oy + h); ctx.stroke();
  }
  for (const ly of lines5x5.yLines) {
    const [, sy] = toScreen(0, ly);
    ctx.beginPath(); ctx.moveTo(view.ox, sy); ctx.lineTo(view.ox + w, sy); ctx.stroke();
  }
  if (readoutEl) readoutEl.textContent =
    `5×5  x=[${lines5x5.xLines.join(', ')}]  y=[${lines5x5.yLines.join(', ')}]`;
}

function draw(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Publish the view transform so tests (and tooling) can map image-space lines to canvas px
  // without re-deriving the transform; mirrors previewPanel's data-layout-* convention.
  canvas.dataset.viewZoom = String(view.zoom);
  canvas.dataset.viewOx = String(view.ox);
  canvas.dataset.viewOy = String(view.oy);
  const img = ensureImageCanvas();
  ctx.imageSmoothingEnabled = view.zoom < 1;
  if (img) ctx.drawImage(img, view.ox, view.oy, img.width * view.zoom, img.height * view.zoom);

  if (gridMode === '3x3') { drawCuts3x3(ctx, img); return; }
  if (gridMode === '5x5lines') { drawLines5x5(ctx, img); return; }

  const cells = activeCells();
  if (!cells) { if (readoutEl) readoutEl.textContent = 'no cells (layer is #COPY or absent)'; return; }

  for (let y = 0; y < 5; ++y)
    for (let x = 0; x < 5; ++x) {
      const c = cells[y][x];
      const sel = state.selectedCell?.[0] === y && state.selectedCell?.[1] === x;
      const [ax, ay] = toScreen(Math.min(c.rect[0], c.rect[2]), Math.min(c.rect[1], c.rect[3]));
      const [bx, by] = toScreen(Math.max(c.rect[0], c.rect[2]), Math.max(c.rect[1], c.rect[3]));
      ctx.strokeStyle = sel ? '#ff0' : (x === 2 || y === 2) ? '#0af' : '#0f0';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(ax, ay, bx - ax, by - ay);
      if (sel) {
        ctx.fillStyle = '#ff0';
        for (const [hx, hy] of [[ax, ay], [bx, ay], [ax, by], [bx, by]] as const)
          ctx.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
        if (readoutEl) readoutEl.textContent =
          `cell[${y}][${x}] = [${c.rect.join(', ')}]${c.mirrorX ? ' ⇋x' : ''}${c.mirrorY ? ' ⇋y' : ''}`;
      }
    }
}
