// tests/bg/gradients.test.ts
import { describe, it, expect } from 'vitest';
import { type Mark, marksAscending, alphaRange, bakeGradient } from '../../src/bg/gradients';

const px = (row: Float32Array, i: number) => [row[i * 4], row[i * 4 + 1], row[i * 4 + 2], row[i * 4 + 3]];

describe('marksAscending', () => {
  it('accepts non-decreasing t, rejects a dip', () => {
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.5, [1, 1, 1, 1]]])).toBe(true);
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.5, [1, 1, 1, 1]], [0.5, [1, 0, 0, 1]]])).toBe(true);
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.8, [1, 1, 1, 1]], [0.3, [1, 0, 0, 1]]])).toBe(false);
  });
});

describe('bakeGradient', () => {
  it('empty → all white (linear 1,1,1,1)', () => {
    const r = bakeGradient([]);
    expect(r).toHaveLength(128 * 4);
    expect(px(r, 0)).toEqual([1, 1, 1, 1]);
    expect(px(r, 127)).toEqual([1, 1, 1, 1]);
  });

  it('single mark → flat fill, rgb linearized, alpha untouched', () => {
    const r = bakeGradient([[0.5, [1, 0, 0, 0.5]]]);
    // pow(1,2.2)=1, pow(0,2.2)=0; alpha stays 0.5
    expect(px(r, 0)).toEqual([1, 0, 0, 0.5]);
    expect(px(r, 64)).toEqual([1, 0, 0, 0.5]);
  });

  it('black→white midpoint lerps in linear space (texel value ≈ n)', () => {
    const r = bakeGradient([[0, [0, 0, 0, 1]], [1, [1, 1, 1, 1]]]);
    const [rr] = px(r, 64);
    expect(rr).toBeCloseTo(64 / 127, 5);
  });

  it('end-extension: marks at 0.25..0.75 flat-fill the ends', () => {
    const r = bakeGradient([[0.25, [1, 0, 0, 1]], [0.75, [0, 0, 1, 1]]]);
    expect(px(r, 0)).toEqual([1, 0, 0, 1]);   // before first → first color
    expect(px(r, 127)).toEqual([0, 0, 1, 1]); // after last → last color
  });

  it('alphaRange uses |alpha|', () => {
    expect(alphaRange([[0, [0, 0, 0, -1]], [1, [1, 1, 1, 0.5]]])).toEqual([128, 255]);
  });

  it('byte-parity: a fixed gradient bakes to stable bytes (guards the gradientBar extraction)', () => {
    const marks: Mark[] = [[0, [0.1, 0.2, 0.3, 1]], [0.5, [0.9, 0.1, 0.4, 0.8]], [1, [1, 1, 1, 1]]];
    const baked = Array.from(bakeGradient(marks));
    // First sample is the linearized first mark. bakeGradient returns a Float32Array, so the
    // round-tripped values are float32-rounded — assert closeness to the float64 pow(), not equality.
    expect(baked[0]).toBeCloseTo(Math.pow(0.1, 2.2), 6);
    expect(baked[1]).toBeCloseTo(Math.pow(0.2, 2.2), 6);
    expect(baked[2]).toBeCloseTo(Math.pow(0.3, 2.2), 6);
    expect(baked[3]).toBe(1);
    expect(baked.length).toBe(128 * 4);
    expect(baked).toMatchSnapshot();
  });
});
