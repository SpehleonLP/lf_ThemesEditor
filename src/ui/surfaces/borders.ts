// src/ui/surfaces/borders.ts
import type { Surface, SurfaceContext } from './registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { wrapBordersRoot, applyLayerToEntry } from '../../document';
import { state, notify, subscribe, structuralKey, type Panel } from '../state';
import { selectBorder } from '../main';
import { mountSlotList, updateSlotList } from '../slotList';
import { mountCellsPanel, updateCellsPanel } from '../rectEditor';
import { mountGeometryFields, updateGeometryFields } from '../propertiesForm';
import { mountPreview, updatePreview } from '../previewPanel';
import { renderExportPanel } from '../exportPanel';

// Push the in-memory layer fill/cell edits back onto the shared root so serialize captures them.
export function flushLayers(): void {
  if (!state.doc || !state.selected || !state.layers) return;
  const entry = state.doc.root[state.selected];
  const editFor = (key: 'Mask' | 'Overlay') => {
    const lyr = state.layers![key.toLowerCase() as 'mask' | 'overlay'];
    const hasOwnCells = entry?.[key] && typeof entry[key] !== 'string' && typeof entry[key].Cells !== 'string';
    return { cells: lyr.cells && hasOwnCells ? lyr.cells : null, edgeFill: lyr.edgeFill, centerFill: lyr.centerFill };
  };
  applyLayerToEntry(entry, 'Mask', editFor('Mask'));
  applyLayerToEntry(entry, 'Overlay', editFor('Overlay'));
}

export function createBordersSurface(bordersFile: FileDoc, onDirty: () => void): Surface {
  let built = false;
  // Latest SurfaceContext (index + issues) captured from mount/refresh, so the slot list can read
  // shared-sheet counts and per-border severities even though the Panel interface doesn't carry it.
  let lastCtx: SurfaceContext | null = null;

  function buildOnce(host: HTMLElement): void {
    // A numeric/raw-enum root key (or any load failure) makes the file unsafe to round-trip;
    // boot sets loadError. Render a read-only notice instead of calling wrapBordersRoot (which
    // throws on numeric keys) and crashing the whole app at mount.
    if (bordersFile.loadError) {
      host.replaceChildren();
      const div = document.createElement('div');
      div.className = 'ro-empty';
      div.textContent = `borders.json is read-only: ${bordersFile.loadError}`;
      host.appendChild(div);
      return;
    }
    host.replaceChildren();
    host.className = 'borders-surface';
    // Three-column grid (left: slot list, middle: cells, right: preview) over a bottom bar
    // spanning all columns (fill/mask + docked geometry). Visually rough — refined in Phases 3-5.
    host.innerHTML = `
      <nav id="border-list" class="bs-slots"></nav>
      <main id="editor" class="bs-cells"></main>
      <aside id="preview-host" class="bs-preview"></aside>
      <footer class="bs-bottom-bar">
        <div id="props" class="bs-geometry"></div>
        <div id="export-host" class="bs-fillmask"></div>
      </footer>`;
    // Share the package model's root — do NOT re-read borders.json.
    state.doc = wrapBordersRoot(bordersFile.root);

    // Wrap each existing render closure as a Panel. mount() and update() are identical for now
    // (a pure refactor); later tasks (2.2-2.4) split each into a real one-time mount vs in-place
    // update. Each render reads from the shared module `state` and only needs its host element.
    const list = host.querySelector<HTMLElement>('#border-list')!;
    const editor = host.querySelector<HTMLElement>('#editor')!;
    const props = host.querySelector<HTMLElement>('#props')!;
    const previewHost = host.querySelector<HTMLElement>('#preview-host')!;
    const exportHost = host.querySelector<HTMLElement>('#export-host')!;

    const panels: Panel[] = [
      { host: list, mount(h) { mountSlotList(h, { getCtx: () => lastCtx, onSelect: (n) => void selectBorder(n), onMutate: () => notify() }); }, update() { updateSlotList(); } },
      { host: editor, mount: mountCellsPanel, update: updateCellsPanel },
      { host: props, mount: mountGeometryFields, update: updateGeometryFields },
      { host: previewHost, mount: mountPreview, update: updatePreview },
      { host: exportHost, mount(h) { renderExportPanel(h); }, update() { renderExportPanel(this.host); } },
    ];

    // Single bus subscriber: a structural change (border switch / layer add-remove / linked toggle)
    // re-mounts every panel; a plain value notify() only updates in place. Then flush layers and
    // sync dirty to the package model so revalidate kicks.
    let lastKey = '';
    let lastFileDirty = bordersFile.dirty;
    subscribe(() => {
      // The toolbar Save writes bordersFile and clears bordersFile.dirty directly (it doesn't know
      // about our working-copy `state`). Detect that external true->false transition and adopt it;
      // otherwise the one-way sync below immediately re-dirties the just-saved file and Save could
      // never disable for this surface.
      if (lastFileDirty && !bordersFile.dirty) state.dirty = false;

      const key = structuralKey();
      if (key !== lastKey) { lastKey = key; for (const p of panels) p.mount(p.host); }
      for (const p of panels) p.update();
      flushLayers();
      if (bordersFile.dirty !== state.dirty) { bordersFile.dirty = state.dirty; onDirty(); }
      lastFileDirty = bordersFile.dirty;
    });

    built = true;
    notify();
  }

  return {
    key: 'borders',
    label: 'Borders', icon: '▥',
    mount(host, ctx: SurfaceContext) {
      lastCtx = ctx;
      if (!built) buildOnce(host);
    },
    // Validation re-ran: capture fresh ctx (new index + issues) and drive a notify() so the slot
    // list's update() recomputes shared-sheet badges and per-border severity dots in place.
    refresh(ctx: SurfaceContext) { lastCtx = ctx; notify(); },
    reveal(entry?: NavTarget['entry']) {
      if (entry?.name && state.doc?.root[entry.name]) void selectBorder(entry.name);
    },
  };
}
