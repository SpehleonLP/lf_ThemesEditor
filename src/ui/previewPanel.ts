import { PreviewRenderer, type PreviewInput, type PreviewLayer } from '../preview/renderer';
import { state, type LayerName } from './state';
import type { Vec4 } from '../types';
import { readMaskMode } from '../maskMode';

// Module-level preview state — these are VIEW state, not document state.
// Changing them calls updatePreview() only; they never touch notify() or state.dirty.
let renderer: PreviewRenderer | null = null;
let panel: [number, number] = [240, 160];
let showOverlayRegion = false;

function layerInput(name: LayerName): PreviewLayer | null {
  const L = state.layers?.[name];
  if (!L?.image || !L.cells) return null;
  return {
    image: L.image, cells: L.cells,
    edgeFill: L.edgeFill,
    centerFill: L.centerFill,
  };
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
    <canvas id="preview-canvas" width="512" height="384"
      style="margin:8px;background:repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 0 0 / 16px 16px"></canvas>`;

  // Construct the renderer once, bound to the canvas that was just created.
  renderer = new PreviewRenderer(host.querySelector('#preview-canvas')!);

  // Wire W/H and overlay controls: they update VIEW state only, never notify() / state.dirty.
  const rerun = () => {
    const num = (s: string, d: number) => { const n = Number(s); return n > 0 ? n : d; };
    panel = [num((host.querySelector('#pv-w') as HTMLInputElement).value, panel[0]),
             num((host.querySelector('#pv-h') as HTMLInputElement).value, panel[1])];
    showOverlayRegion = (host.querySelector('#pv-og') as HTMLInputElement).checked;
    // Preview-only: do NOT call notify() or set state.dirty here.
    updatePreview();
  };
  ['#pv-w', '#pv-h', '#pv-og'].forEach((s) => { (host.querySelector(s) as HTMLInputElement).onchange = rerun; });
}

/**
 * Update the preview in place, rebuilding PreviewInput from the current entry
 * and calling renderer.render(). No-ops safely if there is no selected border
 * or if the renderer has not been mounted yet.
 *
 * This is the hot path — it never constructs a new renderer or touches the DOM
 * beyond what render() itself does on the canvas.
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
