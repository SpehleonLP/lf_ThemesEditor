import { expect, test } from 'vitest';
import { writePsd } from 'ag-psd';
import { decodePsdComposite } from '../src/images';

test('PSD composite decodes to raw RGBA without canvas', () => {
  const w = 3, h = 2;
  const data = new Uint8ClampedArray(w * h * 4);
  data.set([200, 37, 11, 0], 0); // zero-alpha RGB must survive
  data.set([9, 8, 7, 255], 4);
  const psd = { width: w, height: h, imageData: { width: w, height: h, data } } as any;
  const bytes = new Uint8Array(writePsd(psd, { generateThumbnail: false }));
  const img = decodePsdComposite(bytes);
  expect(img.width).toBe(w);
  expect([...img.data.slice(0, 8)]).toEqual([200, 37, 11, 0, 9, 8, 7, 255]);
});
