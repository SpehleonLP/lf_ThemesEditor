import * as UPNG from 'upng-js';
import type { Rgba } from './types';

export function decodePng(bytes: Uint8Array): Rgba {
  const img = UPNG.decode(bytes);
  const rgba = UPNG.toRGBA8(img)[0];
  return { width: img.width, height: img.height, data: new Uint8Array(rgba) };
}

export function encodePng(img: Rgba): Uint8Array {
  // cnum=0 → lossless RGBA
  const slice = img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength) as ArrayBuffer;
  const buf = UPNG.encode([slice], img.width, img.height, 0);
  return new Uint8Array(buf);
}
