export interface Piece { id: number; w: number; h: number; }
export interface Placed extends Piece { x: number; y: number; }
interface FreeRect { x: number; y: number; w: number; h: number; }

const roundUp = (v: number, a: number) => Math.ceil(v / a) * a;

export function packRects(
  pieces: Piece[],
  canvasW: number,
  canvasH: number,
  opts: { gutter: number; align: number },
): Placed[] | null {
  // pad: gutter + alignment; canvas itself acts as the outer gutter on two sides,
  // so pad trailing edges only (piece at x..x+w, occupies x..x+padW)
  const padded = pieces.map((p) => ({
    ...p,
    padW: roundUp(p.w + opts.gutter, opts.align),
    padH: roundUp(p.h + opts.gutter, opts.align),
  })).sort((a, b) => Math.max(b.padW, b.padH) - Math.max(a.padW, a.padH));

  let free: FreeRect[] = [{ x: 0, y: 0, w: canvasW, h: canvasH }];
  const placed: Placed[] = [];

  for (const p of padded) {
    let best: { fr: FreeRect; score: number } | null = null;
    for (const fr of free) {
      if (fr.w < p.padW || fr.h < p.padH) continue;
      const score = Math.min(fr.w - p.padW, fr.h - p.padH); // BSSF
      if (!best || score < best.score) best = { fr, score };
    }
    if (!best) return null;
    const node = { x: best.fr.x, y: best.fr.y, w: p.padW, h: p.padH };
    placed.push({ id: p.id, w: p.w, h: p.h, x: node.x, y: node.y });

    // split every free rect the node overlaps (MaxRects split)
    const next: FreeRect[] = [];
    for (const fr of free) {
      if (node.x >= fr.x + fr.w || fr.x >= node.x + node.w || node.y >= fr.y + fr.h || fr.y >= node.y + node.h) {
        next.push(fr);
        continue;
      }
      if (node.x > fr.x) next.push({ x: fr.x, y: fr.y, w: node.x - fr.x, h: fr.h });
      if (node.x + node.w < fr.x + fr.w) next.push({ x: node.x + node.w, y: fr.y, w: fr.x + fr.w - node.x - node.w, h: fr.h });
      if (node.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: node.y - fr.y });
      if (node.y + node.h < fr.y + fr.h) next.push({ x: fr.x, y: node.y + node.h, w: fr.w, h: fr.y + fr.h - node.y - node.h });
    }
    // prune contained rects
    free = next.filter((a, i) => !next.some((b, j) =>
      j !== i && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h
      && (j < i || b.x !== a.x || b.y !== a.y || b.w !== a.w || b.h !== a.h)));
  }
  return placed;
}
