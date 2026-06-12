// src/ui/rc/surface.ts
import type { Surface, SurfaceContext } from '../surfaces/registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { resolveEntrySelection } from '../surfaces/readOnlyTable';
import {
  rcState, rcSubscribe, rcNotify, rcStructuralKey, selectRcTab, selectRcEntry, setTrigger, type RcTab,
} from '../../rc/state';
import { buildRcRows, renderRcEntryList, RC_TAB_TABLE, RC_TAB_NS } from './entryList';
import { renameRcEntry } from '../../rc/rename';
import { mountCurveForm, updateCurveForm } from './curveForm';
import { mountEventForm, updateEventForm } from './eventForm';
import { createSplinePlot } from './splinePlot';
import { mountSoundForm, updateSoundForm } from './soundForm';
import { mountRcGradientForm, updateRcGradientForm } from './gradientForm';
import { mountRcPreview, updateRcPreview } from './previewPanel';
import type { RcFormDeps, RcPreviewDeps } from './types';
import type { AnyMark } from '../../rc/spline';

const TABS: { id: RcTab; label: string }[] = [
  { id: 'curves', label: 'Curves' }, { id: 'events', label: 'Events' },
  { id: 'splines1d', label: '1D Splines' }, { id: 'splines2d', label: '2D Splines' },
  { id: 'gradients', label: 'Gradients' }, { id: 'sounds', label: 'Sounds' },
];
const ARCHETYPES = ['GridItem', 'ListItem', 'Button', 'Action', 'Affordance', 'Window', 'Progress', 'Toggle', 'Bounce'];

export function createResponseCurvesSurface(rcFile: FileDoc, onDirty: () => void): Surface {
  let built = false; let lastCtx: SurfaceContext | null = null;
  let railHost!: HTMLElement, listHost!: HTMLElement, editorHost!: HTMLElement, previewHost!: HTMLElement;
  let plot: { update(): void } | null = null;

  const markDirty = () => { rcFile.dirty = true; onDirty(); };
  const ensure = (tab: RcTab) => (rcFile.root[RC_TAB_TABLE[tab]] ??= {});

  function addEntry(): void {
    const tab = rcState.tab; const table = ensure(tab);
    if (tab === 'curves') {
      const arch = prompt(`Archetype (${ARCHETYPES.join(', ')}), or _N / N:`, 'Button'); if (!arch) return;
      const idx = prompt('Index 0–3 (archetypes), or a number for _N / N:', '0'); if (idx === null) return;
      const key = ARCHETYPES.includes(arch) ? `${arch}_${idx}` : arch.startsWith('_') ? arch : `_${idx}`;
      if (!/^((GridItem|ListItem|Button|Action|Affordance|Window|Progress|Toggle|Bounce)_[0-3]|_[0-9]+|[0-9]+)$/.test(key)) { alert(`Invalid curve key "${key}".`); return; }
      if (Object.hasOwn(table, key)) { alert('Already exists.'); return; }
      table[key] = {}; selectRcEntry('curves', key);
    } else {
      const name = prompt(`New ${tab} name:`); if (!name) return;
      if (Object.hasOwn(table, name)) { alert('Name already exists.'); return; }
      table[name] = defaultEntry(tab); selectRcEntry(tab, name);
    }
    markDirty();
  }

  function defaultEntry(tab: RcTab): any {
    switch (tab) {
      case 'events': return {};
      case 'splines1d': return [[0, 0], [1, 0]];
      case 'splines2d': return [[0, [0, 0]], [1, [0, 0]]];
      case 'gradients': return [[0, [1, 1, 1, 1]], [1, [1, 1, 1, 1]]];
      case 'sounds': return { file: '' };
      default: return {};
    }
  }

  function deleteEntry(tab: RcTab, name: string): void {
    const table = rcFile.root[RC_TAB_TABLE[tab]]; if (!table) return;
    const ns = RC_TAB_NS[tab];
    const consumers = ns ? lastCtx!.index.consumers(ns, name).length : 0;
    if (!confirm(`Delete "${name}"?${consumers ? ` ${consumers} reference(s) will dangle.` : ''}`)) return;
    delete table[name];
    if (rcState.selected[tab] === name) selectRcEntry(tab, null);
    markDirty();
  }

  function renameEntry(tab: RcTab, name: string): void {
    const ns = RC_TAB_NS[tab]; if (!ns) return; // curves not renamable
    const next = prompt(`Rename "${name}" to:`, name); if (!next || next === name) return;
    const table = rcFile.root[RC_TAB_TABLE[tab]];
    if (Object.hasOwn(table ?? {}, next)) { alert('Name already exists.'); return; }
    renameRcEntry(lastCtx!.pkg, lastCtx!.index, ns, name, next);
    selectRcEntry(tab, next);
    markDirty();
  }

  function renderRail(): void {
    railHost.replaceChildren();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'bg-tab' + (rcState.tab === t.id ? ' bg-tab-active' : '');
      b.textContent = t.label;
      const tbl = rcFile.root[RC_TAB_TABLE[t.id]];
      const n = tbl && typeof tbl === 'object' ? Object.keys(tbl).length : 0;
      const badge = document.createElement('span'); badge.className = 'bg-tab-count'; badge.textContent = String(n); b.appendChild(badge);
      b.addEventListener('click', () => selectRcTab(t.id));
      railHost.appendChild(b);
    }
  }

  function renderList(): void {
    if (!lastCtx) return;
    const rows = buildRcRows(rcState.tab, lastCtx.index, rcFile.root);
    renderRcEntryList(listHost, {
      tab: rcState.tab, rows, selected: rcState.selected[rcState.tab],
      onSelect: (name) => selectRcEntry(rcState.tab, name),
      onAdd: addEntry,
      onDelete: (name) => deleteEntry(rcState.tab, name),
      onRename: RC_TAB_NS[rcState.tab] ? (name) => renameEntry(rcState.tab, name) : undefined,
    });
  }

  function splineMarksDeps(tab: 'splines1d' | 'splines2d'): { get: () => AnyMark[]; set: (m: AnyMark[], o: { live: boolean }) => void } {
    const table = RC_TAB_TABLE[tab];
    return {
      get: () => { const n = rcState.selected[tab]; const raw = n ? rcFile.root[table]?.[n] : null; return Array.isArray(raw) ? raw : []; },
      set: (marks, { live }) => { const n = rcState.selected[tab]; if (!n) return; if (!live) marks.sort((a, b) => a[0] - b[0]); rcFile.root[table][n] = marks; if (!live) markDirty(); rcNotify(); },
    };
  }

  const formDeps = (): RcFormDeps => ({ file: rcFile, ctx: () => lastCtx!, markDirty });

  function mountEditor(): void {
    editorHost.replaceChildren(); plot = null;
    const tab = rcState.tab;
    if (tab === 'curves') mountCurveForm(editorHost, formDeps());
    else if (tab === 'events') mountEventForm(editorHost, formDeps());
    else if (tab === 'sounds') mountSoundForm(editorHost, formDeps());
    else if (tab === 'gradients') mountRcGradientForm(editorHost, formDeps());
    else {
      const d = splineMarksDeps(tab as 'splines1d' | 'splines2d');
      const sel = rcState.selected[tab];
      if (sel) setTrigger({ kind: tab === 'splines1d' ? 'spline1d' : 'spline2d', name: sel });
      plot = createSplinePlot(editorHost, {
        dim: tab === 'splines1d' ? 1 : 2,
        getMarks: d.get, setMarks: d.set, loop: () => rcState.loop,
      });
    }
  }
  function updateEditor(): void {
    const tab = rcState.tab;
    if (tab === 'curves') updateCurveForm();
    else if (tab === 'events') updateEventForm();
    else if (tab === 'sounds') updateSoundForm();
    else if (tab === 'gradients') updateRcGradientForm();
    else plot?.update();
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
    const previewDeps: RcPreviewDeps = { file: rcFile, ctx: () => lastCtx! };
    mountRcPreview(previewHost, previewDeps);

    let lastKey = '';
    rcSubscribe(() => {
      renderRail();
      const key = rcStructuralKey();
      if (key !== lastKey) { lastKey = key; renderList(); mountEditor(); }
      renderList(); updateEditor(); updateRcPreview();
    });
    built = true;
    rcNotify();
  }

  return {
    key: 'responseCurves', label: 'Response Curves', icon: '◠',
    mount(host, ctx) { lastCtx = ctx; if (!built) buildOnce(host); },
    refresh(ctx) { lastCtx = ctx; rcNotify(); },
    reveal(entry?: NavTarget['entry']) {
      if (!entry) return;
      const named = resolveEntrySelection(lastCtx!.index, [
        { ns: 'rc:events', title: '' }, { ns: 'rc:splines1d', title: '' }, { ns: 'rc:splines2d', title: '' },
        { ns: 'rc:gradients', title: '' }, { ns: 'rc:sounds', title: '' },
      ], entry);
      if (named) {
        const tabFor: Record<string, RcTab> = { 'rc:events': 'events', 'rc:splines1d': 'splines1d', 'rc:splines2d': 'splines2d', 'rc:gradients': 'gradients', 'rc:sounds': 'sounds' };
        selectRcTab(tabFor[named.ns]); selectRcEntry(rcState.tab, named.name); return;
      }
      const name = entry.name ?? entry.slot;
      if (name && rcFile.root['Response Curves']?.[name]) { selectRcTab('curves'); selectRcEntry('curves', name); }
    },
  };
}
