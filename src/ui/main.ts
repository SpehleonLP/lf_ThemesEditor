import { parseCellsJson, toEditorGrid, resolveInfinity } from '../cells';
import { loadImage } from '../images';
import { state, notify, type LayerState } from './state';
import type { FillMode, Rgba } from '../types';
import { resetGridMode } from './rectEditor';
import { editorSourceCells, type EditorSource } from '../editorReadback';

async function loadLayer(entry: any, key: 'Mask' | 'Overlay'): Promise<LayerState> {
  const ls: LayerState = { imagePath: null, image: null, cells: null, edgeFill: ['STRETCH', 'STRETCH'] as [FillMode, FillMode], centerFill: ['STRETCH', 'STRETCH'] as [FillMode, FillMode] };
  const raw = entry?.[key];
  if (raw == null || typeof raw === 'string') return ls; // absent, or Mask:"#OVERLAY"
  ls.imagePath = raw.Image ?? null;
  if (raw.EdgeFill) ls.edgeFill = [String(raw.EdgeFill[0]).toUpperCase(), String(raw.EdgeFill[1]).toUpperCase()] as [FillMode, FillMode];
  if (raw.CenterFill) ls.centerFill = [String(raw.CenterFill[0]).toUpperCase(), String(raw.CenterFill[1]).toUpperCase()] as [FillMode, FillMode];
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

// Read an entry's per-layer fill modes (EdgeFill/CenterFill) for read-back, defaulting to STRETCH.
function fillsFor(entry: any, key: 'Mask' | 'Overlay'): { edgeFill: [FillMode, FillMode]; centerFill: [FillMode, FillMode] } {
  const raw = entry?.[key];
  const def: [FillMode, FillMode] = ['STRETCH', 'STRETCH'];
  if (raw == null || typeof raw === 'string') return { edgeFill: [...def], centerFill: [...def] };
  const edgeFill = raw.EdgeFill
    ? [String(raw.EdgeFill[0]).toUpperCase(), String(raw.EdgeFill[1]).toUpperCase()] as [FillMode, FillMode]
    : [...def] as [FillMode, FillMode];
  const centerFill = raw.CenterFill
    ? [String(raw.CenterFill[0]).toUpperCase(), String(raw.CenterFill[1]).toUpperCase()] as [FillMode, FillMode]
    : [...def] as [FillMode, FillMode];
  return { edgeFill, centerFill };
}

// Build overlay+mask LayerStates from an EditorSource (the original source-space layout), using
// the injected loader for images. Returns null to signal the caller to fall back to the packed
// sheet when any REQUIRED source image fails to load. Pure-ish: no DOM, loader is injectable.
export async function buildSourceLayers(
  entry: any,
  es: EditorSource,
  load: (path: string) => Promise<Rgba>,
): Promise<{ mask: LayerState; overlay: LayerState } | null> {
  try {
    // Load both source images concurrently (parity with the packed path). Any required load that
    // rejects propagates out of Promise.all → caught below → return null. An absent mask source
    // resolves to null without a load, so it never triggers a spurious failure.
    const [overlayImage, maskImage] = await Promise.all([
      es.source.overlay ? load(es.source.overlay) : Promise.resolve(null),
      es.source.mask ? load(es.source.mask) : Promise.resolve(null),
    ]);

    const oFills = fillsFor(entry, 'Overlay');
    const overlay: LayerState = {
      imagePath: es.source.overlay ?? null,
      image: overlayImage,
      cells: es.sourceCells,
      edgeFill: oFills.edgeFill,
      centerFill: oFills.centerFill,
    };

    const mFills = fillsFor(entry, 'Mask');
    const mask: LayerState = es.source.mask
      ? {
          imagePath: es.source.mask,
          image: maskImage,
          // ALWAYS clone: the overlay holds the sole reference to es.sourceCells. Aliasing here
          // would let in-place cell mutations (rectEditor applyDrag / mirrorFromOpposite) on one
          // layer silently corrupt the other — reachable in non-linked Free mode.
          cells: structuredClone(es.sourceCells),
          edgeFill: mFills.edgeFill,
          centerFill: mFills.centerFill,
        }
      : {
          // No mask source → mask mirrors overlay (#COPY semantics): copy image + clone cells.
          imagePath: es.source.overlay ?? null,
          image: overlayImage,
          cells: structuredClone(es.sourceCells),
          edgeFill: mFills.edgeFill,
          centerFill: mFills.centerFill,
        };

    return { mask, overlay };
  } catch (e) {
    console.warn('buildSourceLayers: source image failed to load, falling back to packed sheet:', e);
    return null;
  }
}

export async function selectBorder(name: string): Promise<void> {
  if (!state.doc) return;
  const entry = state.doc.root[name];

  // If this border carries valid Editor metadata, reopen from the SOURCE space (the re-edit loop:
  // pack writes Editor → re-select rebuilds source layers). Falls back to the packed sheet below
  // when there is no Editor meta (all current live borders) or a source image fails to load.
  const es = editorSourceCells(entry);
  if (es) {
    const built = await buildSourceLayers(entry, es, loadImage);
    if (built) {
      resetGridMode();
      state.selected = name;
      state.layers = built;
      state.selectedCell = null;
      state.editingSource = true;
      state.linked = !!es.source.linked; // reopen with the linked checkbox/edit-targeting as authored
      state.saveStatus = null; // reopening from source is not an edit → no dirty
      notify();
      return;
    }
    // Source load failed: warn and fall through to the packed-sheet path.
    state.saveStatus = '<span style="color:#d6a13a">⚠ source image failed to load — editing packed sheet</span>';
  }

  const [mask, overlay] = await Promise.all([
    loadLayer(entry, 'Mask'),
    loadLayer(entry, 'Overlay'),
  ]);
  // #COPY resolution: a null grid copies the other layer's (cpp:857-870 NaN merge)
  if (!mask.cells && overlay.cells) mask.cells = structuredClone(overlay.cells);
  if (!overlay.cells && mask.cells) overlay.cells = structuredClone(mask.cells);
  resetGridMode(); // drop stale grid-line state from the previously-selected border's image
  state.selected = name;
  state.layers = { mask, overlay };
  state.selectedCell = null;
  state.editingSource = false;
  state.linked = false; // normal/packed borders always open unlinked (symmetric with the source path deriving it from authoring); never leak the prior selection's linked state
  if (!es) state.saveStatus = null; // preserve the source-load-failed warning when es was present
  notify();
}
