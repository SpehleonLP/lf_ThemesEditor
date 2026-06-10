import { readFileBytes } from './api';
import { decodePng } from './png';
import type { Rgba } from './types';

import { initializeCanvas, readPsd } from 'ag-psd';

// ag-psd's useImageData path still allocates ImageData objects through its `createImageData`
// hook, whose default needs a real <canvas>. Supply a pure factory that returns a plain
// {data,width,height} — NO canvas, NO premultiply round-trip — so this works in node tests
// and the browser alike. createCanvas stays a guard: with useImageData it's never reached.
let canvasInitialized = false;
function ensureCanvasFactory(): void {
  if (canvasInitialized) return;
  initializeCanvas(
    () => {
      throw new Error('ag-psd requested a canvas — composite read must use useImageData');
    },
    (width, height) =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData,
  );
  canvasInitialized = true;
}

// ag-psd with useImageData gives raw ImageData — NO canvas round-trip (premultiply hazard).
export function decodePsdComposite(bytes: Uint8Array): Rgba {
  ensureCanvasFactory();
  const psd = readPsd(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    { useImageData: true, skipLayerImageData: true, skipThumbnail: true },
  );
  const id = psd.imageData;
  if (!id) throw new Error('PSD has no composite image data (re-save with Maximize Compatibility)');
  return {
    width: psd.width,
    height: psd.height,
    data: new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.byteLength),
  };
}

// Browser-only: webp/jpg via WebCodecs ImageDecoder, premultiplyAlpha disabled.
async function decodeViaImageDecoder(bytes: Uint8Array, mime: string): Promise<Rgba> {
  if (typeof (globalThis as any).ImageDecoder === 'undefined')
    throw new Error('ImageDecoder unavailable — use a Chromium-based browser for webp/jpg sources');
  const dec = new (globalThis as any).ImageDecoder({ data: bytes, type: mime, premultiplyAlpha: 'none' });
  const { image } = await dec.decode();
  const w = image.codedWidth, h = image.codedHeight;
  const data = new Uint8Array(w * h * 4);
  await image.copyTo(data, { format: 'RGBA' });
  image.close(); dec.close();
  return { width: w, height: h, data };
}

export async function loadImage(path: string): Promise<Rgba> {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const bytes = await readFileBytes(path);
  switch (ext) {
    case 'png': return decodePng(bytes);
    case 'psd': return decodePsdComposite(bytes);
    case 'webp': return decodeViaImageDecoder(bytes, 'image/webp');
    case 'jpg': case 'jpeg': return decodeViaImageDecoder(bytes, 'image/jpeg');
    default: throw new Error(`unsupported image format .${ext}`);
  }
}
