// src/ui/bg/gradientBar.ts
import { bakeGradient, type Mark } from '../../bg/gradients';
import { sampleSpline, type AnyMark } from '../../rc/spline';

export type GradientInterp = 'linear-srgb' | 'engine-cubic-raw';

export interface GradientBarOpts {
  getMarks(): Mark[];
  // live=true while dragging (store unsorted, do not commit dirty); live=false commits + sorts.
  setMarks(marks: Mark[], opts: { live: boolean }): void;
  consumers(): { label: string }[];
  interp: GradientInterp;
}

const WIDTH = 320, HEIGHT = 40;
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp255(v * 255).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`;
}

// Sample an RGBA at parametric x∈[0,1] for display, honouring the interp mode.
export function sampleRow(marks: Mark[], interp: GradientInterp): (x: number) => [number, number, number, number] {
  if (interp === 'linear-srgb') {
    const baked = bakeGradient(marks);
    return (x) => {
      const s = Math.round(clamp01(x) * 127) * 4;
      return [
        Math.pow(Math.max(baked[s], 0), 1 / 2.2),
        Math.pow(Math.max(baked[s + 1], 0), 1 / 2.2),
        Math.pow(Math.max(baked[s + 2], 0), 1 / 2.2),
        baked[s + 3],
      ];
    };
  }
  // engine-cubic-raw: marks are [t_seconds, rgba]; sample the dim-4 cubic over [0,maxT], values raw HDR.
  const maxT = marks.length ? marks[marks.length - 1][0] : 1;
  return (x) => {
    const t = (maxT > 0 ? x * maxT : 0);
    // Mark ([t,[r,g,b,a]]) is a dim-4 AnyMark; tuple/array variance needs an explicit cast.
    const v = sampleSpline(marks as unknown as AnyMark[], 4, t, false);
    return [v[0], v[1], v[2], v[3]];
  };
}

export function createGradientBar(host: HTMLElement, opts: GradientBarOpts): { update(): void } {
  host.replaceChildren(); host.className = 'bg-grad-editor';
  host.innerHTML = `
    <canvas data-c="bar" width="${WIDTH}" height="${HEIGHT}" class="bg-grad-bar"></canvas>
    <div class="bg-grad-stop">
      <label>t: <input type="number" step="any" data-s="t" style="width:70px"></label>
      <label>color: <input type="color" data-s="color"></label>
      <label>alpha: <input type="range" min="0" max="1" step="0.01" data-s="a"></label>
      <label>rgba: <input type="number" step="any" data-s="r" style="width:60px"><input type="number" step="any" data-s="g" style="width:60px"><input type="number" step="any" data-s="b" style="width:60px"><input type="number" step="any" data-s="a2" style="width:60px"></label>
      <button data-s="del">✕ delete stop</button>
    </div>
    <div class="bg-refby" data-refby></div>`;

  const bar = host.querySelector<HTMLCanvasElement>('[data-c="bar"]')!;
  let sel = 0;
  const marksOf = () => opts.getMarks();
  // Map handle position to parametric x∈[0,1] of the bar; for raw mode the mark's stored t scales by maxT.
  const xOfMark = (m: Mark, maxT: number) => (opts.interp === 'engine-cubic-raw' ? (maxT > 0 ? m[0] / maxT : 0) : m[0]) * WIDTH;
  const tFromX = (x: number, maxT: number) => {
    const u = clamp01(x / WIDTH);
    return opts.interp === 'engine-cubic-raw' ? u * (maxT > 0 ? maxT : 1) : u;
  };
  const maxTOf = (marks: Mark[]) => (marks.length ? Math.max(...marks.map((m) => m[0]), 1) : 1);

  let dragging = -1;
  let dragMaxT: number | null = null;
  bar.addEventListener('pointerdown', (e) => {
    const marks = marksOf(); if (!marks.length) return;
    const maxT = maxTOf(marks); const x = e.offsetX;
    let nearest = 0, best = Infinity;
    marks.forEach((m, i) => { const d = Math.abs(xOfMark(m, maxT) - x); if (d < best) { best = d; nearest = i; } });
    if (best <= 8) { dragging = nearest; sel = nearest; dragMaxT = maxT; bar.setPointerCapture(e.pointerId); update(); }
    else {
      // u is the parametric position ∈[0,1]; sampleRow takes u directly.
      // Stored mark t: linear-srgb → t=u; engine-cubic-raw → t=u*maxT.
      const u = clamp01(x / WIDTH);
      const t = opts.interp === 'engine-cubic-raw' ? u * (maxT > 0 ? maxT : 1) : u;
      const row = sampleRow(marks, opts.interp)(u);
      const col: Mark = [t, [row[0], row[1], row[2], row[3]]];
      const next = [...marks, col]; sel = next.length - 1;
      opts.setMarks(next, { live: false });
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging < 0 || dragMaxT === null) return;
    const marks = marksOf().slice();
    marks[dragging] = [tFromX(e.offsetX, dragMaxT), marks[dragging][1]];
    opts.setMarks(marks, { live: true });
  });
  function endDrag(e: PointerEvent): void {
    if (dragging < 0) return;
    try { bar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const marks = marksOf().slice();
    const dragged = marks[dragging];
    marks.sort((a, b) => a[0] - b[0]); sel = Math.max(0, marks.indexOf(dragged)); // identity, mirrors commitStop's `m === copy`
    dragging = -1; dragMaxT = null; opts.setMarks(marks, { live: false });
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  const commitStop = (mutate: (m: Mark) => void) => {
    const marks = marksOf().slice(); if (!marks[sel]) return;
    const copy: Mark = [marks[sel][0], [...marks[sel][1]] as Mark[1]]; mutate(copy); marks[sel] = copy;
    marks.sort((a, b) => a[0] - b[0]); sel = marks.findIndex((m) => m === copy);
    opts.setMarks(marks, { live: false });
  };
  host.querySelector('[data-s="t"]')!.addEventListener('change', (e) => commitStop((m) => { m[0] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="color"]')!.addEventListener('input', (e) => commitStop((m) => { const [r, g, b] = hexToRgb((e.target as HTMLInputElement).value); m[1][0] = r; m[1][1] = g; m[1][2] = b; }));
  host.querySelector('[data-s="a"]')!.addEventListener('input', (e) => commitStop((m) => { m[1][3] = Number((e.target as HTMLInputElement).value); }));
  for (const [s, idx] of [['r', 0], ['g', 1], ['b', 2], ['a2', 3]] as const)
    host.querySelector(`[data-s="${s}"]`)!.addEventListener('change', (e) => commitStop((m) => { m[1][idx] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="del"]')!.addEventListener('click', () => {
    const marks = marksOf(); if (marks.length <= 1) return; // schema minItems:1
    const next = marks.filter((_, i) => i !== sel); sel = Math.max(0, sel - 1); opts.setMarks(next, { live: false });
  });

  function drawBar(): void {
    const ctx = bar.getContext('2d')!; const marks = marksOf();
    for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#444' : '#666'; ctx.fillRect(x, y, 8, 8); }
    const sampler = sampleRow(marks, opts.interp);
    const img = ctx.createImageData(WIDTH, 1);
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b, a] = sampler(x / (WIDTH - 1));
      img.data[x * 4] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(r) : r) * 255);
      img.data[x * 4 + 1] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(g) : g) * 255);
      img.data[x * 4 + 2] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(b) : b) * 255);
      img.data[x * 4 + 3] = clamp255(clamp01(a) * 255);
    }
    const tmp = document.createElement('canvas'); tmp.width = WIDTH; tmp.height = 1; tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
    const maxT = maxTOf(marks);
    marks.forEach((mk, i) => {
      const x = xOfMark(mk, maxT); ctx.beginPath(); ctx.arc(x, HEIGHT / 2, i === sel ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = i === sel ? '#39f' : '#000'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  function update(): void {
    const marks = marksOf();
    drawBar();
    const m = marks[sel];
    const active = document.activeElement;
    const set = (s: string, v: string) => { const el = host.querySelector<HTMLInputElement>(s); if (el && el !== active) el.value = v; };
    if (m) {
      set('[data-s="t"]', String(m[0]));
      set('[data-s="color"]', rgbToHex(clamp01(m[1][0]), clamp01(m[1][1]), clamp01(m[1][2])));
      set('[data-s="a"]', String(clamp01(m[1][3]))); set('[data-s="a2"]', String(m[1][3]));
      set('[data-s="r"]', String(m[1][0])); set('[data-s="g"]', String(m[1][1])); set('[data-s="b"]', String(m[1][2]));
    }
    const refby = host.querySelector<HTMLElement>('[data-refby]')!;
    const consumers = opts.consumers();
    refby.replaceChildren();
    const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
    for (const c of consumers) { const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.label; refby.appendChild(r); }
  }

  update();
  return { update };
}
