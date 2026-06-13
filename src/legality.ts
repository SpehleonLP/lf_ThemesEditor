import { packRects, type Piece, type Placed } from './maxrects';

// Faithful port of Gui::MegatextureFactory::Prepare()
// (Engine/src/Gui/Themes/gui_makemegatextures.cpp:113-149). The engine applies
// per-side rules INDEPENDENTLY, and only requires a square when BOTH sides are <256:
//   - every side must be a multiple of 4 and >= 4
//   - a side < 256 must be a power of two (→ 4,8,16,32,64,128)
//   - a side >= 256 must be a multiple of 128
//   - if BOTH sides are < 256 they must be equal (square)
// So a small pow-2 side may legally pair with a large %128 side (e.g. 128×256).
const sideOk = (s: number) =>
  s % 4 === 0 && s >= 4 && (s < 256 ? (s & (s - 1)) === 0 : s % 128 === 0);

export function isLegalSheet(w: number, h: number): boolean {
  return sideOk(w) && sideOk(h) && !(w < 256 && h < 256 && w !== h);
}

let _candidateCache: Map<number, [number, number][]> | null = null;

export function candidateSheets(maxDim = 4096): [number, number][] {
  const cached = _candidateCache?.get(maxDim);
  if (cached) return cached;
  // Legal sides: pow-2 squares 4..128, plus 256..maxDim in steps of 128.
  const smalls: number[] = [];
  for (let s = 4; s <= 128; s *= 2) smalls.push(s);
  const bigs: number[] = [];
  for (let b = 256; b <= maxDim; b += 128) bigs.push(b);

  const out: [number, number][] = [];
  for (const s of smalls) out.push([s, s]);          // pow-2 squares (both sides <256 ⇒ must be square)
  for (const s of smalls)                            // small pow-2 × large %128 (both orders)
    for (const b of bigs) { out.push([s, b]); out.push([b, s]); }
  for (const w of bigs) for (const h of bigs) out.push([w, h]); // large × large grid

  const pref256 = ([w, h]: [number, number]) => (w % 256 === 0 && h % 256 === 0 ? 0 : 1);
  const aspect = ([w, h]: [number, number]) => Math.abs(Math.log(w / h));
  out.sort((a, b) =>
    a[0] * a[1] - b[0] * b[1] || pref256(a) - pref256(b) || aspect(a) - aspect(b));
  (_candidateCache ??= new Map()).set(maxDim, out);
  return out;
}

export function findCanvas(
  pieces: Piece[],
  opts: { gutter: number; align: number },
  maxDim = 4096,
): { w: number; h: number; placed: Placed[] } | null {
  const minArea = pieces.reduce((s, p) => s + (p.w + opts.gutter) * (p.h + opts.gutter), 0);
  const minSide = Math.max(...pieces.map((p) => Math.max(p.w, p.h)), 1);
  for (const [w, h] of candidateSheets(maxDim)) {
    // Pack into the canvas minus one trailing gutter: the packer (packRects) pads
    // only TRAILING edges between sprites, so without this the right/bottom-edge
    // sprites have no outer margin and bleed under bilinear/mip sampling after the
    // engine repacks sheets into megatextures. We still report the FULL {w, h};
    // placements stay absolute and < w-gutter < w, so the blit/rewrite is unaffected.
    const pw = w - opts.gutter, ph = h - opts.gutter;
    if (pw <= 0 || ph <= 0 || w * h < minArea || (pw < minSide && ph < minSide)) continue;
    const placed = packRects(pieces, pw, ph, opts);
    if (placed) return { w, h, placed };
  }
  return null;
}
