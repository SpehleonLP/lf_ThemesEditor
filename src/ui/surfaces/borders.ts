// src/ui/surfaces/borders.ts
import type { Surface, SurfaceContext } from './registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { wrapBordersRoot, applyLayerToEntry } from '../../document';
import { state, notify, subscribe, structuralKey, type Panel } from '../state';
import { selectBorder } from '../main';
import { renderBorderList } from '../borderList';
import { mountCellsPanel, updateCellsPanel } from '../rectEditor';
import { renderPropertiesForm } from '../propertiesForm';
import { renderPreviewPanel } from '../previewPanel';
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

  function buildOnce(host: HTMLElement): void {
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
      { host: list, mount(h) { renderBorderList(h, (n) => void selectBorder(n)); }, update() { renderBorderList(this.host, (n) => void selectBorder(n)); } },
      { host: editor, mount: mountCellsPanel, update: updateCellsPanel },
      { host: props, mount(h) { renderPropertiesForm(h); }, update() { renderPropertiesForm(this.host); } },
      { host: previewHost, mount(h) { renderPreviewPanel(h); }, update() { renderPreviewPanel(this.host); } },
      { host: exportHost, mount(h) { renderExportPanel(h); }, update() { renderExportPanel(this.host); } },
    ];

    // Single bus subscriber: a structural change (border switch / layer add-remove / linked toggle)
    // re-mounts every panel; a plain value notify() only updates in place. Then flush layers and
    // sync dirty to the package model so revalidate kicks.
    let lastKey = '';
    subscribe(() => {
      const key = structuralKey();
      if (key !== lastKey) { lastKey = key; for (const p of panels) p.mount(p.host); }
      for (const p of panels) p.update();
      flushLayers();
      if (bordersFile.dirty !== state.dirty) { bordersFile.dirty = state.dirty; onDirty(); }
    });

    built = true;
    notify();
  }

  return {
    key: 'borders',
    label: 'Borders', icon: '▥',
    mount(host, _ctx: SurfaceContext) {
      if (!built) buildOnce(host);
    },
    refresh() { /* borders pane re-renders via its own notify(); nothing to do */ },
    reveal(entry?: NavTarget['entry']) {
      if (entry?.name && state.doc?.root[entry.name]) void selectBorder(entry.name);
    },
  };
}
