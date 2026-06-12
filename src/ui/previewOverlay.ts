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
  // 3.2 box-model overlays. All in the same world-pt space as the drawn quad (origin top-left).
  // Inner band cut positions (0..1 of drawn quad). positionsX/Y[1] and [4] are the draggable cuts.
  bandsX?: number[];
  bandsY?: number[];
  // CenterTile box as pt offsets from the drawn-quad CENTER ([x0,y0,x1,y1]); collapsed = [1,1,-1,-1].
  centerTile?: { x0: number; y0: number; x1: number; y1: number };
  // Box-model insets in pt (l,t,r,b), relative to the layout rect.
  margin?: { l: number; t: number; r: number; b: number };
  padding?: { l: number; t: number; r: number; b: number };
  minSize?: { w: number; h: number };
}

export interface OverlayToggles {
  expansion?: boolean;  // draw layout-rect / expansion ring guide (default on)
  cuts?: boolean;       // band cut lines (tessellation)
  centerTile?: boolean; // center-tile box
  boxModel?: boolean;   // margin/padding/min-size
}

// A draggable overlay edge under a screen point. Pure data — previewPanel maps it to an entry edit.
export type Handle =
  | { kind: 'expansion'; side: 'l' | 't' | 'r' | 'b' }
  | { kind: 'cut'; axis: 'x' | 'y'; index: 1 | 4 }
  | { kind: 'centerTile'; edge: 'x0' | 'y0' | 'x1' | 'y1' }
  | { kind: 'margin'; side: 'l' | 't' | 'r' | 'b' }
  | { kind: 'padding'; side: 'l' | 't' | 'r' | 'b' };

// Pure world(pt)->screen(px) mapping. Exported so previewPanel and 3.2 hit-testing share it.
export function worldToScreen(view: OverlayView, x: number, y: number): { x: number; y: number } {
  return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY };
}
export function screenToWorld(view: OverlayView, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
}

const HIT_PX = 6; // screen-px tolerance band around an edge for hit-testing.

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

  // Layout-rect fractions in world pt.
  const f = model.layoutFrac;
  const lx0 = f.x0 * w, ly0 = f.y0 * h, lx1 = f.x1 * w, ly1 = f.y1 * h;

  // ── Expansion ring: tinted band between drawn quad and layout rect, + dashed layout rect. ──
  if (toggles.expansion !== false) {
    const a = worldToScreen(view, lx0, ly0);
    const b = worldToScreen(view, lx1, ly1);
    // Tint the ring (drawn quad minus layout rect) using even-odd fill.
    ctx.save();
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fillStyle = 'rgba(255,150,60,0.14)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,210,90,0.95)';
    strokeRectPx(ctx, a.x, a.y, b.x, b.y);
    ctx.restore();
  }

  // ── Tessellation cut lines at positionsX/Y[1] and [4] (0..1 of drawn quad). ──
  if (toggles.cuts && model.bandsX && model.bandsY) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(120,255,160,0.9)';
    for (const i of [1, 4] as const) {
      const xv = model.bandsX[i];
      const p0 = worldToScreen(view, xv * w, 0);
      const p1 = worldToScreen(view, xv * w, h);
      linePx(ctx, p0.x, p0.y, p1.x, p1.y);
    }
    for (const i of [1, 4] as const) {
      const yv = model.bandsY[i];
      const p0 = worldToScreen(view, 0, yv * h);
      const p1 = worldToScreen(view, w, yv * h);
      linePx(ctx, p0.x, p0.y, p1.x, p1.y);
    }
    ctx.restore();
  }

  // ── CenterTile box (band-2 region), or crosshair when collapsed. ──
  if (toggles.centerTile && model.centerTile) {
    const c = model.centerTile;
    const cx = w / 2, cy = h / 2;
    if (isCollapsedCT(c)) {
      // Crosshair at the drawn-quad center: "enable center tile" affordance.
      const m = worldToScreen(view, cx, cy);
      ctx.save();
      ctx.strokeStyle = 'rgba(220,140,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      linePx(ctx, m.x - 8, m.y, m.x + 8, m.y);
      linePx(ctx, m.x, m.y - 8, m.x, m.y + 8);
      ctx.restore();
    } else {
      const a = worldToScreen(view, cx + c.x0, cy + c.y0);
      const b = worldToScreen(view, cx + c.x1, cy + c.y1);
      ctx.save();
      ctx.strokeStyle = 'rgba(220,140,255,0.95)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      strokeRectPx(ctx, a.x, a.y, b.x, b.y);
      ctx.restore();
    }
  }

  // ── Box model: nested margin (outside layout) / padding (inside) / min-size (dotted). ──
  if (toggles.boxModel) {
    if (model.margin) {
      const m = model.margin;
      const a = worldToScreen(view, lx0 - m.l, ly0 - m.t);
      const b = worldToScreen(view, lx1 + m.r, ly1 + m.b);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      strokeRectPx(ctx, a.x, a.y, b.x, b.y);
      ctx.restore();
    }
    if (model.padding) {
      const p = model.padding;
      const a = worldToScreen(view, lx0 + p.l, ly0 + p.t);
      const b = worldToScreen(view, lx1 - p.r, ly1 - p.b);
      ctx.save();
      ctx.strokeStyle = 'rgba(120,200,120,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      strokeRectPx(ctx, a.x, a.y, b.x, b.y);
      ctx.restore();
    }
    if (model.minSize && (model.minSize.w > 0 || model.minSize.h > 0)) {
      // Display-only: dotted box centered on the drawn quad.
      const cx = w / 2, cy = h / 2;
      const a = worldToScreen(view, cx - model.minSize.w / 2, cy - model.minSize.h / 2);
      const b = worldToScreen(view, cx + model.minSize.w / 2, cy + model.minSize.h / 2);
      ctx.save();
      ctx.strokeStyle = 'rgba(200,200,200,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      strokeRectPx(ctx, a.x, a.y, b.x, b.y);
      ctx.restore();
    }
  }
}

// Pure hit-test: returns the draggable edge under the screen point, honoring the toggle set so
// only visible overlays are interactive. MinSize is display-only (never returned).
export function hitOverlay(
  view: OverlayView,
  model: OverlayModel,
  toggles: OverlayToggles,
  sx: number,
  sy: number,
): Handle | null {
  const { w, h } = model.drawnQuadPt;
  if (w <= 0 || h <= 0) return null;
  const f = model.layoutFrac;
  const lx0 = f.x0 * w, ly0 = f.y0 * h, lx1 = f.x1 * w, ly1 = f.y1 * h;

  // Helper: is screen point near a vertical world-x line within the world-y span?
  const nearVX = (wx: number, y0: number, y1: number): boolean => {
    const s = worldToScreen(view, wx, 0);
    if (Math.abs(sx - s.x) > HIT_PX) return false;
    const a = worldToScreen(view, wx, y0).y, b = worldToScreen(view, wx, y1).y;
    return sy >= Math.min(a, b) - HIT_PX && sy <= Math.max(a, b) + HIT_PX;
  };
  const nearHY = (wy: number, x0: number, x1: number): boolean => {
    const s = worldToScreen(view, 0, wy);
    if (Math.abs(sy - s.y) > HIT_PX) return false;
    const a = worldToScreen(view, x0, wy).x, b = worldToScreen(view, x1, wy).x;
    return sx >= Math.min(a, b) - HIT_PX && sx <= Math.max(a, b) + HIT_PX;
  };

  // Box model (highest priority: outermost/innermost, harder to overlap).
  if (toggles.boxModel) {
    if (model.margin) {
      const m = model.margin;
      if (nearVX(lx0 - m.l, ly0 - m.t, ly1 + m.b)) return { kind: 'margin', side: 'l' };
      if (nearVX(lx1 + m.r, ly0 - m.t, ly1 + m.b)) return { kind: 'margin', side: 'r' };
      if (nearHY(ly0 - m.t, lx0 - m.l, lx1 + m.r)) return { kind: 'margin', side: 't' };
      if (nearHY(ly1 + m.b, lx0 - m.l, lx1 + m.r)) return { kind: 'margin', side: 'b' };
    }
    if (model.padding) {
      const p = model.padding;
      if (nearVX(lx0 + p.l, ly0 + p.t, ly1 - p.b)) return { kind: 'padding', side: 'l' };
      if (nearVX(lx1 - p.r, ly0 + p.t, ly1 - p.b)) return { kind: 'padding', side: 'r' };
      if (nearHY(ly0 + p.t, lx0 + p.l, lx1 - p.r)) return { kind: 'padding', side: 't' };
      if (nearHY(ly1 - p.b, lx0 + p.l, lx1 - p.r)) return { kind: 'padding', side: 'b' };
    }
  }

  // CenterTile edges (non-collapsed only; collapsed crosshair is handled by an explicit affordance).
  if (toggles.centerTile && model.centerTile && !isCollapsedCT(model.centerTile)) {
    const c = model.centerTile;
    const cx = w / 2, cy = h / 2;
    if (nearVX(cx + c.x0, cy + c.y0, cy + c.y1)) return { kind: 'centerTile', edge: 'x0' };
    if (nearVX(cx + c.x1, cy + c.y0, cy + c.y1)) return { kind: 'centerTile', edge: 'x1' };
    if (nearHY(cy + c.y0, cx + c.x0, cx + c.x1)) return { kind: 'centerTile', edge: 'y0' };
    if (nearHY(cy + c.y1, cx + c.x0, cx + c.x1)) return { kind: 'centerTile', edge: 'y1' };
  }

  // Tessellation cuts.
  if (toggles.cuts && model.bandsX && model.bandsY) {
    for (const i of [1, 4] as const) {
      if (nearVX(model.bandsX[i] * w, 0, h)) return { kind: 'cut', axis: 'x', index: i };
    }
    for (const i of [1, 4] as const) {
      if (nearHY(model.bandsY[i] * h, 0, w)) return { kind: 'cut', axis: 'y', index: i };
    }
  }

  // Expansion ring edges (layout-rect boundary).
  if (toggles.expansion !== false) {
    if (nearVX(lx0, ly0, ly1)) return { kind: 'expansion', side: 'l' };
    if (nearVX(lx1, ly0, ly1)) return { kind: 'expansion', side: 'r' };
    if (nearHY(ly0, lx0, lx1)) return { kind: 'expansion', side: 't' };
    if (nearHY(ly1, lx0, lx1)) return { kind: 'expansion', side: 'b' };
  }

  return null;
}

function isCollapsedCT(c: { x0: number; y0: number; x1: number; y1: number }): boolean {
  // Engine collapse sentinel is [1,1,-1,-1] (x1<x0 / y1<y0). Treat any inverted box as collapsed.
  return c.x1 <= c.x0 || c.y1 <= c.y0;
}

// Stroke a rect from two screen-space corners, snapped to the half-pixel grid for crisp 1px lines.
function strokeRectPx(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const sx = Math.round(Math.min(x0, x1)) + 0.5;
  const sy = Math.round(Math.min(y0, y1)) + 0.5;
  const w = Math.round(Math.abs(x1 - x0));
  const h = Math.round(Math.abs(y1 - y0));
  ctx.strokeRect(sx, sy, w, h);
}

function linePx(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
  ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.stroke();
}
