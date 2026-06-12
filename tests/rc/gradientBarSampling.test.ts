import { describe, it, expect } from 'vitest';
import { sampleRow } from '../../src/ui/bg/gradientBar';
import type { Mark } from '../../src/bg/gradients';
import { sampleSpline } from '../../src/rc/spline';

describe('gradientBar engine-cubic-raw sampling', () => {
  it('samples the dim-4 cubic over [0,maxT] at parametric x', () => {
    const marks: Mark[] = [[0, [1, 0, 0, 1]], [1, [0, 1, 0, 1]], [2, [0, 0, 1, 1]]];
    const sampler = sampleRow(marks, 'engine-cubic-raw');
    // x=0 → t=0 → first knot exactly (clamp at start)
    expect(sampler(0)).toEqual(sampleSpline(marks, 4, 0, false));
    // x=0.5 → t = 0.5 * maxT(=2) = 1 → exact middle knot
    expect(sampler(0.5)).toEqual(sampleSpline(marks, 4, 1, false));
    // x=1 → t = maxT = 2 → last knot
    expect(sampler(1)).toEqual(sampleSpline(marks, 4, 2, false));
  });
  it('linear-srgb sampler returns de-linearized values in [0,1]-ish range', () => {
    const marks: Mark[] = [[0, [0.5, 0.5, 0.5, 1]], [1, [0.5, 0.5, 0.5, 1]]];
    const sampler = sampleRow(marks, 'linear-srgb');
    const [r] = sampler(0.5);
    expect(r).toBeGreaterThan(0.4); expect(r).toBeLessThan(0.6);
  });
});
