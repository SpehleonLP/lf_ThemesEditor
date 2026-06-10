import { expect, test } from 'vitest';
import { packRects } from '../src/maxrects';

const overlap = (a: any, b: any) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('packs non-overlapping, in-bounds, aligned, gutter respected', () => {
  const pieces = Array.from({ length: 12 }, (_, i) => ({ id: i, w: 30 + (i * 7) % 50, h: 20 + (i * 13) % 40 }));
  const placed = packRects(pieces, 256, 256, { gutter: 8, align: 4 });
  expect(placed).not.toBeNull();
  expect(placed!).toHaveLength(12);
  for (const p of placed!) {
    expect(p.x % 4).toBe(0);
    expect(p.y % 4).toBe(0);
    expect(p.x + p.w).toBeLessThanOrEqual(256);
    expect(p.y + p.h).toBeLessThanOrEqual(256);
  }
  for (let i = 0; i < placed!.length; ++i)
    for (let j = i + 1; j < placed!.length; ++j) {
      // gutter: inflate one piece by the gutter and require no overlap
      const a = { ...placed![i], w: placed![i].w + 8, h: placed![i].h + 8 };
      expect(overlap(a, placed![j]), `${i} vs ${j}`).toBe(false);
    }
});

test('returns null when pieces cannot fit', () => {
  expect(packRects([{ id: 0, w: 300, h: 10 }], 256, 256, { gutter: 0, align: 4 })).toBeNull();
  expect(packRects(Array.from({ length: 100 }, (_, i) => ({ id: i, w: 64, h: 64 })), 256, 256, { gutter: 0, align: 4 })).toBeNull();
});

test('keeps piece ids and exact sizes', () => {
  const placed = packRects([{ id: 7, w: 33, h: 21 }], 128, 128, { gutter: 8, align: 4 });
  expect(placed![0]).toMatchObject({ id: 7, w: 33, h: 21 });
});
