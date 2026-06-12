import { listDir, writeFileBytes } from '../api';
import { defaultCellsForImage } from '../cells';
import { applyPackResult } from '../document';
import { serializeFile } from '../package/model';
import { loadImage, SUPPORTED_IMAGE_EXTS } from '../images';
import { encodePng } from '../png';
import { packLayer, type PackLayerInput } from '../packer';
import { state, notify, type LayerName } from './state';

const SOURCE_ART_DIR = 'SourceArt';

// Set a source image on the active layer (both layers when linked), load it, seed default
// cells if the layer has none yet, then re-render. Path is relative to the Gui root.
async function pickSource(path: string, status: HTMLElement): Promise<void> {
  if (!state.layers) return;
  const targets: LayerName[] = state.linked ? ['mask', 'overlay'] : [state.activeLayer];
  try {
    const image = await loadImage(path);
    for (const name of targets) {
      const ls = state.layers[name];
      ls.imagePath = path;
      ls.image = image;
      if (!ls.cells) ls.cells = defaultCellsForImage([image.width, image.height]);
    }
    state.dirty = true;
    status.textContent = `loaded ${path} (${image.width}×${image.height})`;
    notify();
  } catch (e) {
    status.textContent = `load ${path}: ${String(e)}`;
  }
}

export function renderExportPanel(host: HTMLElement): void {
  if (!state.selected || !state.layers) { host.innerHTML = ''; return; }
  const current = state.layers[state.activeLayer].imagePath ?? '';
  host.innerHTML = `
    <div style="padding:8px;border-top:1px solid #444">
      <h4 style="margin:4px 0">Source image (${state.linked ? 'both layers' : state.activeLayer})</h4>
      <div style="display:flex;gap:4px">
        <input id="pk-src" type="text" value="${current.replace(/"/g, '&quot;')}" placeholder="SourceArt/foo.psd" style="flex:1">
        <button id="pk-src-load">Load</button>
      </div>
      <select id="pk-src-browse" style="width:100%;margin-top:4px"><option value="">browse ${SOURCE_ART_DIR}/…</option></select>
      <h4 style="margin:8px 0 4px">Pack &amp; export</h4>
      <label>gutter <input id="pk-gutter" type="number" value="8" style="width:50px"></label>
      <button id="pk-go">Pack → PNG + JSON</button>
      <div id="pk-status"></div>
    </div>`;
  const status = host.querySelector('#pk-status') as HTMLElement;
  const srcInput = host.querySelector('#pk-src') as HTMLInputElement;
  (host.querySelector('#pk-src-load') as HTMLButtonElement).onclick = () => {
    const p = srcInput.value.trim();
    if (p) void pickSource(p, status);
  };
  const browse = host.querySelector('#pk-src-browse') as HTMLSelectElement;
  void listDir(SOURCE_ART_DIR).then((entries) => {
    for (const e of entries) {
      if (e.dir) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase();
      if (!SUPPORTED_IMAGE_EXTS.includes(ext as (typeof SUPPORTED_IMAGE_EXTS)[number])) continue;
      const opt = document.createElement('option');
      opt.value = `${SOURCE_ART_DIR}/${e.name}`;
      opt.textContent = e.name;
      browse.appendChild(opt);
    }
  }).catch(() => { /* SourceArt dir may not exist yet */ });
  browse.onchange = () => {
    if (browse.value) { srcInput.value = browse.value; void pickSource(browse.value, status); }
  };
  (host.querySelector('#pk-go') as HTMLButtonElement).onclick = async () => {
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
      if (!state.file) throw new Error('borders file not loaded');
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
      await writeFileBytes('borders.json', serializeFile(state.file));
      state.file.dirty = false;
      state.dirty = false;
      status.textContent = `packed → ${Object.values(paths).join(', ')}`;
      notify();
    } catch (e) {
      status.textContent = (wroteSheets ? 'sheets written but export failed: ' : '') + String(e);
    }
  };
}
