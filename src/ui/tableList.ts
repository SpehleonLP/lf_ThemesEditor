// src/ui/tableList.ts
import type { RefIndex, Namespace } from '../package/refIndex';

export interface TableRow { name: string; refCount: number; dead: boolean }

export function buildRows(index: RefIndex, ns: Namespace): TableRow[] {
  return index.definitions(ns).map((name) => {
    const refCount = index.consumers(ns, name).length;
    return { name, refCount, dead: refCount === 0 };
  });
}

export interface TableListOptions {
  title: string;
  rows: TableRow[];
  selected: string | null;
  onSelect: (name: string) => void;
  swatch?: (name: string) => HTMLElement | null; // caller-supplied swatch renderer
}

// Thin DOM render. The component never touches documents; selection raises a callback.
export function renderTableList(host: HTMLElement, opts: TableListOptions): void {
  host.replaceChildren();
  const header = document.createElement('div');
  header.className = 'tl-header';
  header.textContent = `${opts.title} `;
  const count = document.createElement('span');
  count.className = 'tl-count';
  count.textContent = String(opts.rows.length);
  header.appendChild(count);
  host.appendChild(header);

  for (const row of opts.rows) {
    const el = document.createElement('div');
    el.className = 'tl-row' + (row.name === opts.selected ? ' tl-active' : '');
    el.dataset.name = row.name;

    const sw = opts.swatch?.(row.name);
    if (sw) { sw.classList.add('tl-swatch'); el.appendChild(sw); }

    const name = document.createElement('span');
    name.className = 'tl-name';
    name.textContent = row.name;
    el.appendChild(name);

    if (row.dead) {
      const pill = document.createElement('span');
      pill.className = 'tl-dead';
      pill.textContent = 'dead';
      el.appendChild(pill);
    } else {
      const badge = document.createElement('span');
      badge.className = 'tl-refs';
      badge.textContent = `↗${row.refCount}`;
      el.appendChild(badge);
    }

    el.addEventListener('click', () => opts.onSelect(row.name));
    host.appendChild(el);
  }
}
