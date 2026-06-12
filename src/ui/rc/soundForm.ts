// src/ui/rc/soundForm.ts
import { rcState } from '../../rc/state';
import type { RcFormDeps } from './types';

const RANGES = ['tone', 'speed', 'volume'] as const;
let host: HTMLElement | null = null, deps: RcFormDeps | null = null;
const soundOf = (): any => { const n = rcState.selected.sounds; return n ? deps!.file.root['Sound Effects']?.[n] : null; };

export function mountSoundForm(h: HTMLElement, d: RcFormDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-form';
  const fs = document.createElement('fieldset'); fs.className = 'pf-zone';
  const lg = document.createElement('legend'); lg.textContent = 'Sound Effect'; fs.appendChild(lg);

  const fileRow = document.createElement('label'); fileRow.className = 'rc-slot';
  fileRow.append(span('file'));
  const fileSel = document.createElement('select'); fileSel.dataset.k = 'file';
  fileSel.addEventListener('change', () => { const s = soundOf(); if (!s) return; s.file = fileSel.value; deps!.markDirty(); });
  fileRow.appendChild(fileSel); fs.appendChild(fileRow);

  for (const key of RANGES) {
    const row = document.createElement('label'); row.className = 'rc-slot';
    row.append(span(key));
    const on = document.createElement('input'); on.type = 'checkbox'; on.dataset.on = key;
    const min = document.createElement('input'); min.type = 'number'; min.step = 'any'; min.style.width = '64px'; min.dataset.min = key;
    const max = document.createElement('input'); max.type = 'number'; max.step = 'any'; max.style.width = '64px'; max.dataset.max = key;
    const writeRange = () => {
      const s = soundOf(); if (!s) return;
      if (on.checked) s[key] = [Number(min.value) || 0, Number(max.value) || 0];
      else delete s[key];
      deps!.markDirty();
    };
    on.addEventListener('change', writeRange); min.addEventListener('change', writeRange); max.addEventListener('change', writeRange);
    row.append(on, min, max); fs.appendChild(row);
  }
  h.appendChild(fs);

  const cf = document.createElement('label'); cf.className = 'rc-comment'; cf.textContent = 'Comment ';
  const ci = document.createElement('input'); ci.type = 'text'; ci.dataset.k = 'Comment';
  ci.addEventListener('change', () => { const s = soundOf(); if (!s) return; if (ci.value) s.Comment = ci.value; else delete s.Comment; deps!.markDirty(); });
  cf.appendChild(ci); h.appendChild(cf);
  updateSoundForm();
}

function span(t: string): HTMLElement { const s = document.createElement('span'); s.className = 'rc-slot-name'; s.textContent = t; return s; }

export function updateSoundForm(): void {
  if (!host || !deps) return;
  const s = soundOf(); host.style.display = s ? '' : 'none'; if (!s) return;
  const active = document.activeElement;
  const fileSel = host.querySelector<HTMLSelectElement>('select[data-k="file"]')!;
  const sounds = deps.ctx().assets.sounds.filter((a) => a.status !== 'rejected-format').map((a) => a.path);
  const cur = s.file ?? '';
  fileSel.replaceChildren();
  for (const p of ['', ...sounds]) { const o = document.createElement('option'); o.value = p; o.textContent = p || '— none —'; fileSel.appendChild(o); }
  if (cur && !sounds.includes(cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = `${cur} (missing)`; fileSel.appendChild(o); }
  if (fileSel !== active) fileSel.value = cur;

  for (const key of RANGES) {
    const on = host.querySelector<HTMLInputElement>(`input[data-on="${key}"]`)!;
    const min = host.querySelector<HTMLInputElement>(`input[data-min="${key}"]`)!;
    const max = host.querySelector<HTMLInputElement>(`input[data-max="${key}"]`)!;
    const has = Array.isArray(s[key]);
    if (on !== active) on.checked = has;
    min.disabled = max.disabled = !has;
    if (has) { if (min !== active) min.value = String(s[key][0]); if (max !== active) max.value = String(s[key][1]); }
  }
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = s.Comment ?? '';
}
