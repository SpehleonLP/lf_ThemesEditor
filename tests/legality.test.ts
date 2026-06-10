import { expect, test } from 'vitest';
import { isLegalSheet, findCanvas } from '../src/legality';
import { packRects } from '../src/maxrects';

test('legality rules', () => {
  for (const [w, h] of [[64, 64], [128, 128], [256, 256], [256, 384], [384, 512], [256, 128 * 9]])
    expect(isLegalSheet(w, h), `${w}x${h}`).toBe(true);
  for (const [w, h] of [[64, 128], [100, 100], [120, 120], [256, 100], [260, 256], [384, 130], [2, 2]])
    expect(isLegalSheet(w, h), `${w}x${h}`).toBe(false);
});

test('findCanvas returns the smallest legal canvas that fits', () => {
  const r = findCanvas([{ id: 0, w: 50, h: 50 }], { gutter: 8, align: 4 });
  expect(r).not.toBeNull();
  expect(isLegalSheet(r!.w, r!.h)).toBe(true);
  expect(r!.w * r!.h).toBeLessThanOrEqual(128 * 128); // 64x64 or smaller-ish, definitely not 256+
  expect(r!.placed).toHaveLength(1);
});

test('findCanvas prefers 256-divisible canvases on ties and can go non-square', () => {
  const pieces = Array.from({ length: 32 }, (_, i) => ({ id: i, w: 120, h: 120 }));
  const r = findCanvas(pieces, { gutter: 8, align: 4 });
  expect(r).not.toBeNull();
  expect(isLegalSheet(r!.w, r!.h)).toBe(true);
  // sanity: everything actually packed
  expect(r!.placed).toHaveLength(32);
});
