import { PreviewRenderer, type PreviewInput, type PreviewLayer } from '../preview/renderer';
import { state, type LayerName } from './state';
import type { FillMode, Vec4 } from '../types';

let renderer: PreviewRenderer | null = null;
let panel: [number, number] = [240, 160];
let showOverlayRegion = false;

function layerInput(name: LayerName): PreviewLayer | null {
  const L = state.layers?.[name];
  if (!L?.image || !L.cells) return null;
  return {
    image: L.image, cells: L.cells,
    edgeFill: L.edgeFill as [FillMode, FillMode],
    centerFill: L.centerFill as [FillMode, FillMode],
  };
}

export function renderPreviewPanel(host: HTMLElement): void {
  if (!state.doc || !state.selected) { host.innerHTML = ''; renderer = null; return; }
  if (!host.querySelector('#preview-canvas')) {
    host.innerHTML = `
      <h3 style="margin:8px">Preview</h3>
      <div style="padding:0 8px;display:flex;gap:8px">
        <label>w <input id="pv-w" type="number" value="${panel[0]}" style="width:60px"></label>
        <label>h <input id="pv-h" type="number" value="${panel[1]}" style="width:60px"></label>
        <label><input id="pv-og" type="checkbox" ${showOverlayRegion ? 'checked' : ''}> show G-region</label>
      </div>
      <canvas id="preview-canvas" width="512" height="384"
        style="margin:8px;background:repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 0 0 / 16px 16px"></canvas>`;
    renderer = new PreviewRenderer(host.querySelector('#preview-canvas')!);
    const rerun = () => {
      panel = [Number((host.querySelector('#pv-w') as HTMLInputElement).value),
               Number((host.querySelector('#pv-h') as HTMLInputElement).value)];
      showOverlayRegion = (host.querySelector('#pv-og') as HTMLInputElement).checked;
      renderPreviewPanel(host);
    };
    ['#pv-w', '#pv-h', '#pv-og'].forEach((s) => { (host.querySelector(s) as HTMLInputElement).onchange = rerun; });
  }
  const entry = state.doc.root[state.selected];
  const input: PreviewInput = {
    mask: layerInput('mask'),
    overlay: layerInput('overlay'),
    tessellation: (entry.Tessellation ?? [0, 0, 0, 0]) as Vec4,
    centerTile: (entry.CenterTile ?? [1, 1, -1, -1]) as Vec4,
    panelSize: panel,
    showOverlayRegion,
  };
  try { renderer!.render(input); } catch (e) { console.error('preview:', e); }
}
