// src/ui/rc/splinePlot.ts
import { sampleSpline, durationOf, type AnyMark } from '../../rc/spline';

const W = 360, H = 200, PAD = 28;

export interface SplinePlotOpts {
  dim: 1 | 2;                          // 1D: value is number; 2D: value is [x,y]
  getMarks(): AnyMark[];
  setMarks(marks: AnyMark[], opts: { live: boolean }): void;
  loop(): boolean;                     // sample with loop (states) or clamp (one-shots) for the drawn curve
}

const TRACE_COLORS = ['#6cf', '#f96'];

export function createSplinePlot(host: HTMLElement, opts: SplinePlotOpts): { update(): void } {
  host.replaceChildren(); host.className = 'rc-plot';
  // The editor host is shared across RC tabs; the form mounts (curve/event/sound) hide it via an
  // inline display:none when nothing is selected. The plot always wants to be visible, so clear
  // that stale inline style instead of inheriting a leaked display:none from a prior tab.
  host.style.display = '';
  host.innerHTML = `
    <canvas data-c="plot" width="${W}" height="${H}" class="rc-plot-canvas"></canvas>
    <div class="rc-plot-marks" data-marks></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>('[data-c="plot"]')!;

  const comp = (m: AnyMark): number[] => (Array.isArray(m[1]) ? m[1].slice() : [m[1] as number]);
  const maxTOf = (marks: AnyMark[]) => Math.max(durationOf(marks), 1e-6);
  function yRange(marks: AnyMark[]): [number, number] {
    let lo = Infinity, hi = -Infinity;
    for (const m of marks) for (const v of comp(m)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1; return [lo - pad, hi + pad];
  }
  const sx = (t: number, maxT: number) => PAD + (t / maxT) * (W - 2 * PAD);
  const sy = (v: number, lo: number, hi: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const tFromX = (x: number, maxT: number) => Math.max(0, ((x - PAD) / (W - 2 * PAD)) * maxT);
  const vFromY = (y: number, lo: number, hi: number) => lo + ((H - PAD - y) / (H - 2 * PAD)) * (hi - lo);

  let sel = 0, dragging = -1;

  function draw(): void {
    const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, W, H);
    const marks = opts.getMarks(); if (!marks.length) return;
    const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    // axes
    ctx.strokeStyle = '#33333d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, sy(0, lo, hi)); ctx.lineTo(W - PAD, sy(0, lo, hi)); ctx.stroke();
    // one trace per component
    for (let k = 0; k < opts.dim; k++) {
      ctx.strokeStyle = TRACE_COLORS[k]; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let px = 0; px <= W - 2 * PAD; px++) {
        const t = (px / (W - 2 * PAD)) * maxT;
        const v = sampleSpline(marks, opts.dim, t, opts.loop())[k];
        const X = PAD + px, Y = sy(v, lo, hi);
        if (px === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    // handles (one per mark; in 2D the handle moves component 0's y for hit-testing, both shown)
    marks.forEach((m, i) => {
      const X = sx(m[0], maxT);
      comp(m).forEach((v, k) => {
        const Y = sy(v, lo, hi); ctx.beginPath(); ctx.arc(X, Y, i === sel ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = TRACE_COLORS[k]; ctx.fill(); ctx.strokeStyle = i === sel ? '#fff' : '#000'; ctx.lineWidth = 2; ctx.stroke();
      });
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    const marks = opts.getMarks(); if (!marks.length) return;
    const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    let nearest = -1, best = 12 * 12;
    marks.forEach((m, i) => {
      const X = sx(m[0], maxT);
      comp(m).forEach((v) => { const Y = sy(v, lo, hi); const d = (X - e.offsetX) ** 2 + (Y - e.offsetY) ** 2; if (d < best) { best = d; nearest = i; } });
    });
    if (nearest >= 0) { sel = nearest; dragging = nearest; canvas.setPointerCapture(e.pointerId); draw(); }
    else {
      const t = tFromX(e.offsetX, maxT);
      const sampled = sampleSpline(marks, opts.dim, t, opts.loop());
      const value: number | number[] = opts.dim === 1 ? sampled[0] : [sampled[0], sampled[1]];
      const next = [...marks, [t, value] as AnyMark]; sel = next.length - 1;
      opts.setMarks(next, { live: false }); renderMarks();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const marks = opts.getMarks().slice(); const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    const t = tFromX(e.offsetX, maxT); const v = vFromY(e.offsetY, lo, hi);
    const old = marks[dragging];
    // drag t for both components; drag value for component 0 (1D) — keep 2D simple: move t only, edit y via numeric list.
    marks[dragging] = opts.dim === 1 ? [t, v] : [t, (old[1] as number[]).slice() as any];
    opts.setMarks(marks, { live: true });
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragging < 0) return; canvas.releasePointerCapture(e.pointerId);
    const marks = opts.getMarks().slice(); const draggedT = marks[dragging][0];
    marks.sort((a, b) => a[0] - b[0]); sel = marks.findIndex((m) => m[0] === draggedT);
    dragging = -1; opts.setMarks(marks, { live: false }); renderMarks();
  });

  // Numeric mark list mirrors the canvas (the authoritative editor for 2D y-values).
  function renderMarks(): void {
    const box = host.querySelector<HTMLElement>('[data-marks]')!; box.replaceChildren();
    const marks = opts.getMarks();
    marks.forEach((m, i) => {
      const row = document.createElement('div'); row.className = 'rc-mark-row' + (i === sel ? ' rc-mark-active' : '');
      const tIn = numInput(String(m[0]), (val) => editMark(i, (mm) => { mm[0] = val; }));
      row.append(label('t', tIn));
      comp(m).forEach((v, k) => {
        const inp = numInput(String(v), (val) => editMark(i, (mm) => { if (opts.dim === 1) mm[1] = val; else (mm[1] as number[])[k] = val; }));
        row.append(label(opts.dim === 1 ? 'v' : (k === 0 ? 'x' : 'y'), inp));
      });
      const del = document.createElement('button'); del.className = 'rc-mark-del'; del.textContent = '✕';
      del.addEventListener('click', () => { const cur = opts.getMarks(); if (cur.length <= 1) return; const next = cur.filter((_, j) => j !== i); sel = Math.max(0, sel - 1); opts.setMarks(next, { live: false }); renderMarks(); });
      row.append(del);
      row.addEventListener('click', () => { sel = i; draw(); renderMarks(); });
      box.appendChild(row);
    });
  }
  function editMark(i: number, mutate: (m: AnyMark) => void): void {
    const marks = opts.getMarks().map((m) => [m[0], Array.isArray(m[1]) ? m[1].slice() : m[1]] as AnyMark);
    mutate(marks[i]); marks.sort((a, b) => a[0] - b[0]); opts.setMarks(marks, { live: false }); renderMarks(); draw();
  }
  function numInput(val: string, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.value = val; inp.style.width = '64px';
    inp.addEventListener('change', () => onChange(Number(inp.value)));
    return inp;
  }
  function label(text: string, inp: HTMLElement): HTMLElement {
    const l = document.createElement('label'); l.className = 'rc-mark-lbl'; l.textContent = `${text} `; l.appendChild(inp); return l;
  }

  function update(): void { draw(); renderMarks(); }
  update();
  return { update };
}
