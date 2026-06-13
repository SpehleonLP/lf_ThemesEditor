// src/rc/spline.ts
// Verbatim port of Gui::ThemePackage::Spline::compute (gui_themepackage.cpp:434-511).
// The engine evaluates a glm::vec Catmull-Rom cubic; it is affine in the control points,
// so we evaluate component-wise (identical result) for dims 1/2/4.

export type Dim = 1 | 2 | 4;
export type Mark1 = [number, number];           // [t, v]
export type Mark2 = [number, [number, number]]; // [t, [x, y]]
export type Mark4 = [number, [number, number, number, number]]; // [t, [r,g,b,a]]
export type AnyMark = [number, number | number[]];

export interface SplineData { input: number[]; output: number[][]; }

// Normalize JSON marks (value may be a scalar or a vector) into flat strided output rows.
export function fromMarks(marks: ReadonlyArray<AnyMark>): SplineData {
  const input: number[] = [];
  const output: number[][] = [];
  for (const [t, v] of marks) {
    input.push(t);
    output.push(Array.isArray(v) ? v.slice() : [v]);
  }
  return { input, output };
}

export function durationOf(marks: ReadonlyArray<AnyMark>): number {
  return marks.length ? marks[marks.length - 1][0] : 0;
}

// Engine cubic for one scalar component (compute<T>(n0,n1,n2,n3,t), kept un-simplified).
function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m1 = (p1 - p0) - (p2 - p0) / 2 + (p2 - p1);
  const m2 = (p2 - p1) - (p3 - p1) / 2 + (p3 - p2);
  const a = 2 * (p1 - p2) + m1 + m2;
  const b = -3 * (p1 - p2) - m1 - m1 - m2;
  const c = m1;
  const d = p1;
  return a * (t * t * t) + b * (t * t) + c * t + d;
}

function computeVec(out: number[][], n0: number, n1: number, n2: number, n3: number, t: number, dim: Dim): number[] {
  const r: number[] = [];
  for (let k = 0; k < dim; ++k) r.push(cubic(out[n0][k], out[n1][k], out[n2][k], out[n3][k], t));
  return r;
}

// Port of compute<T>(timestamp, loop_begin, loop_end) — index + local-t selection. t in seconds.
function computeSelect(s: SplineData, dim: Dim, t: number, loopBegin: boolean, loopEnd: boolean): number[] {
  const input = s.input, output = s.output, elements = input.length;
  if (elements === 0) return new Array<number>(dim).fill(0); // hand-edited doc; schema requires >=1
  if (elements === 1) return output[0].slice();

  if (t < input[0]) {
    if (loopBegin && elements >= 2) {
      return computeVec(output, elements - 2, elements - 1, 0, 1, t / input[0], dim);
    }
    return output[0].slice();
  }

  if (t < input[1]) {
    const afterTheEnd = loopEnd ? (2 % elements) : Math.min(2, elements - 1);
    return computeVec(output, loopBegin ? elements - 1 : 0, 0, 1, afterTheEnd,
      (t - input[0]) / (input[1] - input[0]), dim);
  }

  for (let i = 2; i < elements; ++i) {
    if (t < input[i]) {
      return computeVec(output, i - 2, i - 1, i,
        loopEnd ? (i + 1) % elements : Math.min(i + 1, elements - 1),
        (t - input[i - 1]) / (input[i] - input[i - 1]), dim);
    }
  }

  return output[elements - 1].slice();
}

// Sample at time `tSeconds`. Looping wraps on the duration (engine: timestamp % totalDurationMS)
// with neighbour wrap (loopBegin=loopEnd=true). One-shots clamp at the ends.
export function sampleSpline(marks: ReadonlyArray<AnyMark>, dim: Dim, tSeconds: number, loop: boolean): number[] {
  const s = fromMarks(marks);
  let t = tSeconds;
  if (loop) {
    const dur = durationOf(marks);
    if (dur > 0) t = ((tSeconds % dur) + dur) % dur;
  }
  return computeSelect(s, dim, t, loop, loop);
}
