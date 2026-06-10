declare module 'upng-js' {
  // Opaque decoded-image handle. UPNG's decoded object carries width/height plus
  // internal fields (tabs/frames/data/depth/ctype) that toRGBA8 consumes; we model it
  // as an opaque type so callers can only pass a real decode() result to toRGBA8.
  export interface UpngImage { width: number; height: number; }
  export function decode(buf: ArrayBuffer | Uint8Array): UpngImage;
  export function toRGBA8(img: UpngImage): ArrayBuffer[];
  export function encode(frames: ArrayBuffer[], w: number, h: number, cnum?: number): ArrayBuffer;
}
