// src/ui/bg/gradientEditor.ts
import { bgState, bgNotify } from '../../bg/state';
import { bakeGradient, type Mark } from '../../bg/gradients';
import type { BgFormDeps } from './types';

let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;
let _sel = 0; // selected stop index
const WIDTH = 320, HEIGHT = 40;

const marksOf = (): Mark[] => {
  const n = bgState.selected.gradients;
  const raw = n ? _deps!.file.root.Gradients?.[n] : null;
  return Array.isArray(raw) ? raw : [];
};
const writeMarks = (marks: Mark[]) => {
  const n = bgState.selected.gradients; if (!n) return;
  marks.sort((a, b) => a[0] - b[0]);
  _deps!.file.root.Gradients[n] = marks;
  bgState.gradientRev++; _deps!.markDirty(); bgNotify();
};

export function mountGradientEditor(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-grad-editor';
  host.innerHTML = `
    <canvas data-c="bar" width="${WIDTH}" height="${HEIGHT}" class="bg-grad-bar"></canvas>
    <div class="bg-grad-stop">
      <label>t: <input type="number" min="0" max="1" step="0.01" data-s="t" style="width:70px"></label>
      <label>color: <input type="color" data-s="color"></label>
      <label>alpha: <input type="range" min="0" max="1" step="0.01" data-s="a"></label>
      <label>rgba: <input type="number" step="any" data-s="r" style="width:60px"><input type="number" step="any" data-s="g" style="width:60px"><input type="number" step="any" data-s="b" style="width:60px"><input type="number" step="any" data-s="a2" style="width:60px"></label>
      <button data-s="del">✕ delete stop</button>
    </div>
    <div class="bg-refby" data-refby></div>`;

  const bar = host.querySelector<HTMLCanvasElement>('[data-c="bar"]')!;
  const tFromX = (x: number) => Math.max(0, Math.min(1, x / WIDTH));

  // Pointer drag of the nearest handle; commit-on-pointer-up.
  let dragging = -1;
  bar.addEventListener('pointerdown', (e) => {
    const marks = marksOf(); if (!marks.length) return;
    const x = e.offsetX; const t = tFromX(x);
    let nearest = 0, best = Infinity;
    marks.forEach((m, i) => { const d = Math.abs(m[0] * WIDTH - x); if (d < best) { best = d; nearest = i; } });
    if (best <= 8) { dragging = nearest; _sel = nearest; bar.setPointerCapture(e.pointerId); render(); }
    else { // click empty → insert stop with interpolated bake color
      const baked = bakeGradient(marks); const idx = Math.round(t * 127) * 4;
      const col: Mark = [t, [
        Math.pow(Math.max(baked[idx], 0), 1 / 2.2), Math.pow(Math.max(baked[idx + 1], 0), 1 / 2.2),
        Math.pow(Math.max(baked[idx + 2], 0), 1 / 2.2), baked[idx + 3],
      ]];
      const next = [...marks, col]; _sel = next.length - 1; writeMarks(next);
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const marks = marksOf().slice(); marks[dragging] = [tFromX(e.offsetX), marks[dragging][1]];
    _deps!.file.root.Gradients[bgState.selected.gradients!] = marks; bgState.gradientRev++; bgNotify(); // live, not yet sorted/committed dirty
  });
  bar.addEventListener('pointerup', (e) => {
    if (dragging < 0) return; bar.releasePointerCapture(e.pointerId);
    const marks = marksOf().slice(); // sort + commit; track the dragged stop's new index
    const draggedT = marks[dragging][0];
    marks.sort((a, b) => a[0] - b[0]); _sel = marks.findIndex((m) => m[0] === draggedT);
    dragging = -1; writeMarks(marks);
  });

  const commitStop = (mutate: (m: Mark) => void) => {
    const marks = marksOf().slice(); if (!marks[_sel]) return;
    const copy: Mark = [marks[_sel][0], [...marks[_sel][1]] as Mark[1]]; mutate(copy); marks[_sel] = copy; writeMarks(marks);
  };
  host.querySelector('[data-s="t"]')!.addEventListener('change', (e) => commitStop((m) => { m[0] = Math.max(0, Math.min(1, Number((e.target as HTMLInputElement).value))); }));
  host.querySelector('[data-s="color"]')!.addEventListener('input', (e) => commitStop((m) => { const [r, g, b] = hexToRgb((e.target as HTMLInputElement).value); m[1][0] = r; m[1][1] = g; m[1][2] = b; }));
  host.querySelector('[data-s="a"]')!.addEventListener('input', (e) => commitStop((m) => { m[1][3] = Number((e.target as HTMLInputElement).value); }));
  for (const [sel, idx] of [['r', 0], ['g', 1], ['b', 2], ['a2', 3]] as const)
    host.querySelector(`[data-s="${sel}"]`)!.addEventListener('change', (e) => commitStop((m) => { m[1][idx] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="del"]')!.addEventListener('click', () => {
    const marks = marksOf(); if (marks.length <= 1) return;
    const next = marks.filter((_, i) => i !== _sel); _sel = Math.max(0, _sel - 1); writeMarks(next);
  });

  function render(): void { updateGradientEditor(); }
  updateGradientEditor();
}

export function updateGradientEditor(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.gradients; const marks = marksOf();
  _host.style.display = name ? '' : 'none'; if (!name) return;
  drawBar(_host.querySelector('[data-c="bar"]')!, marks, _sel);

  const m = marks[_sel];
  const active = document.activeElement;
  const set = (sel: string, v: string) => { const el = _host!.querySelector<HTMLInputElement>(sel); if (el && el !== active) el.value = v; };
  if (m) {
    set('[data-s="t"]', String(m[0]));
    set('[data-s="color"]', rgbToHex(m[1][0], m[1][1], m[1][2]));
    set('[data-s="a"]', String(m[1][3])); set('[data-s="a2"]', String(m[1][3]));
    set('[data-s="r"]', String(m[1][0])); set('[data-s="g"]', String(m[1][1])); set('[data-s="b"]', String(m[1][2]));
  }
  const refby = _host.querySelector<HTMLElement>('[data-refby]')!;
  const consumers = _deps.ctx().index.consumers('bg:gradients', name);
  refby.replaceChildren();
  const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
  for (const c of consumers) { const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.from.label; refby.appendChild(r); }
}

function drawBar(c: HTMLCanvasElement, marks: Mark[], sel: number): void {
  const ctx = c.getContext('2d')!;
  // checkerboard underlay
  for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#444' : '#666'; ctx.fillRect(x, y, 8, 8); }
  // baked ramp (de-linearized for display)
  const baked = bakeGradient(marks);
  const img = ctx.createImageData(WIDTH, 1);
  for (let x = 0; x < WIDTH; x++) {
    const s = Math.round((x / (WIDTH - 1)) * 127) * 4;
    const a = Math.max(0, Math.min(1, baked[s + 3]));
    img.data[x * 4] = clamp255(Math.pow(Math.max(baked[s], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 1] = clamp255(Math.pow(Math.max(baked[s + 1], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 2] = clamp255(Math.pow(Math.max(baked[s + 2], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 3] = clamp255(a * 255);
  }
  // blit the 1px row scaled — draw into a temp then stretch
  const tmp = document.createElement('canvas'); tmp.width = WIDTH; tmp.height = 1; tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
  // handles
  marks.forEach((mk, i) => {
    const x = mk[0] * WIDTH; ctx.beginPath(); ctx.arc(x, HEIGHT / 2, i === sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = i === sel ? '#39f' : '#000'; ctx.lineWidth = 2; ctx.stroke();
  });
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp255(v * 255).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`;
}
