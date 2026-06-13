// tests/rc/spline.test.ts
import { describe, it, expect } from 'vitest';
import { fromMarks, durationOf, sampleSpline, type Mark1, type Mark2 } from '../../src/rc/spline';

// Hand-evaluate the engine cubic for cross-checks.
function cubicRef(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m1 = (p1 - p0) - (p2 - p0) / 2 + (p2 - p1);
  const m2 = (p2 - p1) - (p3 - p1) / 2 + (p3 - p2);
  const a = 2 * (p1 - p2) + m1 + m2;
  const b = -3 * (p1 - p2) - m1 - m1 - m2;
  const c = m1, d = p1;
  return a * t * t * t + b * t * t + c * t + d;
}

describe('rc/spline', () => {
  it('single mark is a constant', () => {
    const m: Mark1[] = [[0, 7]];
    expect(sampleSpline(m, 1, 0, false)).toEqual([7]);
    expect(sampleSpline(m, 1, 99, false)).toEqual([7]);
    expect(durationOf(m)).toBe(0);
  });

  it('clamps before the first knot and after the last (one-shot)', () => {
    const m: Mark1[] = [[1, 10], [2, 20], [3, 30]];
    expect(sampleSpline(m, 1, 0, false)).toEqual([10]); // t < input[0] → output[0]
    expect(sampleSpline(m, 1, 5, false)).toEqual([30]); // past end → output[last]
  });

  it('matches the engine cubic in the t<input[1] segment (one-shot)', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5]]; // input[0]=0,input[1]=1
    // one-shot: loopBegin=false → indices (0,0,1, min(2,2)=2); local t = (t-0)/(1-0)
    const got = sampleSpline(m, 1, 0.5, false)[0];
    const want = cubicRef(0, 0, 10, 5, 0.5);
    expect(got).toBeCloseTo(want, 10);
  });

  it('matches the engine cubic in a general interior segment', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5], [3, 8]];
    // t in [input[2],input[3]) → i=3: indices (1,2,3, min(4,3)=3); local t=(t-input[2])/(input[3]-input[2])
    const got = sampleSpline(m, 1, 2.25, false)[0];
    const want = cubicRef(10, 5, 8, 8, 0.25);
    expect(got).toBeCloseTo(want, 10);
  });

  it('loop wraps neighbours before the first knot', () => {
    const m: Mark1[] = [[1, 10], [2, 20], [3, 30]]; // elements=3, input[0]=1
    // t<input[0] & loop → compute(elements-2,elements-1,0,1, t/input[0]) = (1,2,0,1, 0.5/1)
    const got = sampleSpline(m, 1, 0.5, true)[0];
    const want = cubicRef(20, 30, 10, 20, 0.5);
    expect(got).toBeCloseTo(want, 10);
  });

  it('loop applies modulo on the duration', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5]];
    expect(sampleSpline(m, 1, 2, true)).toEqual(sampleSpline(m, 1, 0, true)); // dur=2 → t=2 wraps to 0
  });

  it('samples 2D component-wise', () => {
    const m: Mark2[] = [[0, [0, 0]], [1, [10, -4]], [2, [5, 2]]];
    const got = sampleSpline(m, 2, 0.5, false);
    expect(got[0]).toBeCloseTo(cubicRef(0, 0, 10, 5, 0.5), 10);
    expect(got[1]).toBeCloseTo(cubicRef(0, 0, -4, 2, 0.5), 10);
  });

  it('returns zeros for empty marks instead of crashing', () => {
    expect(sampleSpline([], 1, 0.5, false)).toEqual([0]);
    expect(sampleSpline([], 2, 0.5, true)).toEqual([0, 0]);
  });

  it('durationOf is the last knot time', () => {
    expect(durationOf([[0, 0], [1.5, 9]] as Mark1[])).toBe(1.5);
  });

  it('fromMarks splits input/output', () => {
    const s = fromMarks([[0, [1, 2]], [1, [3, 4]]] as Mark2[]);
    expect(s.input).toEqual([0, 1]);
    expect(s.output).toEqual([[1, 2], [3, 4]]);
  });
});
