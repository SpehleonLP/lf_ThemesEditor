// src/ui/bg/texCoordForm.ts
import { bgState, bgNotify } from '../../bg/state';
import type { BgFormDeps } from './types';

// [key, label, isVec2, defaultText]
const FIELDS: [string, string, boolean, string][] = [
  ['normalization', 'normalization (point↔normalized blend; <0 adds aspect comp)', false, '0'],
  ['spinSpeed', 'spinSpeed (turns/sec ×2π)', false, '0'],
  ['rotationCenter', 'rotationCenter x,y', true, '0,0'],
  ['scrollFactor', 'scrollFactor x,y', true, '0,0'],
  ['scaleFactor', 'scaleFactor x,y (bigger = more repeats)', true, '1,1'],
  ['initialTime', 'initialTime (sec)', false, '0'],
  ['timeFactor', 'timeFactor (0 = static, 1 = realtime)', false, '1'],
];
let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;
const entryOf = () => { const n = bgState.selected.texcoords; return n ? _deps!.file.root.TexCoords?.[n] : null; };

export function mountTexCoordForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-tc-form';
  const rows = FIELDS.map(([k, label, vec, def]) => vec
    ? `<label>${label}: <input type="number" step="any" data-k="${k}" data-i="0" placeholder="${def.split(',')[0]}" style="width:70px"><input type="number" step="any" data-k="${k}" data-i="1" placeholder="${def.split(',')[1]}" style="width:70px"></label>`
    : `<label>${label}: <input type="number" step="any" data-k="${k}" placeholder="${def}"></label>`).join('');
  host.innerHTML = `${rows}<label>Comment: <input type="text" data-k="Comment" placeholder="(comment)"></label><div class="bg-refby" data-refby></div>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  host.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
    const ev = inp.type === 'text' ? 'input' : 'change';
    inp.addEventListener(ev, () => {
      const entry = entryOf(); if (!entry) return;
      const k = inp.dataset.k!;
      if (k === 'Comment') { if (inp.value === '') delete entry.Comment; else entry.Comment = inp.value; commit(); return; }
      if (inp.dataset.i != null) {
        const i = Number(inp.dataset.i);
        const arr = Array.isArray(entry[k]) ? entry[k].slice() : (k === 'scaleFactor' ? [1, 1] : [0, 0]);
        if (inp.value === '') { /* keep */ } else arr[i] = Number(inp.value);
        entry[k] = arr;
      } else {
        if (inp.value === '') delete entry[k]; else entry[k] = Number(inp.value);
      }
      commit();
    });
  });
  updateTexCoordForm();
}

export function updateTexCoordForm(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.texcoords; const entry = entryOf();
  _host.style.display = entry ? '' : 'none'; if (!entry || !name) return;
  const active = document.activeElement;
  _host.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
    if (inp === active) return;
    const k = inp.dataset.k!;
    if (k === 'Comment') { inp.value = entry.Comment ?? ''; return; }
    if (inp.dataset.i != null) { const arr = entry[k]; inp.value = Array.isArray(arr) ? String(arr[Number(inp.dataset.i)] ?? '') : ''; }
    else inp.value = entry[k] != null ? String(entry[k]) : '';
  });
  // REFERENCED BY
  const refby = _host.querySelector<HTMLElement>('[data-refby]')!;
  const consumers = _deps.ctx().index.consumers('bg:texcoords', name);
  refby.replaceChildren();
  const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
  for (const c of consumers) {
    const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.from.label; refby.appendChild(r);
  }
}
