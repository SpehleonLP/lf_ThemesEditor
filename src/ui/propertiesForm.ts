import { writeFileBytes } from '../api';
import { applyLayerToEntry, serializeDocument } from '../document';
import { state, notify } from './state';

const FILLS = ['STRETCH', 'TILE', 'SNAP', 'FLEXIBLE', 'CENTER'];

function vec4Inputs(id: string, v: number[] | undefined, def: number[]): string {
  const vals = v ?? def;
  return [0, 1, 2, 3].map((i) =>
    `<input type="number" step="any" data-edge="${id}" data-i="${i}" value="${vals[i]}" style="width:60px">`).join('');
}

function fillSelect(id: string, cur: string): string {
  return `<select data-fill="${id}">${FILLS.map((f) =>
    `<option ${f === cur ? 'selected' : ''}>${f}</option>`).join('')}</select>`;
}

export function renderPropertiesForm(host: HTMLElement): void {
  if (!state.doc || !state.selected || !state.layers) { host.innerHTML = ''; return; }
  const entry = state.doc.root[state.selected];
  const L = state.layers[state.activeLayer];
  host.innerHTML = `
    <h3 style="margin:8px">${state.selected} — ${state.activeLayer}</h3>
    <div style="padding:8px;display:grid;gap:6px">
      <label>EdgeFill x/y: ${fillSelect('edge0', L.edgeFill[0])} ${fillSelect('edge1', L.edgeFill[1])}</label>
      <label>CenterFill x/y: ${fillSelect('center0', L.centerFill[0])} ${fillSelect('center1', L.centerFill[1])}</label>
      <label>Tessellation (l,t,r,b): ${vec4Inputs('Tessellation', entry.Tessellation, [0, 0, 0, 0])}</label>
      <label>Expansion (l,t,r,b): ${vec4Inputs('Expansion', entry.Expansion, [0, 0, 0, 0])}</label>
      <label>CenterTile (x0,y0,x1,y1): ${vec4Inputs('CenterTile', entry.CenterTile, [1, 1, -1, -1])}</label>
      <fieldset><legend>Style</legend>
        <label>Margin: ${vec4Inputs('Style.Margin', entry.Style?.Margin, [0, 0, 0, 0])}</label>
        <label>Padding: ${vec4Inputs('Style.Padding', entry.Style?.Padding, [0, 0, 0, 0])}</label>
        <label>MinSize w/h:
          <input type="number" data-edge="Style.MinSize" data-i="0" value="${entry.Style?.MinSize?.[0] ?? 0}" style="width:60px">
          <input type="number" data-edge="Style.MinSize" data-i="1" value="${entry.Style?.MinSize?.[1] ?? 0}" style="width:60px"></label>
      </fieldset>
      <button id="save" ${state.dirty ? '' : 'disabled'}>Save borders.json</button>
      <div id="save-status"></div>
    </div>`;

  host.querySelectorAll<HTMLSelectElement>('select[data-fill]').forEach((s) => {
    s.onchange = () => {
      const which = s.dataset.fill!;
      const tgt = which.startsWith('edge') ? L.edgeFill : L.centerFill;
      tgt[Number(which.slice(-1))] = s.value as any;
      state.dirty = true; notify();
    };
  });
  host.querySelectorAll<HTMLInputElement>('input[data-edge]').forEach((inp) => {
    inp.onchange = () => {
      const parts = inp.dataset.edge!.split('.'); // 'Tessellation' or 'Style.Margin'
      let tgt = entry;
      for (const k of parts.slice(0, -1)) tgt = tgt[k] ??= {};
      const f = parts[parts.length - 1];
      if (!Array.isArray(tgt[f]))
        tgt[f] = f === 'CenterTile' ? [1, 1, -1, -1] : f === 'MinSize' ? [0, 0] : [0, 0, 0, 0];
      tgt[f][Number(inp.dataset.i)] = Number(inp.value);
      state.dirty = true; notify();
    };
  });
  (host.querySelector('#save') as HTMLButtonElement).onclick = async () => {
    applyLayerToEntry(entry, 'Mask', state.layers!.mask.cells && entryHasOwnCells(entry, 'Mask')
      ? { cells: state.layers!.mask.cells, edgeFill: state.layers!.mask.edgeFill as any, centerFill: state.layers!.mask.centerFill as any }
      : { cells: null, edgeFill: state.layers!.mask.edgeFill as any, centerFill: state.layers!.mask.centerFill as any });
    applyLayerToEntry(entry, 'Overlay', { cells: state.layers!.overlay.cells, edgeFill: state.layers!.overlay.edgeFill as any, centerFill: state.layers!.overlay.centerFill as any });
    await writeFileBytes('borders.json', serializeDocument(state.doc!));
    state.dirty = false;
    (host.querySelector('#save-status') as HTMLElement).textContent = `saved ${new Date().toLocaleTimeString()}`;
    notify();
  };
}

function entryHasOwnCells(entry: any, key: 'Mask' | 'Overlay'): boolean {
  return entry?.[key] && typeof entry[key] !== 'string' && typeof entry[key].Cells !== 'string';
}
