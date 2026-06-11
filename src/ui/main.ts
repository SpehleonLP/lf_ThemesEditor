import { parseCellsJson, toEditorGrid, resolveInfinity } from '../cells';
import { loadImage } from '../images';
import { state, notify, type LayerState } from './state';
import { exitNinePatch } from './rectEditor';

async function loadLayer(entry: any, key: 'Mask' | 'Overlay'): Promise<LayerState> {
  const ls: LayerState = { imagePath: null, image: null, cells: null, edgeFill: ['STRETCH', 'STRETCH'], centerFill: ['STRETCH', 'STRETCH'] };
  const raw = entry?.[key];
  if (raw == null || typeof raw === 'string') return ls; // absent, or Mask:"#OVERLAY"
  ls.imagePath = raw.Image ?? null;
  if (raw.EdgeFill) ls.edgeFill = [String(raw.EdgeFill[0]).toUpperCase(), String(raw.EdgeFill[1]).toUpperCase()] as [string, string];
  if (raw.CenterFill) ls.centerFill = [String(raw.CenterFill[0]).toUpperCase(), String(raw.CenterFill[1]).toUpperCase()] as [string, string];
  if (ls.imagePath) {
    try { ls.image = await loadImage(ls.imagePath); }
    catch (e) { console.warn(`image ${ls.imagePath}:`, e); }
  }
  const parsed = parseCellsJson(raw.Cells);
  if (parsed.kind === 'grid') {
    const size: [number, number] = ls.image ? [ls.image.width, ls.image.height] : [1, 1];
    ls.cells = toEditorGrid(resolveInfinity(parsed.grid, size));
  }
  return ls;
}

export async function selectBorder(name: string): Promise<void> {
  if (!state.doc) return;
  const entry = state.doc.root[name];
  const [mask, overlay] = await Promise.all([
    loadLayer(entry, 'Mask'),
    loadLayer(entry, 'Overlay'),
  ]);
  // #COPY resolution: a null grid copies the other layer's (cpp:857-870 NaN merge)
  if (!mask.cells && overlay.cells) mask.cells = structuredClone(overlay.cells);
  if (!overlay.cells && mask.cells) overlay.cells = structuredClone(mask.cells);
  exitNinePatch(); // drop stale 9-patch cuts from the previously-selected border's image
  state.selected = name;
  state.layers = { mask, overlay };
  state.selectedCell = null;
  state.saveStatus = null;
  notify();
}
