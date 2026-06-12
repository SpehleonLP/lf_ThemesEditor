// src/ui/surfaces/readOnlyTable.ts
import type { Surface, SurfaceContext, SurfaceKey } from './registry';
import type { Namespace, RefIndex } from '../../package/refIndex';
import type { NavTarget } from '../../package/validate';
import { buildRows, renderTableList } from '../tableList';

interface TableDef { ns: Namespace; title: string }

export function resolveEntrySelection(
  index: RefIndex,
  tables: { ns: Namespace; title: string }[],
  entry: NavTarget['entry'],
): { ns: Namespace; name: string } | null {
  if (!entry?.name) return null;
  if (entry.ns) return { ns: entry.ns, name: entry.name };
  for (const t of tables) {
    if (index.definitions(t.ns).includes(entry.name)) return { ns: t.ns, name: entry.name };
  }
  return null;
}

// Surface config: which namespaces (tables) this file owns, in display order.
const SURFACE_TABLES: Record<'responseCurves', TableDef[]> = {
  responseCurves: [
    { ns: 'rc:events', title: 'Events' },
    { ns: 'rc:splines1d', title: '1D Splines' },
    { ns: 'rc:splines2d', title: '2D Splines' },
    { ns: 'rc:gradients', title: 'Gradients' },
    { ns: 'rc:sounds', title: 'Sound Effects' },
  ],
};

export function createReadOnlyTableSurface(key: 'responseCurves', label: string, icon: string): Surface {
  let listHost!: HTMLElement;
  let inspectorHost!: HTMLElement;
  let ctxRef!: SurfaceContext;
  let selected: { ns: Namespace; name: string } | null = null;

  const tables = SURFACE_TABLES[key];

  function renderInspector(): void {
    inspectorHost.replaceChildren();
    if (!selected) {
      const empty = document.createElement('div');
      empty.className = 'ro-empty';
      empty.textContent = 'Select an entry to see what references it.';
      inspectorHost.appendChild(empty);
      return;
    }
    const kicker = document.createElement('div');
    kicker.className = 'ro-kicker';
    kicker.textContent = selected.ns.toUpperCase();
    const name = document.createElement('div');
    name.className = 'ro-name';
    name.textContent = selected.name;
    inspectorHost.append(kicker, name);

    const consumers = ctxRef.index.consumers(selected.ns, selected.name);
    const head = document.createElement('div');
    head.className = 'ro-refhead';
    head.textContent = `REFERENCED BY · ${consumers.length}`;
    inspectorHost.appendChild(head);
    for (const e of consumers) {
      const row = document.createElement('div');
      row.className = 'ro-refrow';
      const lbl = document.createElement('span');
      lbl.textContent = e.from.label;
      const go = document.createElement('button');
      go.className = 'ro-go';
      go.textContent = 'go ↗';
      go.addEventListener('click', () => ctxRef.navigate({ surface: e.from.file, entry: { name: String(e.from.jsonPath[1] ?? '') } }));
      row.append(lbl, go);
      inspectorHost.appendChild(row);
    }
  }

  function renderLists(): void {
    listHost.replaceChildren();
    for (const t of tables) {
      const sub = document.createElement('div');
      sub.className = 'ro-table';
      listHost.appendChild(sub);
      renderTableList(sub, {
        title: t.title,
        rows: buildRows(ctxRef.index, t.ns),
        selected: selected?.ns === t.ns ? selected.name : null,
        onSelect: (name) => { selected = { ns: t.ns, name }; renderLists(); renderInspector(); },
      });
    }
  }

  return {
    key: key as SurfaceKey,
    label, icon,
    mount(host, ctx) {
      ctxRef = ctx;
      host.replaceChildren();
      host.className = 'ro-surface';
      listHost = document.createElement('aside');
      listHost.className = 'ro-list';
      inspectorHost = document.createElement('section');
      inspectorHost.className = 'ro-inspector';
      host.append(listHost, inspectorHost);
      renderLists();
      renderInspector();
    },
    refresh(ctx) { ctxRef = ctx; renderLists(); renderInspector(); },
    reveal(entry) {
      if (!ctxRef) return;
      const next = resolveEntrySelection(ctxRef.index, tables, entry);
      if (next) { selected = next; renderLists(); renderInspector(); }
    },
  };
}
