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
  // denom = [1/100, 1/200, 1/100, 1/200]; final loop: 0 → +denom/2, 1 → −denom/2
  const expected = [0.005, 0.25, 0.5, 1 - 0.0025];
  out[0][0].forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
});

test('pixel grid: divide by size, pixel-1 gets extra half-texel, edges inset', () => {
  const out = normalizeCells(grid([0, 1, 50, 100]), [100, 100]);
  // x0: 0 → 0 → +0.005 = 0.005
  // y0: 1px → 0.01, p==1 → −denom/2 = 0.01−0.005 = 0.005
  // x1: 50px → 0.5
  // y1: 100px → 1.0 → final −denom/2 = 0.995
  expect(out[0][0][0]).toBeCloseTo(0.005, 10);
  expect(out[0][0][1]).toBeCloseTo(0.005, 10);
  expect(out[0][0][2]).toBeCloseTo(0.5, 10);
  expect(out[0][0][3]).toBeCloseTo(0.995, 10);
});

test('mirror signs survive normalization', () => {
  const out = normalizeCells(grid([-10, 5, -20, 15]), [100, 100]);
  expect(out[0][0][0]).toBeCloseTo(-0.1, 10);
  expect(out[0][0][2]).toBeCloseTo(-0.2, 10);
});

test('quantizeUnorm16 matches packUnorm4x16(abs/2) read back ×2', () => {
  expect(quantizeUnorm16(0)).toBe(0);
  expect(quantizeUnorm16(2)).toBe(2);
  expect(quantizeUnorm16(-0.5)).toBeCloseTo(0.5, 4); // abs() — sign lives in the flag bits
  const v = 0.123456;
  const q = quantizeUnorm16(v);
  expect(Math.abs(q - v)).toBeLessThanOrEqual(1 / 65535); // one unorm step (=2/65535 after ×2, halved by rounding)
});
