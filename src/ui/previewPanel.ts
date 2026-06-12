import { PreviewRenderer, type PreviewInput, type PreviewLayer } from '../preview/renderer';
import { state, notify, type LayerName } from './state';
import type { Vec2, Vec4 } from '../types';
import { readMaskMode } from '../maskMode';
import { expandedSize, layoutRectFraction, tessPtToFraction, tessFractionToPt } from '../preview/geometry';
import { computeBands } from '../bands';
import {
  drawOverlay, hitOverlay, screenToWorld, worldToScreen,
  type Handle, type OverlayModel, type OverlayView,
} from './previewOverlay';

// Module-level preview state — these are VIEW state, not document state.
// Changing them calls updatePreview() only; they never touch notify() or state.dirty.
let renderer: PreviewRenderer | null = null;
let panel: [number, number] = [240, 160];
let showOverlayRegion = false;

// Which box-model overlays are drawn + interactive. VIEW-only: toggling redraws, never dirties.
const toggles = { expansion: true, cuts: false, centerTile: false, boxModel: false };

// Backing-pixel size of the overlay/GL container (the fixed paint surface we fit into).
const STAGE_W = 512;
const STAGE_H = 384;

// Shared view: world (drawn-quad pt) -> screen (px). Used by BOTH the GL draw (we position/size
// the GL canvas element so its full-canvas drawn quad lands at world (0,0)..(w,h)) and the overlay
// (drawOverlay maps the same world coords through this view). zoom = px per pt; pan = px offset of
// world origin. This single transform is the alignment invariant: the dashed layout rect drawn by
// the overlay lands exactly on the layout boundary of the GL-rendered border.
const view: OverlayView = { zoom: 1, panX: 0, panY: 0 };

// Cached DOM handles for the mounted stage (cleared on remount).
let glCanvas: HTMLCanvasElement | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let mountHost: HTMLElement | null = null; // host element of the current mount (for #pv-w/#pv-h sync)

function layerInput(name: LayerName): PreviewLayer | null {
  const L = state.layers?.[name];
  if (!L?.image || !L.cells) return null;
  return {
    image: L.image, cells: L.cells,
    edgeFill: L.edgeFill,
    centerFill: L.centerFill,
  };
}

// Drawn-quad size in pt for the current panel size + selected entry's Expansion.
function drawnQuad(): { w: number; h: number; expansion: Vec4 } {
  const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
  const expansion = (entry?.Expansion ?? [0, 0, 0, 0]) as Vec4;
  const [w, h] = expandedSize(panel, expansion);
  return { w, h, expansion };
}

// Auto-fit: choose zoom/pan so the drawn quad fits STAGE with ~10% padding, centered.
function fitView(): void {
  const { w, h } = drawnQuad();
  if (w <= 0 || h <= 0) { view.zoom = 1; view.panX = 0; view.panY = 0; return; }
  const pad = 0.1;
  const zoom = Math.min((STAGE_W * (1 - pad)) / w, (STAGE_H * (1 - pad)) / h);
  view.zoom = zoom;
  view.panX = (STAGE_W - w * zoom) / 2;
  view.panY = (STAGE_H - h * zoom) / 2;
}

// Position/size the GL canvas element so its full-canvas drawn quad covers world (0,0)..(w,h)px.
// The GL vertex shader maps the drawn quad's 0..1 fractions across the entire GL canvas, so placing
// the canvas at the world rect makes the GL output align with the overlay's drawn-quad outline.
function layoutGlCanvas(): void {
  if (!glCanvas) return;
  const { w, h } = drawnQuad();
  const x = view.panX, y = view.panY;
  const sw = w * view.zoom, sh = h * view.zoom;
  glCanvas.style.left = `${x}px`;
  glCanvas.style.top = `${y}px`;
  glCanvas.style.width = `${sw}px`;
  glCanvas.style.height = `${sh}px`;
}

/**
 * Mount the preview panel into `host` exactly once per structural change.
 * Constructs a new PreviewRenderer (WebGL context) and disposes the old one
 * first to avoid leaking GL contexts. The canvas element lives inside `host`
 * and is recreated here, so we must also recreate the renderer that owns it.
 */
export function mountPreview(host: HTMLElement): void {
  // Dispose the existing renderer before replacing the canvas element it owns.
  // Not doing this would leak the WebGL context (browsers cap these per page).
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  glCanvas = null;
  overlayCanvas = null;
  mountHost = host;

  if (!state.doc || !state.selected) {
    host.innerHTML = '';
    return;
  }

  host.innerHTML = `
    <h3 style="margin:8px">Preview</h3>
    <div style="padding:0 8px;display:flex;gap:8px">
      <label>w <input id="pv-w" type="number" value="${panel[0]}" style="width:60px"></label>
      <label>h <input id="pv-h" type="number" value="${panel[1]}" style="width:60px"></label>
      <label><input id="pv-og" type="checkbox" ${showOverlayRegion ? 'checked' : ''}> show G-region</label>
    </div>
    <div class="pv-chips" style="padding:6px 8px;display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="pv-chip" data-toggle="expansion" aria-pressed="${toggles.expansion}">Chrome</button>
      <button type="button" class="pv-chip" data-toggle="cuts" aria-pressed="${toggles.cuts}">Cuts</button>
      <button type="button" class="pv-chip" data-toggle="centerTile" aria-pressed="${toggles.centerTile}">CenterTile</button>
      <button type="button" class="pv-chip" data-toggle="boxModel" aria-pressed="${toggles.boxModel}">Box model</button>
    </div>
    <div class="pv-stage" style="width:${STAGE_W}px;height:${STAGE_H}px;margin:8px;background:repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 0 0 / 16px 16px">
      <canvas id="preview-canvas" class="pv-gl" width="512" height="384"></canvas>
      <canvas class="pv-overlay" width="${STAGE_W}" height="${STAGE_H}"></canvas>
    </div>`;

  glCanvas = host.querySelector<HTMLCanvasElement>('#preview-canvas')!;
  overlayCanvas = host.querySelector<HTMLCanvasElement>('.pv-overlay')!;
  const stage = host.querySelector<HTMLElement>('.pv-stage')!;

  // Construct the renderer once, bound to the GL canvas that was just created.
  renderer = new PreviewRenderer(glCanvas);

  // Wire W/H and overlay controls: they update VIEW state only, never notify() / state.dirty.
  const rerun = () => {
    const num = (s: string, d: number) => { const n = Number(s); return n > 0 ? n : d; };
    panel = [num((host.querySelector('#pv-w') as HTMLInputElement).value, panel[0]),
             num((host.querySelector('#pv-h') as HTMLInputElement).value, panel[1])];
    showOverlayRegion = (host.querySelector('#pv-og') as HTMLInputElement).checked;
    // Panel size changed the drawn quad -> refit so it stays visible, then redraw (view-only).
    fitView();
    updatePreview();
  };
  ['#pv-w', '#pv-h', '#pv-og'].forEach((s) => { (host.querySelector(s) as HTMLInputElement).onchange = rerun; });

  // Toggle chips: flip a VIEW-only boolean + redraw overlay. Never notify() / state.dirty.
  host.querySelectorAll<HTMLButtonElement>('.pv-chip').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.toggle as keyof typeof toggles;
      toggles[k] = !toggles[k];
      b.setAttribute('aria-pressed', String(toggles[k]));
      redrawOverlay();
    };
  });

  wireGestures(stage);
  wireResize();
  wireOverlayDrag();

  // Auto-fit on (re)mount before the first draw. Closes the deferred "view fit" debt.
  fitView();
}

// Zoom about cursor (wheel) + pan (middle button or shift+drag). Both are VIEW-ONLY:
// they recompute `view`, re-render GL under the new view, and redraw the overlay — never
// notify() / state.dirty. Pointer capture keeps the pan drag alive outside the element.
function wireGestures(stage: HTMLElement): void {
  stage.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const before = screenToWorld(view, cx, cy);
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.zoom = Math.max(0.05, Math.min(64, view.zoom * factor));
    // Keep the world point under the cursor fixed.
    view.panX = cx - before.x * view.zoom;
    view.panY = cy - before.y * view.zoom;
    updatePreview();
  }, { passive: false });

  let panning = false;
  let lastX = 0, lastY = 0;
  stage.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
    panning = true;
    lastX = e.clientX; lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e: PointerEvent) => {
    if (!panning) return;
    view.panX += e.clientX - lastX;
    view.panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    updatePreview();
  });
  const endPan = (e: PointerEvent) => {
    if (!panning) return;
    panning = false;
    try { stage.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);
}

// ── Preview viewport resize (VIEW-ONLY) ─────────────────────────────────────────
// Dragging the layout-rect's bottom-right CORNER (or its right/bottom edge when the Chrome/
// expansion overlay is OFF) changes the previewed `panel` size in pt. This is PREVIEW state: it
// only calls updatePreview() and syncs the #pv-w/#pv-h inputs — it NEVER sets state.dirty / notify().
//
// Conflict avoidance with Task 3.2 Expansion handles: Expansion owns the layout-rect EDGE MIDPOINTS
// (drawn when toggles.expansion is on). We therefore put the primary resize handle on the CORNER
// (never used by Expansion) and only offer edge-resize when expansion is OFF, so the two never collide.
// Resize is hit-tested BEFORE the expansion hit-test in the overlay pointerdown handler.
type ResizeKind = 'corner' | 'edge-r' | 'edge-b';
let resizeKind: ResizeKind | null = null;

// Layout-rect corner in world pt. The layout-rect right edge sits at world x = panel.w + exp.l and
// bottom at world y = panel.h + exp.t (since qw - exp.r = panel.w + exp.l). Returns the screen-px
// position of that bottom-right corner plus the expansion insets used to convert a drag back to panel.
function layoutCornerScreen(): { sx: number; sy: number; exp: Vec4 } | null {
  const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
  if (!entry) return null;
  const exp = (entry.Expansion ?? [0, 0, 0, 0]) as Vec4;
  const wx = panel[0] + exp[0]; // layout right edge in world pt
  const wy = panel[1] + exp[1]; // layout bottom edge in world pt
  const s = worldToScreen(view, wx, wy);
  return { sx: s.x, sy: s.y, exp };
}

const RESIZE_HIT_PX = 8; // a touch larger than the 6px overlay band so the corner is easy to grab

// Hit-test the resize handles at a screen point. Corner takes priority; edges only when Chrome is off.
function hitResize(sx: number, sy: number): ResizeKind | null {
  const c = layoutCornerScreen();
  if (!c) return null;
  // Bottom-right corner (always available — never collides with expansion midpoints).
  if (Math.abs(sx - c.sx) <= RESIZE_HIT_PX && Math.abs(sy - c.sy) <= RESIZE_HIT_PX) return 'corner';
  if (toggles.expansion) return null; // edges belong to Expansion while Chrome is on
  // Right edge / bottom edge of the layout rect, away from the corner (corner already handled).
  const exp = c.exp;
  const topS = worldToScreen(view, 0, exp[1]).y;
  const leftS = worldToScreen(view, exp[0], 0).x;
  if (Math.abs(sx - c.sx) <= RESIZE_HIT_PX && sy >= Math.min(topS, c.sy) && sy <= Math.max(topS, c.sy)) return 'edge-r';
  if (Math.abs(sy - c.sy) <= RESIZE_HIT_PX && sx >= Math.min(leftS, c.sx) && sx <= Math.max(leftS, c.sx)) return 'edge-b';
  return null;
}

function cursorForResize(k: ResizeKind): string {
  return k === 'corner' ? 'nwse-resize' : k === 'edge-r' ? 'ew-resize' : 'ns-resize';
}

// Apply a resize drag: convert the world point under the cursor to a new panel size and sync inputs.
function applyResize(k: ResizeKind, wx: number, wy: number, exp: Vec4): void {
  const MIN = 8;
  if (k === 'corner' || k === 'edge-r') panel[0] = Math.max(MIN, wx - exp[0]);
  if (k === 'corner' || k === 'edge-b') panel[1] = Math.max(MIN, wy - exp[1]);
  const wIn = mountHost?.querySelector<HTMLInputElement>('#pv-w');
  const hIn = mountHost?.querySelector<HTMLInputElement>('#pv-h');
  if (wIn) wIn.value = String(Math.round(panel[0]));
  if (hIn) hIn.value = String(Math.round(panel[1]));
}

function wireResize(): void {
  const cv = overlayCanvas;
  if (!cv) return;

  cv.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || e.shiftKey) return;
    const s = screenPt(e);
    const k = hitResize(s.x, s.y);
    if (!k) return; // no resize handle here → let the overlay/expansion drag or pan handle it
    e.preventDefault();
    // stopImmediatePropagation: wireResize registers before wireOverlayDrag on the SAME canvas, so
    // this prevents the expansion/overlay drag pointerdown (a sibling listener) from also firing.
    e.stopImmediatePropagation();
    resizeKind = k;
    cv.setPointerCapture(e.pointerId);
  });

  cv.addEventListener('pointermove', (e: PointerEvent) => {
    const s = screenPt(e);
    if (!resizeKind) {
      // Hover feedback: show the resize cursor when over a handle.
      const k = hitResize(s.x, s.y);
      cv.style.cursor = k ? cursorForResize(k) : '';
      return;
    }
    const c = layoutCornerScreen();
    if (!c) return;
    const wpt = screenToWorld(view, s.x, s.y);
    applyResize(resizeKind, wpt.x, wpt.y, c.exp);
    updatePreview(); // VIEW-only: re-render at the new panel size. Do NOT refit (let the user see it grow).
  });

  const end = (e: PointerEvent) => {
    if (!resizeKind) return;
    resizeKind = null;
    if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

// ── Overlay edge dragging ──────────────────────────────────────────────────────
// Mid-drag we mutate a local working copy (`dragModel`) of the affected entry fields and
// updatePreview() (view-only). On pointer-up we copy the working values onto the entry, set
// state.dirty + notify() ONCE — matching the cells-panel pattern. dragModel === null means no drag.
type DragModel = { Expansion?: Vec4; Tessellation?: Vec4; CenterTile?: Vec4; Margin?: Vec4; Padding?: Vec4 };
let dragModel: DragModel | null = null;
let dragHandle: Handle | null = null;

// Map a screen point to world pt under the current view.
function screenPt(e: PointerEvent): { x: number; y: number } {
  const rect = overlayCanvas!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function wireOverlayDrag(): void {
  const cv = overlayCanvas;
  if (!cv) return;

  cv.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || e.shiftKey) return; // shift/middle = pan (handled by stage) → let it through
    const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
    if (!entry) return;
    const model = buildOverlayModel();
    if (!model) return;
    const s = screenPt(e);
    const handle = hitOverlay(view, model, toggles, s.x, s.y);
    if (!handle) return; // plain miss → don't capture, let pan/zoom on the stage handle it
    e.preventDefault();
    e.stopPropagation();
    dragHandle = handle;
    dragModel = seedDragModel(entry, handle);
    cv.setPointerCapture(e.pointerId);
  });

  cv.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragModel || !dragHandle) return;
    const s = screenPt(e);
    const wpt = screenToWorld(view, s.x, s.y);
    applyDrag(dragHandle, dragModel, wpt.x, wpt.y);
    updatePreview(); // view-only; commit on pointer-up
  });

  const end = (e: PointerEvent) => {
    if (!dragModel) return;
    const m = dragModel;
    dragModel = null; dragHandle = null;
    if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
    if (!entry) return;
    // Commit the working copy onto the entry once.
    if (m.Expansion) entry.Expansion = m.Expansion;
    if (m.Tessellation) entry.Tessellation = m.Tessellation;
    if (m.CenterTile) entry.CenterTile = m.CenterTile;
    if (m.Margin || m.Padding) {
      entry.Style ??= {};
      if (m.Margin) entry.Style.Margin = m.Margin;
      if (m.Padding) entry.Style.Padding = m.Padding;
    }
    state.dirty = true;
    notify();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

// Snapshot the entry fields a handle can touch into a fresh working copy.
function seedDragModel(entry: Record<string, any>, handle: Handle): DragModel {
  const v4 = (a: any, d: Vec4): Vec4 => (Array.isArray(a) ? [a[0], a[1], a[2], a[3]] : [...d]);
  switch (handle.kind) {
    case 'expansion': return { Expansion: v4(entry.Expansion, [0, 0, 0, 0]) };
    case 'cut':       return { Tessellation: v4(entry.Tessellation, [0, 0, 0, 0]) };
    case 'centerTile':return { CenterTile: v4(entry.CenterTile, [1, 1, -1, -1]) };
    case 'margin':    return { Margin: v4(entry.Style?.Margin, [0, 0, 0, 0]) };
    case 'padding':   return { Padding: v4(entry.Style?.Padding, [0, 0, 0, 0]) };
  }
}

// Mutate the working copy from a world-pt drag position. Per-kind geometry below.
function applyDrag(handle: Handle, m: DragModel, wx: number, wy: number): void {
  const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
  if (!entry) return;
  const [pw, ph] = panel; // layout-rect (panel) size; expansion grows the quad OUTSIDE this.

  if (handle.kind === 'expansion' && m.Expansion) {
    // The layout-rect edge sits at world `expansion[side]` from the quad edge. The left edge is at
    // x = exp.l; dragging it to wx means exp.l = wx (clamped ≥0). Right edge at x = pw + exp.l + ... ,
    // but easier: with current expansion the quad width = pw + l + r, layout x1 = quad.w - r. So a
    // right-edge drag to wx → r = quad.w - wx. We recompute quad size from the LIVE working copy.
    const e = m.Expansion;
    const qw = pw + e[0] + e[2], qh = ph + e[1] + e[3];
    if (handle.side === 'l') e[0] = Math.max(0, wx);
    else if (handle.side === 'r') e[2] = Math.max(0, qw - wx);
    else if (handle.side === 't') e[1] = Math.max(0, wy);
    else if (handle.side === 'b') e[3] = Math.max(0, qh - wy);
    return;
  }

  if (handle.kind === 'cut' && m.Tessellation) {
    // Drawn-quad size from the (committed) expansion — expansion isn't being dragged here.
    const exp = (entry.Expansion ?? [0, 0, 0, 0]) as Vec4;
    const qw = pw + exp[0] + exp[2], qh = ph + exp[1] + exp[3];
    const t = m.Tessellation;
    // §7 per-axis unit rule: X decided by t[2] (right), Y by t[1] (top). ≤1 ⇒ fraction units.
    if (handle.axis === 'x') {
      const frac = qw > 0 ? Math.min(0.5, Math.max(0, wx / qw)) : 0;
      // index 1 = left band edge (distance from left); index 4 = right (distance from right).
      const distPt = handle.index === 1 ? frac * qw : (1 - frac) * qw;
      const fractionUnits = (t[2] ?? 0) <= 1;
      const val = fractionUnits ? tessPtToFraction(distPt, qw) : distPt;
      if (handle.index === 1) t[0] = clampNonNeg(val);
      else t[2] = clampNonNeg(val);
    } else {
      const frac = qh > 0 ? Math.min(0.5, Math.max(0, wy / qh)) : 0;
      const distPt = handle.index === 1 ? frac * qh : (1 - frac) * qh;
      const fractionUnits = (t[1] ?? 0) <= 1;
      const val = fractionUnits ? tessPtToFraction(distPt, qh) : distPt;
      if (handle.index === 1) t[1] = clampNonNeg(val);
      else t[3] = clampNonNeg(val);
    }
    return;
  }

  if (handle.kind === 'centerTile' && m.CenterTile) {
    const exp = (entry.Expansion ?? [0, 0, 0, 0]) as Vec4;
    const qw = pw + exp[0] + exp[2], qh = ph + exp[1] + exp[3];
    const c = m.CenterTile; // pt offsets from drawn-quad center
    const ox = wx - qw / 2, oy = wy - qh / 2;
    if (handle.edge === 'x0') c[0] = Math.min(ox, c[2]);
    else if (handle.edge === 'x1') c[2] = Math.max(ox, c[0]);
    else if (handle.edge === 'y0') c[1] = Math.min(oy, c[3]);
    else if (handle.edge === 'y1') c[3] = Math.max(oy, c[1]);
    return;
  }

  if ((handle.kind === 'margin' || handle.kind === 'padding')) {
    const exp = (entry.Expansion ?? [0, 0, 0, 0]) as Vec4;
    const qw = pw + exp[0] + exp[2], qh = ph + exp[1] + exp[3];
    // Layout rect in world pt.
    const lx0 = exp[0], ly0 = exp[1], lx1 = qw - exp[2], ly1 = qh - exp[3];
    if (handle.kind === 'margin' && m.Margin) {
      const g = m.Margin; // outside the layout rect
      if (handle.side === 'l') g[0] = Math.max(0, lx0 - wx);
      else if (handle.side === 'r') g[2] = Math.max(0, wx - lx1);
      else if (handle.side === 't') g[1] = Math.max(0, ly0 - wy);
      else if (handle.side === 'b') g[3] = Math.max(0, wy - ly1);
    } else if (handle.kind === 'padding' && m.Padding) {
      const g = m.Padding; // inside the layout rect
      if (handle.side === 'l') g[0] = Math.max(0, wx - lx0);
      else if (handle.side === 'r') g[2] = Math.max(0, lx1 - wx);
      else if (handle.side === 't') g[1] = Math.max(0, wy - ly0);
      else if (handle.side === 'b') g[3] = Math.max(0, ly1 - wy);
    }
  }
}

function clampNonNeg(n: number): number { return n < 0 ? 0 : n; }

// Build the full OverlayModel from the current entry/view (or, mid-drag, from `dragModel`).
function buildOverlayModel(): OverlayModel | null {
  const entry = state.doc && state.selected ? state.doc.root[state.selected] : null;
  if (!entry) return null;
  const expansion = (dragModel?.Expansion ?? entry.Expansion ?? [0, 0, 0, 0]) as Vec4;
  const [w, h] = expandedSize(panel, expansion);
  const tess = (dragModel?.Tessellation ?? entry.Tessellation ?? [0, 0, 0, 0]) as Vec4;
  const ct = (dragModel?.CenterTile ?? entry.CenterTile ?? [1, 1, -1, -1]) as Vec4;
  const style = entry.Style ?? {};
  const margin = (dragModel?.Margin ?? style.Margin) as Vec4 | undefined;
  const padding = (dragModel?.Padding ?? style.Padding) as Vec4 | undefined;
  const minSize = style.MinSize as Vec2 | undefined;

  let bandsX: number[] | undefined, bandsY: number[] | undefined;
  if (w > 0 && h > 0) {
    try {
      const bands = computeBands(tess, ct, [w, h]);
      bandsX = bands.positionsX; bandsY = bands.positionsY;
    } catch { /* invalid size — skip cuts */ }
  }

  return {
    drawnQuadPt: { w, h },
    layoutFrac: layoutRectFraction(panel, expansion),
    bandsX, bandsY,
    centerTile: { x0: ct[0], y0: ct[1], x1: ct[2], y1: ct[3] },
    margin: margin ? { l: margin[0], t: margin[1], r: margin[2], b: margin[3] } : undefined,
    padding: padding ? { l: padding[0], t: padding[1], r: padding[2], b: padding[3] } : undefined,
    minSize: minSize ? { w: minSize[0], h: minSize[1] } : undefined,
  };
}

// Build the OverlayModel from the current entry/view and redraw the 2D guides.
function redrawOverlay(): void {
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;
  const model = buildOverlayModel();
  if (!model) { ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); return; }
  drawOverlay(ctx, view, model, toggles);
  // Test/inspection hook: publish the layout-rect screen bbox (px within the overlay canvas) so
  // e2e can target draggable ring edges without re-deriving the view transform.
  const { w, h } = model.drawnQuadPt;
  const a = worldToScreen(view, model.layoutFrac.x0 * w, model.layoutFrac.y0 * h);
  const b = worldToScreen(view, model.layoutFrac.x1 * w, model.layoutFrac.y1 * h);
  overlayCanvas.dataset.layoutL = String(a.x);
  overlayCanvas.dataset.layoutT = String(a.y);
  overlayCanvas.dataset.layoutR = String(b.x);
  overlayCanvas.dataset.layoutB = String(b.y);
}

/**
 * Update the preview in place, rebuilding PreviewInput from the current entry
 * and calling renderer.render(). No-ops safely if there is no selected border
 * or if the renderer has not been mounted yet.
 *
 * This is the hot path — it never constructs a new renderer or touches the DOM
 * beyond what render() itself does on the canvas. It also repositions the GL
 * canvas under the current view and redraws the overlay so both stay aligned.
 */
export function updatePreview(): void {
  if (!state.doc || !state.selected || !renderer) return;

  const entry = state.doc.root[state.selected];
  const mm = readMaskMode(entry);
  const maskMode: 0 | 1 | 2 = mm === 'none' ? 0 : mm === '#OVERLAY' ? 2 : 1;
  const input: PreviewInput = {
    mask: layerInput('mask'),
    overlay: layerInput('overlay'),
    tessellation: (entry.Tessellation ?? [0, 0, 0, 0]) as Vec4,
    centerTile: (entry.CenterTile ?? [1, 1, -1, -1]) as Vec4,
    panelSize: panel,
    showOverlayRegion,
    maskMode,
    expansion: (entry.Expansion ?? [0, 0, 0, 0]) as Vec4,
  };
  try { renderer.render(input); } catch (e) { console.error('preview:', e); }
  // Keep GL + overlay pixel-aligned under the current view.
  layoutGlCanvas();
  redrawOverlay();
}

/**
 * Legacy wrapper kept for any callers that still import renderPreviewPanel.
 * Calls mountPreview when the canvas is absent, then updatePreview.
 * @deprecated Use mountPreview + updatePreview directly.
 */
export function renderPreviewPanel(host: HTMLElement): void {
  if (!host.querySelector('#preview-canvas')) {
    mountPreview(host);
  }
  updatePreview();
}
