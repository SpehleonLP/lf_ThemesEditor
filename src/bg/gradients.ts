// src/bg/gradients.ts
// Faithful port of the gradient bake (gui_packagebuilder.cpp:1164-1230).
// The baked row stores LINEAR values (the engine's de-linearize step is commented out);
// callers that DISPLAY a ramp must apply pow(1/2.2) themselves.
export type Rgba4 = [number, number, number, number];
export type Mark = [number, Rgba4]; // [t, [r,g,b,a]]

const WIDTH = 128;
const lin = (c: number) => Math.pow(c, 2.2);

export function marksAscending(marks: Mark[]): boolean {
  for (let i = 1; i < marks.length; ++i) if (marks[i][0] < marks[i - 1][0]) return false;
  return true;
}

export function alphaRange(marks: Mark[]): [number, number] {
  let min = 255, max = 0;
  for (const [, c] of marks) {
    const a = Math.abs(c[3]) * 255;
    min = Math.min(min, a); max = Math.max(max, a);
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(min), clamp(max)];
}

function linearize(marks: Mark[]): Mark[] {
  return marks.map(([t, c]) => [t, [lin(c[0]), lin(c[1]), lin(c[2]), c[3]]] as Mark);
}

export function bakeGradient(input: Mark[]): Float32Array {
  const out = new Float32Array(WIDTH * 4);
  let g = linearize(input);

  if (g.length === 0) g = [[0, [1, 1, 1, 1]]];

  if (g.length === 1) {
    const [, c] = g[0];
    for (let j = 0; j < WIDTH; ++j) out.set(c, j * 4);
    return out;
  }

  if (g[0][0] > 0) g = [[0, g[0][1]], ...g];
  if (g[g.length - 1][0] < 1) g = [...g, [1, g[g.length - 1][1]]];

  let i = 0; // itr; next = i+1
  for (let j = 0; j < WIDTH; ++j) {
    const n = j / (WIDTH - 1);
    while (i + 1 < g.length - 1 && g[i + 1][0] < n) ++i;
    const [t0, c0] = g[i];
    const [t1, c1] = g[i + 1];
    const span = t1 - t0;
    const t = span === 0 ? 0 : (n - t0) / span;
    for (let k = 0; k < 4; ++k) out[j * 4 + k] = c0[k] + (c1[k] - c0[k]) * t;
  }
  return out;
}
