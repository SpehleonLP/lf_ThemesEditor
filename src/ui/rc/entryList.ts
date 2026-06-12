// src/ui/rc/entryList.ts
import type { RefIndex, Namespace } from '../../package/refIndex';
import type { RcTab } from '../../rc/state';

export const RC_TAB_TABLE: Record<RcTab, string> = {
  curves: 'Response Curves', events: 'Events', splines1d: '1D Splines',
  splines2d: '2D Splines', gradients: 'Gradients', sounds: 'Sound Effects',
};
export const RC_TAB_NS: Partial<Record<RcTab, Namespace>> = {
  events: 'rc:events', splines1d: 'rc:splines1d', splines2d: 'rc:splines2d',
  gradients: 'rc:gradients', sounds: 'rc:sounds',
};
export const RC_TAB_LABEL: Record<RcTab, string> = {
  curves: 'Response Curves', events: 'Events', splines1d: '1D Splines',
  splines2d: '2D Splines', gradients: 'Gradients', sounds: 'Sound Effects',
};

export interface RcEntryRow { name: string; refCount: number | null; dead: boolean; }

export function buildRcRows(tab: RcTab, index: RefIndex, rcRoot: any): RcEntryRow[] {
  const table = rcRoot?.[RC_TAB_TABLE[tab]];
  const names = table && typeof table === 'object' ? Object.keys(table) : [];
  const ns = RC_TAB_NS[tab];
  return names.map((name) => {
    const refCount = ns ? index.consumers(ns, name).length : null;
    return { name, refCount, dead: ns ? refCount === 0 : false };
  });
}

export interface RcEntryListOpts {
  tab: RcTab; rows: RcEntryRow[]; selected: string | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDelete: (name: string) => void;
  onRename?: (name: string) => void; // omitted for the curves tab (constrained keys)
}

export function renderRcEntryList(host: HTMLElement, opts: RcEntryListOpts): void {
  host.replaceChildren(); host.className = 'bg-entrylist';
  const head = document.createElement('div'); head.className = 'bg-el-head';
  head.textContent = `${RC_TAB_LABEL[opts.tab]} `;
  const count = document.createElement('span'); count.className = 'bg-el-count'; count.textContent = String(opts.rows.length);
  const add = document.createElement('button'); add.className = 'bg-el-add'; add.textContent = '+'; add.title = 'Add entry';
  add.addEventListener('click', opts.onAdd);
  head.append(count, add); host.appendChild(head);

  for (const row of opts.rows) {
    const el = document.createElement('div');
    el.className = 'bg-el-row' + (row.name === opts.selected ? ' bg-el-active' : '');
    el.dataset.name = row.name;
    const nm = document.createElement('span'); nm.className = 'bg-el-name'; nm.textContent = row.name; el.appendChild(nm);
    if (opts.onRename) nm.addEventListener('dblclick', (e) => { e.stopPropagation(); opts.onRename!(row.name); });
    if (row.dead) { const p = document.createElement('span'); p.className = 'bg-el-dead'; p.textContent = 'dead'; el.appendChild(p); }
    else if (row.refCount != null) { const b = document.createElement('span'); b.className = 'bg-el-refs'; b.textContent = `↗${row.refCount}`; el.appendChild(b); }
    const x = document.createElement('button'); x.className = 'bg-el-del'; x.textContent = '✕'; x.title = 'Delete';
    x.addEventListener('click', (e) => { e.stopPropagation(); opts.onDelete(row.name); }); el.appendChild(x);
    el.addEventListener('click', () => opts.onSelect(row.name));
    host.appendChild(el);
  }
}
