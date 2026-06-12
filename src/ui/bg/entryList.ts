// src/ui/bg/entryList.ts
import type { RefIndex, Namespace } from '../../package/refIndex';
import type { Issue } from '../../package/validate';
import type { BgTab } from '../../bg/state';

export interface EntryRow {
  name: string;
  refCount: number | null;   // null on enum tabs
  dead: boolean;
  severity: 'error' | 'warning' | 'notice' | null;
}

const TAB_TABLE: Record<BgTab, 'Backgrounds' | 'Lights' | 'TexCoords' | 'Gradients'> = {
  backdrops: 'Backgrounds', lights: 'Lights', texcoords: 'TexCoords', gradients: 'Gradients',
};
const TAB_NS: Partial<Record<BgTab, Namespace>> = { texcoords: 'bg:texcoords', gradients: 'bg:gradients' };
const sevRank = (s: string) => (s === 'error' ? 3 : s === 'warning' ? 2 : 1);

export function buildEntryRows(tab: BgTab, index: RefIndex, bgRoot: any, issues: Issue[]): EntryRow[] {
  const table = bgRoot?.[TAB_TABLE[tab]];
  const names = table && typeof table === 'object' ? Object.keys(table) : [];
  const ns = TAB_NS[tab];
  return names.map((name) => {
    const refCount = ns ? index.consumers(ns, name).length : null;
    let severity: EntryRow['severity'] = null;
    for (const i of issues) {
      if (i.file !== 'backgrounds') continue;
      const e = i.nav?.entry;
      const hit = ns ? e?.ns === ns && e?.name === name : e?.name === name || e?.slot === name;
      if (hit && (!severity || sevRank(i.severity) > sevRank(severity))) severity = i.severity;
    }
    return { name, refCount, dead: ns ? refCount === 0 : false, severity };
  });
}

export interface EntryListOpts {
  tab: BgTab; rows: EntryRow[]; selected: string | null;
  swatch?: (name: string) => HTMLElement | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
}

export function renderEntryList(host: HTMLElement, opts: EntryListOpts): void {
  host.replaceChildren();
  host.className = 'bg-entrylist';
  const head = document.createElement('div'); head.className = 'bg-el-head';
  head.textContent = `${TAB_TABLE[opts.tab]} `;
  const count = document.createElement('span'); count.className = 'bg-el-count'; count.textContent = String(opts.rows.length);
  const add = document.createElement('button'); add.className = 'bg-el-add'; add.textContent = '+'; add.title = 'Add entry';
  add.addEventListener('click', opts.onAdd);
  head.append(count, add); host.appendChild(head);

  for (const row of opts.rows) {
    const el = document.createElement('div');
    el.className = 'bg-el-row' + (row.name === opts.selected ? ' bg-el-active' : '');
    el.dataset.name = row.name;
    if (row.severity) { const dot = document.createElement('span'); dot.className = `bg-el-dot bg-el-${row.severity}`; el.appendChild(dot); }
    const sw = opts.swatch?.(row.name); if (sw) { sw.classList.add('bg-el-swatch'); el.appendChild(sw); }
    const nm = document.createElement('span'); nm.className = 'bg-el-name'; nm.textContent = row.name; el.appendChild(nm);
    if (row.dead) { const p = document.createElement('span'); p.className = 'bg-el-dead'; p.textContent = 'dead'; el.appendChild(p); }
    else if (row.refCount != null) { const b = document.createElement('span'); b.className = 'bg-el-refs'; b.textContent = `↗${row.refCount}`; el.appendChild(b); }
    el.addEventListener('click', () => opts.onSelect(row.name));
    host.appendChild(el);
  }
}
