import { expect, test } from 'vitest';
import { computeBands } from '../src/bands';

test('point-unit margins divide by panel size (gates: tess[2]>1 for x, tess[1]>1 for y)', () => {
  const b = computeBands([10, 20, 30, 40], [1, 1, -1, -1], [200, 400]);
  expect(b.positionsX[1]).toBeCloseTo(10 / 200, 10);
  expect(b.positionsX[4]).toBeCloseTo(1 - 30 / 200, 10);
  expect(b.positionsY[1]).toBeCloseTo(20 / 400, 10);
  expect(b.positionsY[4]).toBeCloseTo(1 - 40 / 400, 10);
});

test('fraction-unit margins pass through when the gate value is <= 1', () => {
  // tess[2]=0.3 <= 1 → x margins are fractions; tess[1]=0.1 <= 1 → y margins are fractions
  const b = computeBands([0.2, 0.1, 0.3, 0.2], [1, 1, -1, -1], [200, 400]);
  expect(b.positionsX[1]).toBeCloseTo(0.2, 10);
  expect(b.positionsY[4]).toBeCloseTo(0.8, 10);
});

test('default CenterTile [1,1,-1,-1] collapses the center band to the right edge of the middle', () => {
  const b = computeBands([10, 10, 10, 10], [1, 1, -1, -1], [100, 100]);
  // c.x=0.01 > c.z=-0.01 → "else if(c.x > c.y)" branch: p2=p3=p4
  expect(b.positionsX[2]).toBeCloseTo(b.positionsX[4], 10);
  expect(b.positionsX[3]).toBeCloseTo(b.positionsX[4], 10);
  expect(b.positionsX[4]).toBeCloseTo(0.9, 10);
});

test('Fix collapses crossed pairs to their midpoint', () => {
  // huge margins so p1 > p2: left=60 of 100 → p1=0.6, center p2=0.5+c
  const b = computeBands([60, 0, 60, 0], [-10, 1, 10, -1], [100, 100]);
  // x: p1=0.6, p2=0.5-0.1=0.4 → crossed → both 0.5; p3=0.6, p4=0.4 → both 0.5
  expect(b.positionsX[1]).toBeCloseTo(0.5, 10);
  expect(b.positionsX[2]).toBeCloseTo(0.5, 10);
  expect(b.positionsX[3]).toBeCloseTo(0.5, 10);
  expect(b.positionsX[4]).toBeCloseTo(0.5, 10);
});

test('overlapping margins degenerate to the average', () => {
  // left=80, right=80 of 100 → p1=0.8 > p4=0.2 → all four = sum/4
  const b = computeBands([80, 0, 80, 0], [1, 1, -1, -1], [100, 100]);
  const avg = (0.8 + (0.5 + 0.01) + (0.5 - 0.01) + 0.2) / 4;
  expect(b.positionsX[1]).toBeCloseTo(avg, 10);
  expect(b.positionsX[4]).toBeCloseTo(avg, 10);
});

test('adjustment factors expose the post-Fix shrink ratio', () => {
  const b = computeBands([80, 0, 80, 0], [1, 1, -1, -1], [100, 100]);
  const avg = (0.8 + 0.51 + 0.49 + 0.2) / 4;
  expect(b.adjustment[0]).toBeCloseTo(avg / 0.8, 6);
  expect(b.adjustment[2]).toBeCloseTo((1 - avg) / 0.8, 6);
});
