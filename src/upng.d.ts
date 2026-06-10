declare module 'upng-js' {
  export function decode(buf: ArrayBuffer | Uint8Array): { width: number; height: number };
  export function toRGBA8(img: { width: number; height: number }): ArrayBuffer[];
  export function encode(frames: ArrayBuffer[], w: number, h: number, cnum?: number): ArrayBuffer;
}
