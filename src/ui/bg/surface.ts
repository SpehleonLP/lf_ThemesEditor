// src/ui/bg/surface.ts
import type { Surface, SurfaceContext } from '../surfaces/registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { resolveEntrySelection } from '../surfaces/readOnlyTable';
import { bgState, bgSubscribe, bgNotify, bgStructuralKey, selectTab, selectEntry, loadPairing, type BgTab } from '../../bg/state';
import { buildEntryRows, renderEntryList } from './entryList';
import { mountBackdropForm, updateBackdropForm } from './backdropForm';
import { mountLightForm, updateLightForm } from './lightForm';
import { mountTexCoordForm, updateTexCoordForm } from './texCoordForm';
import { mountGradientEditor, updateGradientEditor } from './gradientEditor';
import { mountBgPreview, updateBgPreview } from './previewPanel';
import { allDetailNames, allLightNames, unusedDetailNames, unusedLightNames } from '../../package/slotNames';
import type { BgFormDeps, BgPreviewDeps } from './types';

const TABS: { id: BgTab; label: string; shared?: boolean }[] = [
  { id: 'backdrops', label: 'Backdrops' }, { id: 'lights', label: 'Lights' },
  { id: 'texcoords', label: 'TexCoords', shared: true }, { id: 'gradients', label: 'Gradients', shared: true },
];
const TAB_TABLE: Record<BgTab, string> = { backdrops: 'Backgrounds', lights: 'Lights', texcoords: 'TexCoords', gradients: 'Gradients' };

export function createBackgroundsSurface(bgFile: FileDoc, onDirty: () => void): Surface {
  let built = false; let lastCtx: SurfaceContext | null = null;
  let railHost!: HTMLElement, listHost!: HTMLElement, editorHost!: HTMLElement, previewHost!: HTMLElement;

  const markDirty = () => { bgFile.dirty = true; onDirty(); };
  const ensureTable = (tab: BgTab) => (bgFile.root[TAB_TABLE[tab]] ??= {});

  function addEntry(): void {
    const tab = bgState.tab;
    const table = ensureTable(tab);
    if (tab === 'backdrops' || tab === 'lights') {
      const unused = tab === 'backdrops' ? unusedDetailNames(Object.keys(table)) : unusedLightNames(Object.keys(table));
      if (!unused.length) { alert('All slots are in use.'); return; }
      const name = prompt(`Add ${tab === 'backdrops' ? 'backdrop' : 'light'} slot:\n${unused.join(', ')}`, unused[0]);
      if (!name) return;
      const valid = tab === 'backdrops' ? allDetailNames() : allLightNames();
      if (!valid.includes(name) || name in table) { alert('Invalid or duplicate slot name.'); return; }
      table[name] = tab === 'lights' ? { gradient: '' } : {}; // {} backdrop is invalid until configured (visible nudge)
      selectEntry(tab, name);
    } else {
      const name = prompt(`New ${tab} name:`);
      if (!name) return;
      if (name in table) { alert('Name already exists.'); return; }
      table[name] = tab === 'gradients' ? [[0, [1, 1, 1, 1]]] : {}; // identity texcoord / single-mark gradient
      selectEntry(tab, name);
    }
    markDirty();
  }

  function renderRail(): void {
    railHost.replaceChildren();
    const counts = lastCtx ? lastCtx.index : null;
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'bg-tab' + (bgState.tab === t.id ? ' bg-tab-active' : '');
      b.textContent = t.label + (t.shared ? ' ·shared' : '');
      const tbl = bgFile.root[TAB_TABLE[t.id]];
      const n = tbl && typeof tbl === 'object' ? Object.keys(tbl).length : 0;
      const badge = document.createElement('span'); badge.className = 'bg-tab-count'; badge.textContent = String(n);
      b.appendChild(badge);
      b.addEventListener('click', () => selectTab(t.id));
      railHost.appendChild(b);
    }
    void counts;
  }

  function renderList(): void {
    if (!lastCtx) return;
    const rows = buildEntryRows(bgState.tab, lastCtx.index, bgFile.root, lastCtx.issues);
    renderEntryList(listHost, {
      tab: bgState.tab, rows, selected: bgState.selected[bgState.tab],
      onSelect: (name) => selectEntry(bgState.tab, name),
      onAdd: addEntry,
    });
  }

  function mountEditor(): void {
    editorHost.replaceChildren();
    const deps: BgFormDeps = { file: bgFile, ctx: () => lastCtx!, markDirty };
    if (bgState.tab === 'backdrops') mountBackdropForm(editorHost, deps);
    else if (bgState.tab === 'lights') mountLightForm(editorHost, deps);
    else if (bgState.tab === 'texcoords') mountTexCoordForm(editorHost, deps);
    else mountGradientEditor(editorHost, deps);
  }
  function updateEditor(): void {
    if (bgState.tab === 'backdrops') updateBackdropForm();
    else if (bgState.tab === 'lights') updateLightForm();
    else if (bgState.tab === 'texcoords') updateTexCoordForm();
    else updateGradientEditor();
  }

  function buildOnce(host: HTMLElement): void {
    host.replaceChildren(); host.className = 'bg-surface';
    host.innerHTML = `
      <nav class="bg-rail"></nav>
      <aside class="bg-list"></aside>
      <section class="bg-preview"></section>
      <section class="bg-editor"></section>`;
    railHost = host.querySelector('.bg-rail')!;
    listHost = host.querySelector('.bg-list')!;
    previewHost = host.querySelector('.bg-preview')!;
    editorHost = host.querySelector('.bg-editor')!;
    loadPairing();
    const previewDeps: BgPreviewDeps = { file: bgFile, ctx: () => lastCtx! };
    mountBgPreview(previewHost, previewDeps);

    let lastKey = '';
    bgSubscribe(() => {
      renderRail();
      const key = bgStructuralKey();
      if (key !== lastKey) { lastKey = key; renderList(); mountEditor(); }
      renderList(); updateEditor(); updateBgPreview();
    });
    built = true;
    bgNotify();
  }

  return {
    key: 'backgrounds', label: 'Backgrounds', icon: '◧',
    mount(host, ctx) { lastCtx = ctx; if (!built) buildOnce(host); },
    refresh(ctx) { lastCtx = ctx; bgNotify(); },
    reveal(entry?: NavTarget['entry']) {
      if (!entry) return;
      const named = resolveEntrySelection(lastCtx!.index, [{ ns: 'bg:texcoords', title: '' }, { ns: 'bg:gradients', title: '' }], entry);
      if (named) { selectTab(named.ns === 'bg:gradients' ? 'gradients' : 'texcoords'); selectEntry(bgState.tab, named.name); return; }
      const name = entry.name ?? entry.slot;
      if (!name) return;
      if (bgFile.root.Backgrounds?.[name]) { selectTab('backdrops'); selectEntry('backdrops', name); }
      else if (bgFile.root.Lights?.[name]) { selectTab('lights'); selectEntry('lights', name); }
    },
  };
}
