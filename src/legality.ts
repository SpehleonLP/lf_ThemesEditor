import { packRects, type Piece, type Placed } from './maxrects';

export function isLegalSheet(w: number, h: number): boolean {
  if (w % 4 || h % 4 || w < 4 || h < 4) return false;
  if (w < 256 || h < 256) {
    // any side under 256 ⇒ pow-2 square (max 128, since 256 falls to the other branch)
    return w === h && w <= 128 && (w & (w - 1)) === 0;
  }
  return w % 128 === 0 && h % 128 === 0;
}

export function candidateSheets(maxDim = 4096): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 4; s <= 128; s *= 2) out.push([s, s]);
  for (let w = 256; w <= maxDim; w += 128)
    for (let h = 256; h <= maxDim; h += 128)
      out.push([w, h]);
  const pref256 = ([w, h]: [number, number]) => (w % 256 === 0 && h % 256 === 0 ? 0 : 1);
  const aspect = ([w, h]: [number, number]) => Math.abs(Math.log(w / h));
  return out.sort((a, b) =>
    a[0] * a[1] - b[0] * b[1] || pref256(a) - pref256(b) || aspect(a) - aspect(b));
}

export function findCanvas(
  pieces: Piece[],
  opts: { gutter: number; align: number },
  maxDim = 4096,
): { w: number; h: number; placed: Placed[] } | null {
  const minArea = pieces.reduce((s, p) => s + (p.w + opts.gutter) * (p.h + opts.gutter), 0);
  const minSide = Math.max(...pieces.map((p) => Math.max(p.w, p.h)), 1);
  for (const [w, h] of candidateSheets(maxDim)) {
    if (w * h < minArea || (w < minSide && h < minSide)) continue;
    const placed = packRects(pieces, w, h, opts);
    if (placed) return { w, h, placed };
  }
  return null;
}
