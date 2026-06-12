// src/ui/bg/backdropForm.ts
import { bgState, bgNotify } from '../../bg/state';
import { readLayers, writeLayers, glassEnabled, setGlass, type LayerModel, type WrapMode } from '../../bg/backdropModel';
import { fillOptions } from '../options';
import type { BgFormDeps } from './types';

const WRAPS: WrapMode[] = ['REPEAT', 'MIRRORED_REPEAT', 'CLAMP_TO_EDGE', 'CLAMP_TO_BORDER'];
let _host: HTMLElement | null = null;
let _deps: BgFormDeps | null = null;

const entryOf = () => {
  const name = bgState.selected.backdrops;
  return name ? _deps!.file.root.Backgrounds?.[name] : null;
};

function layerCardHtml(i: number): string {
  return `
    <fieldset class="bg-layer" data-layer="${i}">
      <legend><label><input type="checkbox" data-l="enabled"> Detail Layer ${i}</label></legend>
      <label>Image: <select data-l="image"></select></label>
      <label>…or path: <input type="text" data-l="imagePath" placeholder="(manual path)"></label>
      <label>TexCoord: <select data-l="texCoord"></select>
        <button data-l="tcGo" title="go to definition">↗</button>
        <button data-l="tcNew" title="new identity texcoord">+ new…</button></label>
      <label>Wrap X: <select data-l="wrapX">${WRAPS.map((w) => `<option>${w}</option>`).join('')}</select>
             Y: <select data-l="wrapY">${WRAPS.map((w) => `<option>${w}</option>`).join('')}</select></label>
    </fieldset>`;
}

export function mountBackdropForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps;
  host.replaceChildren(); host.className = 'bg-backdrop-form';
  host.innerHTML = `
    ${layerCardHtml(0)}${layerCardHtml(1)}
    <fieldset class="bg-glass">
      <legend><label><input type="checkbox" data-g="enabled"> Frosted Glass</label></legend>
      <label>Blur 0..2: <input type="number" step="any" data-g="blur"></label>
      <label>Zoom: <input type="number" step="any" data-g="zoom"></label>
      <label>Opacity: <input type="number" step="any" data-g="opacity"></label>
    </fieldset>
    <label>detailOpacity: <input type="number" step="any" data-e="detailOpacity" placeholder="1"></label>
    <label>Comment: <input type="text" data-e="Comment" placeholder="(comment)"></label>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  const readForm = (): [LayerModel, LayerModel] => {
    const read = (i: number): LayerModel => {
      const card = host.querySelector<HTMLElement>(`[data-layer="${i}"]`)!;
      const q = <T extends HTMLElement>(s: string) => card.querySelector<T>(s)!;
      const sel = q<HTMLSelectElement>('[data-l="image"]').value;
      const path = q<HTMLInputElement>('[data-l="imagePath"]').value.trim();
      return {
        enabled: q<HTMLInputElement>('[data-l="enabled"]').checked,
        image: path || sel,
        texCoord: q<HTMLSelectElement>('[data-l="texCoord"]').value,
        wrapX: q<HTMLSelectElement>('[data-l="wrapX"]').value as WrapMode,
        wrapY: q<HTMLSelectElement>('[data-l="wrapY"]').value as WrapMode,
      };
    };
    return [read(0), read(1)];
  };

  host.querySelectorAll('[data-layer] select, [data-layer] input').forEach((el) => {
    el.addEventListener(el instanceof HTMLInputElement && el.type === 'text' ? 'input' : 'change', () => {
      const entry = entryOf(); if (!entry) return;
      writeLayers(entry, readForm()); commit();
    });
  });
  host.querySelectorAll('[data-l="tcGo"]').forEach((b, i) => b.addEventListener('click', () => {
    const entry = entryOf(); const tc = readLayers(entry)[i].texCoord;
    if (tc) _deps!.ctx().navigate({ surface: 'backgrounds', entry: { ns: 'bg:texcoords', name: tc } });
  }));
  host.querySelectorAll('[data-l="tcNew"]').forEach((b, i) => b.addEventListener('click', () => {
    const name = prompt('New TexCoord name:'); if (!name) return;
    const tcs = (_deps!.file.root.TexCoords ??= {});
    if (!Object.hasOwn(tcs, name)) tcs[name] = {};
    const entry = entryOf(); const layers = readLayers(entry); layers[i].texCoord = name; layers[i].enabled = true;
    writeLayers(entry, layers); commit();
  }));

  host.querySelectorAll('[data-g]').forEach((el) => {
    el.addEventListener('change', () => {
      const entry = entryOf(); if (!entry) return;
      const enabled = host.querySelector<HTMLInputElement>('[data-g="enabled"]')!.checked;
      setGlass(entry, enabled);
      if (enabled) {
        const g = entry['Frosted Glass'];
        const v = (n: string) => Number(host.querySelector<HTMLInputElement>(`[data-g="${n}"]`)!.value);
        g.blur = v('blur'); g.zoom = v('zoom'); g.opacity = v('opacity');
      }
      commit();
    });
  });
  host.querySelector('[data-e="detailOpacity"]')!.addEventListener('change', (ev) => {
    const entry = entryOf(); if (!entry) return;
    const raw = (ev.target as HTMLInputElement).value;
    if (raw === '') delete entry.detailOpacity; else entry.detailOpacity = Number(raw);
    commit();
  });
  host.querySelector('[data-e="Comment"]')!.addEventListener('input', (ev) => {
    const entry = entryOf(); if (!entry) return;
    const v = (ev.target as HTMLInputElement).value;
    if (v === '') delete entry.Comment; else entry.Comment = v; _deps!.markDirty(); bgNotify();
  });

  updateBackdropForm();
}

export function updateBackdropForm(): void {
  if (!_host || !_deps) return;
  const entry = entryOf();
  _host.style.display = entry ? '' : 'none';
  if (!entry) return;
  const active = document.activeElement;
  const set = (sel: string, val: string) => { const el = _host!.querySelector<HTMLInputElement | HTMLSelectElement>(sel); if (el && el !== active) el.value = val; };
  const check = (sel: string, on: boolean) => { const el = _host!.querySelector<HTMLInputElement>(sel); if (el && el !== active) el.checked = on; };

  // populate image selects from eligible assets each update (cheap; assets change rarely)
  const images = _deps.ctx().assets.images.filter((a) => a.status !== 'rejected-format').map((a) => a.path);
  const tcNames = _deps.ctx().index.definitions('bg:texcoords');

  const [l0, l1] = readLayers(entry);
  [l0, l1].forEach((l, i) => {
    const card = _host!.querySelector<HTMLElement>(`[data-layer="${i}"]`)!;
    const p = `[data-layer="${i}"] `;
    check(p + '[data-l="enabled"]', l.enabled);
    const inList = ['#HURL_NOISE', ...images].includes(l.image);
    const imgSel = card.querySelector<HTMLSelectElement>('[data-l="image"]')!;
    if (imgSel !== active) fillOptions(imgSel, ['#HURL_NOISE', ...images], inList ? l.image : '', '(none)');
    set(p + '[data-l="imagePath"]', inList ? '' : l.image);
    const tcSel = card.querySelector<HTMLSelectElement>('[data-l="texCoord"]')!;
    if (tcSel !== active) fillOptions(tcSel, tcNames, l.texCoord, '(none)');
    set(p + '[data-l="wrapX"]', l.wrapX); set(p + '[data-l="wrapY"]', l.wrapY);
  });

  check('[data-g="enabled"]', glassEnabled(entry));
  const g = entry['Frosted Glass'] ?? {};
  set('[data-g="blur"]', String(g.blur ?? 0.5)); set('[data-g="zoom"]', String(g.zoom ?? 1)); set('[data-g="opacity"]', String(g.opacity ?? 0));
  set('[data-e="detailOpacity"]', entry.detailOpacity != null ? String(entry.detailOpacity) : '');
  set('[data-e="Comment"]', entry.Comment ?? '');
}
