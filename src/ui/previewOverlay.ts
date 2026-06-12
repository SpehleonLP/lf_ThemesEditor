// Pure 2D overlay draw for the borders preview. Takes ctx + view + model + toggles only —
// NO app/document state — so it stays unit-testable and the 3.2 hit-testing can reuse the
// same world->screen mapping. The overlay canvas is stacked exactly over the WebGL canvas and
// shares the same `view` transform; previewPanel positions the GL canvas through the same view
// so the GL-rendered drawn quad lands on the drawn-quad outline drawn here.
//
// World space = drawn (expanded) quad pt, origin at the quad's top-left (y-down). The GL render
// maps the 0..1 drawn-quad fractions to the full GL canvas, so world (0,0)..(w,h) is the quad.
export interface OverlayView {
  zoom: number; // screen px per world pt
  panX: number; // screen px offset of world origin
  panY: number;
}

export interface OverlayModel {
  drawnQuadPt: { w: number; h: number }; // drawn (expanded) quad size in pt
  layoutFrac: { x0: number; y0: number; x1: number; y1: number }; // from layoutRectFraction (0..1 of quad)
  // hooks for 3.2 (drawn later): inner band positions, center-tile box, box-model insets.
  bandsX?: number[];
  bandsY?: number[];
  centerTileBox?: { x0: number; y0: number; x1: number; y1: number };
  margin?: { l: number; t: number; r: number; b: number };
  padding?: { l: number; t: number; r: number; b: number };
  minSize?: { w: number; h: number };
}

export interface OverlayToggles {
  expansion?: boolean;  // draw layout-rect / expansion guide (default on)
  cuts?: boolean;       // 3.2: band cut lines
  centerTile?: boolean; // 3.2: center-tile box
  boxModel?: boolean;   // 3.2: margin/padding/min-size
}

// Pure world(pt)->screen(px) mapping. Exported so previewPanel and 3.2 hit-testing share it.
export function worldToScreen(view: OverlayView, x: number, y: number): { x: number; y: number } {
  return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY };
}
export function screenToWorld(view: OverlayView, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  view: OverlayView,
  model: OverlayModel,
  toggles: OverlayToggles,
): void {
  const cv = ctx.canvas;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const { w, h } = model.drawnQuadPt;
  if (w <= 0 || h <= 0) return;

  // Drawn-quad outline (solid). Corners map exactly to the GL canvas edges under the shared view.
  const tl = worldToScreen(view, 0, 0);
  const br = worldToScreen(view, w, h);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(140,200,255,0.9)';
  strokeRectPx(ctx, tl.x, tl.y, br.x, br.y);
  ctx.restore();

  // Layout rect (dashed): inset from the drawn quad by Expansion, via layoutFrac fractions.
  // With zero expansion this equals the drawn quad (dashed lands on solid).
  if (toggles.expansion !== false) {
    const f = model.layoutFrac;
    const a = worldToScreen(view, f.x0 * w, f.y0 * h);
    const b = worldToScreen(view, f.x1 * w, f.y1 * h);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,210,90,0.95)';
    strokeRectPx(ctx, a.x, a.y, b.x, b.y);
    ctx.restore();
  }

  // Hooks for 3.2: bands / center-tile / box-model are intentionally NOT drawn yet.
}

// Stroke a rect from two screen-space corners, snapped to the half-pixel grid for crisp 1px lines.
function strokeRectPx(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const sx = Math.round(Math.min(x0, x1)) + 0.5;
  const sy = Math.round(Math.min(y0, y1)) + 0.5;
  const w = Math.round(Math.abs(x1 - x0));
  const h = Math.round(Math.abs(y1 - y0));
  ctx.strokeRect(sx, sy, w, h);
}
