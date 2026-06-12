import { expect, test } from 'vitest';
import { isLegalSheet, findCanvas, candidateSheets } from '../src/legality';
import { packRects } from '../src/maxrects';

test('legality rules', () => {
  for (const [w, h] of [[64, 64], [128, 128], [256, 256], [256, 384], [384, 512], [256, 128 * 9]])
    expect(isLegalSheet(w, h), `${w}x${h}`).toBe(true);
  for (const [w, h] of [[64, 128], [100, 100], [120, 120], [256, 100], [260, 256], [384, 130], [2, 2]])
    expect(isLegalSheet(w, h), `${w}x${h}`).toBe(false);
});

test('mixed small-pow2 × large %128 sides are legal (engine treats sides independently)', () => {
  // The square rule applies ONLY when BOTH sides are <256; a small pow-2 side may
  // legally pair with a large %128 side. Verified vs MegatextureFactory::Prepare().
  for (const [w, h] of [[128, 256], [256, 64], [4, 512], [512, 128], [256, 128], [128, 512]])
    expect(isLegalSheet(w, h), `${w}x${h}`).toBe(true);
  // ...but a non-pow-2 small side, or both-sides-<256-and-unequal, stays illegal.
  for (const [w, h] of [[96, 256], [256, 96], [64, 128], [4, 192]])
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

test('findCanvas on empty input returns the smallest legal sheet with nothing placed', () => {
  const r = findCanvas([], { gutter: 4, align: 4 });
  expect(r).not.toBeNull();
  expect(isLegalSheet(r!.w, r!.h)).toBe(true);
  expect(r!.placed).toEqual([]);
});

test('findCanvas keeps the trailing canvas edge clear by one gutter', () => {
  // The packer pads only TRAILING edges between sprites, so the canvas's own
  // right/bottom edge needs a reserved gutter or edge sprites bleed under
  // bilinear/mip sampling after the engine repacks sheets into megatextures.
  // A 120x120 piece pads to 128 and (without the reserved gutter) packs flush
  // into a 128x128 sheet — its trailing pad ends exactly at the canvas edge.
  const r = findCanvas([{ id: 0, w: 120, h: 120 }], { gutter: 8, align: 4 })!;
  expect(r).not.toBeNull();
  // Placed (Placed extends Piece, so it carries .w/.h): the sprite's right/bottom
  // edge plus one full gutter must still fit inside the reported canvas.
  for (const p of r.placed) {
    expect(p.x + p.w).toBeLessThanOrEqual(r.w - 8);
    expect(p.y + p.h).toBeLessThanOrEqual(r.h - 8);
  }
});

test('a piece that fills a legal canvas spills to the next size to reserve the gutter', () => {
  // 120x120 fits flush in 128x128 without the gutter; with it, it must grow.
  const r = findCanvas([{ id: 0, w: 120, h: 120 }], { gutter: 8, align: 4 })!;
  expect(r).not.toBeNull();
  expect(r.w * r.h).toBeGreaterThan(128 * 128);
});

test('findCanvas returns null when a piece exceeds maxDim', () => {
  expect(findCanvas([{ id: 0, w: 5000, h: 10 }], { gutter: 0, align: 4 }, 4096)).toBeNull();
});

test('candidateSheets is sorted by non-decreasing area', () => {
  const cs = candidateSheets(1024);
  for (let i = 1; i < cs.length; ++i)
    expect(cs[i][0] * cs[i][1]).toBeGreaterThanOrEqual(cs[i - 1][0] * cs[i - 1][1]);
  // every enumerated candidate is itself legal
  for (const [w, h] of cs) expect(isLegalSheet(w, h), `${w}x${h}`).toBe(true);
});
