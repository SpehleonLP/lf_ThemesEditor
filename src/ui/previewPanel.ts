import { PreviewRenderer, type PreviewInput, type PreviewLayer } from '../preview/renderer';
import { state, type LayerName } from './state';
import type { Vec4 } from '../types';
import { readMaskMode } from '../maskMode';
import { expandedSize, layoutRectFraction } from '../preview/geometry';
import { drawOverlay, screenToWorld, type OverlayModel, type OverlayView } from './previewOverlay';

// Module-level preview state — these are VIEW state, not document state.
// Changing them calls updatePreview() only; they never touch notify() or state.dirty.
let renderer: PreviewRenderer | null = null;
let panel: [number, number] = [240, 160];
let showOverlayRegion = false;

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

  wireGestures(stage);

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

// Build the OverlayModel from the current entry/view and redraw the 2D guides.
function redrawOverlay(): void {
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;
  const { w, h, expansion } = drawnQuad();
  const model: OverlayModel = {
    drawnQuadPt: { w, h },
    layoutFrac: layoutRectFraction(panel, expansion),
  };
  drawOverlay(ctx, view, model, { expansion: true });
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
