import { PreviewRenderer, type PreviewInput, type PreviewLayer } from '../preview/renderer';
import { state, type LayerName } from './state';
import type { Vec4 } from '../types';
import { readMaskMode } from '../maskMode';

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

export function renderPreviewPanel(host: HTMLElement): void {
  if (!state.doc || !state.selected) {
    renderer?.dispose();
    renderer = null;
    host.innerHTML = '';
    return;
  }
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
      const num = (s: string, d: number) => { const n = Number(s); return n > 0 ? n : d; };
      panel = [num((host.querySelector('#pv-w') as HTMLInputElement).value, panel[0]),
               num((host.querySelector('#pv-h') as HTMLInputElement).value, panel[1])];
      showOverlayRegion = (host.querySelector('#pv-og') as HTMLInputElement).checked;
      renderPreviewPanel(host);
    };
    ['#pv-w', '#pv-h', '#pv-og'].forEach((s) => { (host.querySelector(s) as HTMLInputElement).onchange = rerun; });
  }
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
  try { renderer!.render(input); } catch (e) { console.error('preview:', e); }
}
