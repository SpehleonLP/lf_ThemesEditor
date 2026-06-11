// src/ui/surfaces/borders.ts
import type { Surface, SurfaceContext } from './registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { wrapBordersRoot, applyLayerToEntry } from '../../document';
import { state, notify, subscribe } from '../state';
import { selectBorder } from '../main';
import { renderBorderList } from '../borderList';
import { renderRectEditor } from '../rectEditor';
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
    return { cells: lyr.cells && hasOwnCells ? lyr.cells : null, edgeFill: lyr.edgeFill as any, centerFill: lyr.centerFill as any };
  };
  applyLayerToEntry(entry, 'Mask', editFor('Mask'));
  applyLayerToEntry(entry, 'Overlay', editFor('Overlay'));
}

export function createBordersSurface(bordersFile: FileDoc, onDirty: () => void): Surface {
  let built = false;

  function buildOnce(host: HTMLElement): void {
    host.replaceChildren();
    host.className = 'borders-surface';
    host.innerHTML = `
      <nav id="border-list"></nav>
      <main id="editor"></main>
      <aside id="props-col"><div id="props"></div><div id="preview-host"></div><div id="export-host"></div></aside>`;
    // Share the package model's root — do NOT re-read borders.json.
    state.doc = wrapBordersRoot(bordersFile.root);

    const list = host.querySelector<HTMLElement>('#border-list')!;
    subscribe(() => renderBorderList(list, (n) => void selectBorder(n)));
    const editor = host.querySelector<HTMLElement>('#editor')!;
    subscribe(() => renderRectEditor(editor));
    const props = host.querySelector<HTMLElement>('#props')!;
    subscribe(() => renderPropertiesForm(props));
    const previewHost = host.querySelector<HTMLElement>('#preview-host')!;
    subscribe(() => renderPreviewPanel(previewHost));
    const exportHost = host.querySelector<HTMLElement>('#export-host')!;
    subscribe(() => renderExportPanel(exportHost));

    // Bridge: any borders mutation → flush layers, sync dirty to the package model, kick revalidate.
    subscribe(() => {
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
