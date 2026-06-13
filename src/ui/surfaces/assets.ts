// src/ui/surfaces/assets.ts
import type { Surface, SurfaceContext } from './registry';
import type { AssetEntry } from '../../package/assets';
import { edgeEntryName } from '../../package/refIndex';
import { playAsset } from '../audio';

export function createAssetsSurface(): Surface {
  let mainHost!: HTMLElement;
  let inspectorHost!: HTMLElement;
  let ctxRef!: SurfaceContext;
  let tab: 'image' | 'sound' = 'image';
  let selected: string | null = null;

  function statusLabel(a: AssetEntry): string {
    return a.status === 'referenced' ? `↗ ${a.consumers} consumers`
      : a.status === 'unreferenced' ? "unreferenced · won't pack"
      : `✕ .${a.ext} rejected`;
  }

  function renderInspector(): void {
    inspectorHost.replaceChildren();
    const all = [...ctxRef.assets.images, ...ctxRef.assets.sounds];
    const a = all.find((x) => x.path === selected);
    if (!a) {
      const empty = document.createElement('div');
      empty.className = 'ro-empty';
      empty.textContent = 'Select an asset.';
      inspectorHost.appendChild(empty);
      return;
    }
    const kicker = document.createElement('div'); kicker.className = 'ro-kicker'; kicker.textContent = 'ASSET';
    const name = document.createElement('div'); name.className = 'ro-name'; name.textContent = a.path;
    const status = document.createElement('div'); status.className = `as-status as-${a.status}`; status.textContent = statusLabel(a);
    inspectorHost.append(kicker, name, status);
    if (a.kind === 'sound' && a.status !== 'rejected-format') {
      const play = document.createElement('button'); play.className = 'as-play'; play.textContent = '▶'; play.title = 'Play'; play.setAttribute('aria-label', 'Play');
      play.addEventListener('click', () => playAsset(a.path));
      status.appendChild(play);
    }

    const ns = a.kind === 'image' ? 'asset:image' : 'asset:sound';
    const consumers = ctxRef.index.consumers(ns, a.path);
    const head = document.createElement('div'); head.className = 'ro-refhead';
    head.textContent = consumers.length ? `REFERENCED BY · ${consumers.length}` : 'Nothing references this asset.';
    inspectorHost.appendChild(head);
    for (const e of consumers) {
      const row = document.createElement('div'); row.className = 'ro-refrow';
      const lbl = document.createElement('span'); lbl.textContent = e.from.label;
      const go = document.createElement('button'); go.className = 'ro-go'; go.textContent = 'go ↗';
      go.addEventListener('click', () => ctxRef.navigate({ surface: e.from.file, entry: { name: edgeEntryName(e) } }));
      row.append(lbl, go);
      inspectorHost.appendChild(row);
    }
  }

  function renderMain(): void {
    mainHost.replaceChildren();
    const tabs = document.createElement('div'); tabs.className = 'as-tabs';
    for (const t of ['image', 'sound'] as const) {
      const b = document.createElement('button');
      b.className = 'as-tab' + (t === tab ? ' as-active' : '');
      b.textContent = t === 'image' ? `Images (${ctxRef.assets.images.length})` : `Sounds (${ctxRef.assets.sounds.length})`;
      b.addEventListener('click', () => { tab = t; renderMain(); });
      tabs.appendChild(b);
    }
    mainHost.appendChild(tabs);

    const grid = document.createElement('div'); grid.className = 'as-grid';
    const entries = tab === 'image' ? ctxRef.assets.images : ctxRef.assets.sounds;
    for (const a of entries) {
      const card = document.createElement('div');
      card.className = 'as-card' + (a.status === 'rejected-format' ? ' as-error' : '') + (a.path === selected ? ' as-selected' : '');
      const badge = document.createElement('span'); badge.className = `as-fmt as-fmt-${a.ext}`; badge.textContent = a.ext.toUpperCase();
      const fn = document.createElement('span'); fn.className = 'as-fn'; fn.textContent = a.path.replace(/^.*\//, '');
      const pill = document.createElement('span'); pill.className = `as-pill as-${a.status}`; pill.textContent = statusLabel(a);
      card.append(badge, fn, pill);
      if (a.kind === 'sound' && a.status !== 'rejected-format') {
        const play = document.createElement('button'); play.className = 'as-play'; play.textContent = '▶'; play.title = 'Play'; play.setAttribute('aria-label', 'Play');
        play.addEventListener('click', (ev) => { ev.stopPropagation(); playAsset(a.path); });
        card.appendChild(play);
      }
      card.addEventListener('click', () => { selected = a.path; renderMain(); renderInspector(); });
      grid.appendChild(card);
    }
    if (ctxRef.assets.missing.length) {
      const head = document.createElement('div'); head.className = 'as-missing-head'; head.textContent = `Missing referenced files: ${ctxRef.assets.missing.length}`;
      mainHost.appendChild(head);
      for (const m of ctxRef.assets.missing.filter((x) => x.kind === tab)) {
        const row = document.createElement('div'); row.className = 'as-missing-row'; row.textContent = `✕ ${m.name} — file not found`;
        mainHost.appendChild(row);
      }
    }
    mainHost.appendChild(grid);
  }

  return {
    key: 'assets',
    label: 'Assets', icon: '▢',
    mount(host, ctx) {
      ctxRef = ctx;
      host.replaceChildren();
      host.className = 'as-surface';
      mainHost = document.createElement('section'); mainHost.className = 'as-main';
      inspectorHost = document.createElement('aside'); inspectorHost.className = 'ro-inspector';
      host.append(mainHost, inspectorHost);
      renderMain(); renderInspector();
    },
    refresh(ctx) { ctxRef = ctx; renderMain(); renderInspector(); },
    reveal() { tab = 'image'; renderMain(); },
  };
}
