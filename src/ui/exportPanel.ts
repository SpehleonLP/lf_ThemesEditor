import { writeFileBytes } from '../api';
import { applyPackResult, serializeDocument } from '../document';
import { encodePng } from '../png';
import { packLayer, type PackLayerInput } from '../packer';
import { state, notify } from './state';

export function renderExportPanel(host: HTMLElement): void {
  if (!state.selected || !state.layers) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div style="padding:8px;border-top:1px solid #444">
      <h4 style="margin:4px 0">Pack &amp; export</h4>
      <label>gutter <input id="pk-gutter" type="number" value="8" style="width:50px"></label>
      <button id="pk-go">Pack → PNG + JSON</button>
      <div id="pk-status"></div>
    </div>`;
  (host.querySelector('#pk-go') as HTMLButtonElement).onclick = async () => {
    const status = host.querySelector('#pk-status') as HTMLElement;
    let wroteSheets = false;
    try {
      const raw = Number((host.querySelector('#pk-gutter') as HTMLInputElement).value);
      const gutter = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 8;
      const L = state.layers!;
      const inputs: PackLayerInput[] = [];
      if (L.overlay.image && L.overlay.cells) inputs.push({ name: 'overlay', source: L.overlay.image, cells: L.overlay.cells });
      if (L.mask.image && L.mask.cells) inputs.push({ name: 'mask', source: L.mask.image, cells: L.mask.cells });
      if (!inputs.length) throw new Error('no layers with image+cells to pack');
      const result = packLayer(inputs, { gutter, align: 4, linked: state.linked });
      const paths: Record<string, string> = {};
      for (const sheet of result.sheets) {
        const p = `Images/packed/${state.selected}_${sheet.name}.png`;
        await writeFileBytes(p, encodePng(sheet));
        paths[sheet.name] = p;
      }
      wroteSheets = true;
      const entry = state.doc!.root[state.selected!];
      applyPackResult(entry, {
        overlayImage: paths['overlay'] ?? null,
        maskImage: paths['mask'] ?? null,
        overlayCells: result.cells['overlay'] ?? null,
        maskCells: result.cells['mask'] ?? null,
        linked: state.linked && 'mask' in paths && 'overlay' in paths,
        source: { overlay: L.overlay.imagePath ?? undefined, mask: L.mask.imagePath ?? undefined, linked: state.linked },
        sourceCells: (L.overlay.cells ?? L.mask.cells)!,
        pack: { gutter, align: 4 },
      });
      await writeFileBytes('borders.json', serializeDocument(state.doc!));
      state.dirty = false;
      status.textContent = `packed → ${Object.values(paths).join(', ')}`;
      notify();
    } catch (e) {
      status.textContent = (wroteSheets ? 'sheets written but export failed: ' : '') + String(e);
    }
  };
}
