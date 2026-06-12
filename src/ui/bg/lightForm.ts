// src/ui/bg/lightForm.ts
import { bgState, bgNotify, setPairing } from '../../bg/state';
import { fillOptions } from '../options';
import type { BgFormDeps } from './types';

const MODES = ['None', 'FADE', 'SAW', 'SINE', 'TRIANGLE'];
let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;

const entryOf = () => {
  const name = bgState.selected.lights;
  return name ? _deps!.file.root.Lights?.[name] : null;
};

export function mountLightForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps;
  host.replaceChildren(); host.className = 'bg-light-form';
  host.innerHTML = `
    <div data-note="white" class="bg-note" style="display:none">Light 0 is the hard-wired white fallback; this entry is enum 1.</div>
    <label>Gradient: <select data-f="gradient"></select> <button data-f="gGo" title="go to definition">↗</button></label>
    <label>TexCoord: <select data-f="texCoord"></select></label>
    <label>Direction x/y: <input type="number" step="any" data-f="dir0" style="width:70px"><input type="number" step="any" data-f="dir1" style="width:70px">
      <canvas data-f="dial" width="40" height="40" class="bg-dial"></canvas></label>
    <div class="bg-note">packed as normalize(direction)·scale</div>
    <label>Scale: <input type="number" step="any" data-f="scale"></label>
    <label>Radial: <input type="range" min="0" max="1" step="0.01" data-f="radialR"><input type="number" step="any" data-f="radial" style="width:70px"></label>
    <label>Amplitude: <input type="number" step="any" data-f="amplitude"></label>
    <label>Mode: <select data-f="mode">${MODES.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label>Comment: <input type="text" data-f="Comment" placeholder="(comment)"></label>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  const writeNum = (key: string, raw: string) => {
    const entry = entryOf(); if (!entry) return;
    if (raw === '') delete entry[key]; else entry[key] = Number(raw); commit();
  };

  host.querySelector('[data-f="gradient"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (entry) { entry.gradient = v; commit(); } });
  host.querySelector('[data-f="gGo"]')!.addEventListener('click', () => { const g = entryOf()?.gradient; if (g) _deps!.ctx().navigate({ surface: 'backgrounds', entry: { ns: 'bg:gradients', name: g } }); });
  host.querySelector('[data-f="texCoord"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (!entry) return; if (v === '') delete entry.texCoord; else entry.texCoord = v; commit(); });
  host.querySelector('[data-f="mode"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (!entry) return; if (v === 'None') delete entry.mode; else entry.mode = v; commit(); });
  for (const [k, n] of [['dir0', 0], ['dir1', 1]] as const) host.querySelector(`[data-f="${k}"]`)!.addEventListener('change', (e) => {
    const entry = entryOf(); if (!entry) return;
    const d = Array.isArray(entry.direction) ? entry.direction.slice() : [0, 1];
    d[n] = Number((e.target as HTMLInputElement).value); entry.direction = d; commit();
  });
  for (const k of ['scale', 'radial', 'amplitude']) host.querySelector(`[data-f="${k}"]`)!.addEventListener('change', (e) => writeNum(k, (e.target as HTMLInputElement).value));
  host.querySelector('[data-f="radialR"]')!.addEventListener('input', (e) => writeNum('radial', (e.target as HTMLInputElement).value));
  host.querySelector('[data-f="Comment"]')!.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; const entry = entryOf(); if (!entry) return; if (v === '') delete entry.Comment; else entry.Comment = v; commit(); });

  updateLightForm();
}

export function updateLightForm(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.lights;
  const entry = entryOf();
  _host.style.display = entry ? '' : 'none';
  if (!entry || !name) return;

  // Selecting a light pairs it as preview light0 for the current preview slot.
  const slot = bgState.selected.backdrops; if (slot) setPairing(slot, name, bgState.pairing[slot]?.[1] ?? '');

  const active = document.activeElement;
  const set = (sel: string, val: string) => { const el = _host!.querySelector<HTMLInputElement | HTMLSelectElement>(sel); if (el && el !== active) el.value = val; };
  (_host.querySelector('[data-note="white"]') as HTMLElement).style.display = name === 'White' ? '' : 'none';

  const gNames = _deps.ctx().index.definitions('bg:gradients');
  const gSel = _host.querySelector<HTMLSelectElement>('[data-f="gradient"]')!;
  if (gSel !== active) fillOptions(gSel, gNames, entry.gradient ?? '', '(none — required)');
  const tcNames = _deps.ctx().index.definitions('bg:texcoords');
  const tSel = _host.querySelector<HTMLSelectElement>('[data-f="texCoord"]')!;
  if (tSel !== active) fillOptions(tSel, tcNames, entry.texCoord ?? '', '(inherit layer texCoord)');

  const dir = Array.isArray(entry.direction) ? entry.direction : [0, 1];
  set('[data-f="dir0"]', String(dir[0])); set('[data-f="dir1"]', String(dir[1]));
  set('[data-f="scale"]', entry.scale != null ? String(entry.scale) : '');
  set('[data-f="radial"]', entry.radial != null ? String(entry.radial) : ''); set('[data-f="radialR"]', String(entry.radial ?? 0));
  set('[data-f="amplitude"]', entry.amplitude != null ? String(entry.amplitude) : '');
  set('[data-f="mode"]', typeof entry.mode === 'string' && MODES.includes(entry.mode) ? entry.mode : 'None');
  set('[data-f="Comment"]', entry.Comment ?? '');
  drawDial(_host.querySelector('[data-f="dial"]')!, dir as [number, number]);
}

function drawDial(c: HTMLCanvasElement, dir: [number, number]): void {
  const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, 40, 40); ctx.translate(20, 20);
  const len = Math.hypot(dir[0], dir[1]) || 1; const x = (dir[0] / len) * 16, y = (dir[1] / len) * 16;
  ctx.strokeStyle = '#8ab'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
