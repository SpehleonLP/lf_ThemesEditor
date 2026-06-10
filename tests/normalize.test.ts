import { expect, test } from 'vitest';
import { isInPixels, normalizeCells, quantizeUnorm16 } from '../src/cells';
import type { Vec4 } from '../src/types';

const grid = (r: Vec4): Vec4[][] => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => r.slice() as Vec4));

test('isInPixels: |v|>1 triggers, Infinity does not, negatives count by magnitude', () => {
  expect(isInPixels(grid([0, 0, 1, 1]))).toBe(false);
  expect(isInPixels(grid([0, 0, Infinity, 1]))).toBe(false);
  expect(isInPixels(grid([0, 0, 2, 1]))).toBe(true);
  expect(isInPixels(grid([-0.5, 0, 1, 1]))).toBe(false);
  expect(isInPixels(grid([-2, 0, 1, 1]))).toBe(true);
});

test('normalized grid: Infinity→1, then half-texel insets at exactly 0 and 1', () => {
  const out = normalizeCells(grid([0, 0.25, 0.5, Infinity]), [100, 200]);
  // denom = [fround(1/100), fround(1/200), ...]; final loop: 0 → +half, 1 → −half (float32)
  const expected = [0.005, 0.25, 0.5, 1 - 0.0025];
  out[0][0].forEach((v, i) => expect(v).toBeCloseTo(expected[i], 7));
});

test('pixel grid: divide by size, pixel-1 gets extra half-texel, edges inset', () => {
  const out = normalizeCells(grid([0, 1, 50, 100]), [100, 100]);
  // x0: 0 → 0 → +0.005 = 0.005
  // y0: 1px → 0.01, p==1 → −denom/2 = 0.01−0.005 = 0.005
  // x1: 50px → 0.5
  // y1: 100px → 1.0 → final −denom/2 = 0.995
  expect(out[0][0][0]).toBeCloseTo(0.005, 7);
  expect(out[0][0][1]).toBeCloseTo(0.005, 7);
  expect(out[0][0][2]).toBeCloseTo(0.5, 10);
  expect(out[0][0][3]).toBeCloseTo(0.995, 7);
});

test('mirror signs survive normalization', () => {
  const out = normalizeCells(grid([-10, 5, -20, 15]), [100, 100]);
  expect(out[0][0][0]).toBeCloseTo(-0.1, 7);
  expect(out[0][0][2]).toBeCloseTo(-0.2, 7);
  expect(out[0][0][1]).toBeCloseTo(0.05, 7);
  expect(out[0][0][3]).toBeCloseTo(0.15, 7);
});

test('non-pow2 size: full-width pixel coord still gets the half-texel inset (float32 parity)', () => {
  // 49px wide: 49 * (1/49) is exactly 1.0 in float32 but 0.9999999999999999 in float64.
  // The engine (float32) applies the edge inset; the port must too.
  const out = normalizeCells(grid([0, 0, 49, 49]), [49, 49]);
  const denom = Math.fround(1 / 49);
  const half = Math.fround(denom * 0.5);
  const insetEdge = Math.fround(1.0 - half); // matches engine: fround(1 - half)
  // x1=49px → fround(49*denom)=1.0 → inset to fround(1 - half)
  expect(out[0][0][2]).toBeCloseTo(insetEdge, 10);
  expect(out[0][0][3]).toBeCloseTo(insetEdge, 10);
  // x0=0 → +half
  expect(out[0][0][0]).toBeCloseTo(half, 10);
});

test('quantizeUnorm16 matches packUnorm4x16(abs/2) read back ×2', () => {
  expect(quantizeUnorm16(0)).toBe(0);
  expect(quantizeUnorm16(2)).toBe(2);
  expect(quantizeUnorm16(-0.5)).toBeCloseTo(0.5, 4); // abs() — sign lives in the flag bits
  const v = 0.123456;
  const q = quantizeUnorm16(v);
  expect(Math.abs(q - v)).toBeLessThanOrEqual(1 / 65535); // one unorm step (=2/65535 after ×2, halved by rounding)
});
