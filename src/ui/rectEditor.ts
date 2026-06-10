import { state, notify, type LayerName } from './state';
import { ninePatchGrid } from '../cells';
import type { EditorCell } from '../types';

const HANDLE = 6; // px, screen-space

interface View { zoom: number; ox: number; oy: number; }
const view: View = { zoom: 1, ox: 20, oy: 20 };

// null = normal rect mode; non-null = 9-patch quick mode (two draggable cut lines per axis).
let ninePatch: { xCuts: [number, number]; yCuts: [number, number] } | null = null;

let imageCanvas: HTMLCanvasElement | null = null;
let imageFor: string | null = null;

function ensureImageCanvas(): HTMLCanvasElement | null {
  const layer = state.layers?.[state.activeLayer];
  if (!layer?.image) return null;
  const key = `${state.selected}/${state.activeLayer}`;
  if (imageCanvas && imageFor === key) return imageCanvas;
  const c = document.createElement('canvas');
  c.width = layer.image.width; c.height = layer.image.height;
  const id = new ImageData(new Uint8ClampedArray(layer.image.data), c.width, c.height);
  c.getContext('2d')!.putImageData(id, 0, 0); // display only — pixels never read back
  imageCanvas = c; imageFor = key;
  return c;
}

const toScreen = (x: number, y: number): [number, number] => [x * view.zoom + view.ox, y * view.zoom + view.oy];
const toImage = (sx: number, sy: number): [number, number] => [(sx - view.ox) / view.zoom, (sy - view.oy) / view.zoom];

type DragMode =
  | { kind: 'pan' }
  | { kind: 'move' }
  | { kind: 'handle'; hx: 0 | 1 | -1; hy: 0 | 1 | -1 }
  | { kind: 'cut'; axis: 'x' | 'y'; index: 0 | 1 };
let drag: { mode: DragMode; lastX: number; lastY: number } | null = null;

function cellAt(ix: number, iy: number): [number, number] | null {
  const cells = state.layers?.[state.activeLayer]?.cells;
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
  state.dirty = true;
}

function activeImage(): { width: number; height: number } | null {
  return state.layers?.[state.activeLayer]?.image ?? null;
}

// Initialize cut lines to image thirds and enter 9-patch mode.
function enterNinePatch(): void {
  const img = activeImage();
  if (!img) return; // no-op when no image loaded
  ninePatch = {
    xCuts: [Math.round(img.width / 3), Math.round((2 * img.width) / 3)],
    yCuts: [Math.round(img.height / 3), Math.round((2 * img.height) / 3)],
  };
  notify();
}

function cancelNinePatch(): void {
  ninePatch = null;
  notify();
}

function applyNinePatch(): void {
  const img = activeImage();
  if (!img || !ninePatch || !state.layers) { ninePatch = null; notify(); return; }
  const layers: LayerName[] = state.linked ? ['mask', 'overlay'] : [state.activeLayer];
  for (const ln of layers) {
    const layer = state.layers[ln];
    if (!layer) continue;
    layer.cells = ninePatchGrid(ninePatch.xCuts, ninePatch.yCuts, [img.width, img.height]);
  }
  state.dirty = true;
  ninePatch = null;
  notify();
}

// Hit-test the nearest cut line within HANDLE screen-px of the cursor.
function hitCut(sx: number, sy: number): DragMode | null {
  if (!ninePatch) return null;
  let best: DragMode | null = null;
  let bestDist = HANDLE;
  for (const index of [0, 1] as const) {
    const dxScreen = Math.abs(toScreen(ninePatch.xCuts[index], 0)[0] - sx);
    if (dxScreen < bestDist) { bestDist = dxScreen; best = { kind: 'cut', axis: 'x', index }; }
    const dyScreen = Math.abs(toScreen(0, ninePatch.yCuts[index])[1] - sy);
    if (dyScreen < bestDist) { bestDist = dyScreen; best = { kind: 'cut', axis: 'y', index }; }
  }
  return best;
}

function dragCut(mode: Extract<DragMode, { kind: 'cut' }>, ix: number, iy: number): void {
  const img = activeImage();
  if (!ninePatch || !img) return;
  if (mode.axis === 'x') {
    ninePatch.xCuts[mode.index] = Math.max(0, Math.min(img.width, Math.round(ix)));
    if (ninePatch.xCuts[0] > ninePatch.xCuts[1])
      ninePatch.xCuts = [ninePatch.xCuts[1], ninePatch.xCuts[0]];
  } else {
    ninePatch.yCuts[mode.index] = Math.max(0, Math.min(img.height, Math.round(iy)));
    if (ninePatch.yCuts[0] > ninePatch.yCuts[1])
      ninePatch.yCuts = [ninePatch.yCuts[1], ninePatch.yCuts[0]];
  }
}

export function renderRectEditor(host: HTMLElement): void {
  host.innerHTML = `
    <div style="padding:4px;display:flex;gap:8px;align-items:center">
      <button data-layer="overlay">Overlay</button><button data-layer="mask">Mask</button>
      <label><input type="checkbox" id="linked"> linked layout</label>
      <label><input type="checkbox" id="mirror-x"> mirror X</label>
      <label><input type="checkbox" id="mirror-y"> mirror Y</label>
      ${ninePatch
        ? `<button id="np-apply">Apply</button><button id="np-cancel">Cancel</button>`
        : `<button id="np-enter">9-patch</button>`}
      <span id="readout" style="margin-left:auto;font-family:monospace"></span>
    </div>
    <canvas id="rect-canvas" style="display:block;background:#333"></canvas>`;
  const canvas = host.querySelector<HTMLCanvasElement>('#rect-canvas')!;
  canvas.width = host.clientWidth || 800;
  canvas.height = (host.clientHeight || 600) - 30;

  host.querySelectorAll<HTMLButtonElement>('button[data-layer]').forEach((b) => {
    b.onclick = () => { state.activeLayer = b.dataset.layer as LayerName; notify(); };
  });
  const linked = host.querySelector<HTMLInputElement>('#linked')!;
  linked.checked = state.linked;
  linked.onchange = () => { state.linked = linked.checked; notify(); };
  const mx = host.querySelector<HTMLInputElement>('#mirror-x')!;
  const my = host.querySelector<HTMLInputElement>('#mirror-y')!;
  const selCell = state.selectedCell && state.layers?.[state.activeLayer]?.cells?.[state.selectedCell[0]]?.[state.selectedCell[1]];
  mx.checked = !!selCell?.mirrorX; my.checked = !!selCell?.mirrorY;
  mx.onchange = () => { for (const c of editTargets()) c.mirrorX = mx.checked; state.dirty = true; notify(); };
  my.onchange = () => { for (const c of editTargets()) c.mirrorY = my.checked; state.dirty = true; notify(); };

  const npEnter = host.querySelector<HTMLButtonElement>('#np-enter');
  if (npEnter) { npEnter.disabled = !activeImage(); npEnter.onclick = enterNinePatch; }
  const npApply = host.querySelector<HTMLButtonElement>('#np-apply');
  if (npApply) npApply.onclick = applyNinePatch;
  const npCancel = host.querySelector<HTMLButtonElement>('#np-cancel');
  if (npCancel) npCancel.onclick = cancelNinePatch;

  canvas.onwheel = (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.25 : 0.8;
    const [ix, iy] = toImage(e.offsetX, e.offsetY);
    view.zoom *= f;
    view.zoom = Math.max(0.05, Math.min(64, view.zoom));
    view.ox = e.offsetX - ix * view.zoom;
    view.oy = e.offsetY - iy * view.zoom;
    draw(canvas);
  };
  canvas.onmousedown = (e) => {
    if (ninePatch !== null) {
      if (e.button === 1 || e.shiftKey) { drag = { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY }; return; }
      const cut = hitCut(e.offsetX, e.offsetY);
      drag = cut
        ? { mode: cut, lastX: e.offsetX, lastY: e.offsetY }
        : { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY };
      return;
    }
    const cells = state.layers?.[state.activeLayer]?.cells;
    if (e.button === 1 || e.shiftKey || !cells) { drag = { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY }; return; }
    const sel = state.selectedCell && cells[state.selectedCell[0]][state.selectedCell[1]];
    const h = sel && hitHandle(sel.rect, e.offsetX, e.offsetY);
    if (h) { drag = { mode: h, lastX: e.offsetX, lastY: e.offsetY }; return; }
    const [ix, iy] = toImage(e.offsetX, e.offsetY);
    state.selectedCell = cellAt(ix, iy);
    drag = state.selectedCell ? { mode: { kind: 'move' }, lastX: e.offsetX, lastY: e.offsetY } : { mode: { kind: 'pan' }, lastX: e.offsetX, lastY: e.offsetY };
    notify();
  };
  canvas.onmousemove = (e) => {
    if (!drag) return;
    const dx = e.offsetX - drag.lastX, dy = e.offsetY - drag.lastY;
    drag.lastX = e.offsetX; drag.lastY = e.offsetY;
    if (drag.mode.kind === 'pan') { view.ox += dx; view.oy += dy; }
    else if (drag.mode.kind === 'cut') { const [ix, iy] = toImage(e.offsetX, e.offsetY); dragCut(drag.mode, ix, iy); }
    else applyDrag(dx / view.zoom, dy / view.zoom, drag.mode);
    draw(canvas);
  };
  canvas.onmouseup = () => { drag = null; notify(); };

  draw(canvas);
}

function drawNinePatch(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null): void {
  if (!ninePatch) return;
  const w = (img?.width ?? 0) * view.zoom;
  const h = (img?.height ?? 0) * view.zoom;
  ctx.strokeStyle = '#0af';
  ctx.lineWidth = 1;
  for (const cx of ninePatch.xCuts) {
    const [sx] = toScreen(cx, 0);
    ctx.beginPath(); ctx.moveTo(sx, view.oy); ctx.lineTo(sx, view.oy + h); ctx.stroke();
  }
  for (const cy of ninePatch.yCuts) {
    const [, sy] = toScreen(0, cy);
    ctx.beginPath(); ctx.moveTo(view.ox, sy); ctx.lineTo(view.ox + w, sy); ctx.stroke();
  }
  const readout = document.getElementById('readout');
  if (readout) readout.textContent =
    `9-patch  x=[${ninePatch.xCuts.join(', ')}]  y=[${ninePatch.yCuts.join(', ')}]`;
}

function draw(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const img = ensureImageCanvas();
  ctx.imageSmoothingEnabled = view.zoom < 1;
  if (img) ctx.drawImage(img, view.ox, view.oy, img.width * view.zoom, img.height * view.zoom);

  if (ninePatch !== null) {
    drawNinePatch(ctx, img);
    return;
  }

  const cells = state.layers?.[state.activeLayer]?.cells;
  const readout = document.getElementById('readout');
  if (!cells) { if (readout) readout.textContent = 'no cells (layer is #COPY or absent)'; return; }

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
        if (readout) readout.textContent =
          `cell[${y}][${x}] = [${c.rect.join(', ')}]${c.mirrorX ? ' ⇋x' : ''}${c.mirrorY ? ' ⇋y' : ''}`;
      }
    }
}
