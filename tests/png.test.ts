import { expect, test } from 'vitest';
import { decodePng, encodePng } from '../src/png';

test('PNG round-trip preserves RGB of zero-alpha pixels', () => {
  const w = 4, h = 2;
  const data = new Uint8Array(w * h * 4);
  // pixel 0: R=200 G=37 B=11 A=0 — canvas2d would zero the RGB; we must not.
  data.set([200, 37, 11, 0], 0);
  data.set([1, 2, 3, 255], 4);
  const png = encodePng({ width: w, height: h, data });
  const back = decodePng(png);
  expect(back.width).toBe(w);
  expect(back.height).toBe(h);
  expect([...back.data.slice(0, 8)]).toEqual([200, 37, 11, 0, 1, 2, 3, 255]);
});
