// src/bg/texcoord.ts
// CPU port of TexCoord_GetMat3 / GetTexCoords (gui_panelbuilder.comp:115/133) with float timeFactor.
export interface TexCoordEntry {
  normalization?: number;
  spinSpeed?: number;
  rotationCenter?: [number, number];
  scrollFactor?: [number, number];
  scaleFactor?: [number, number];
  initialTime?: number;
  timeFactor?: number;
}

export type Mat3 = Float64Array; // column-major, GLSL mat3 constructor order (9 elems)

const num = (v: number | undefined, d: number) => (typeof v === 'number' ? v : d);
const vec = (v: [number, number] | undefined, d: [number, number]): [number, number] =>
  Array.isArray(v) ? [num(v[0], d[0]), num(v[1], d[1])] : d;

export function texCoordMat3(e: TexCoordEntry, nowSeconds: number, ratio: [number, number]): Mat3 {
  const initialTime = num(e.initialTime, 0);
  const timeFactor = num(e.timeFactor, 1);
  const now = initialTime + nowSeconds * timeFactor;
  const spin = num(e.spinSpeed, 0) * (2 * Math.PI * now);
  const [sfx, sfy] = vec(e.scrollFactor, [0, 0]);
  const t: [number, number] = [sfx * now, sfy * now];
  const [scx, scy] = vec(e.scaleFactor, [1, 1]);
  const s: [number, number] = [scx * ratio[0], scy * ratio[1]];
  const r: [number, number] = [Math.cos(spin), Math.sin(spin)];
  const [cx, cy] = vec(e.rotationCenter, [0, 0]);

  const c2x = ((r[0] * -cx) + (-r[1] * -cy) + (cx + t[0] * r[0]) + (cy + t[1] * -r[1])) * s[0];
  const c2y = ((r[1] * -cx) + (r[0] * -cy) + (cx + t[0] * r[1]) + (cy + t[1] * r[0])) * s[1];

  return Float64Array.from([
    r[0] * s[0], r[1] * s[1], 0, // col0
    -r[1] * s[0], r[0] * s[1], 0, // col1
    c2x, c2y, 1,                 // col2
  ]);
}

export function applyMat3(m: Mat3, uv: [number, number]): [number, number] {
  // column-major: x = col0.x*u + col1.x*v + col2.x ; y = col0.y*u + col1.y*v + col2.y
  return [
    m[0] * uv[0] + m[3] * uv[1] + m[6],
    m[1] * uv[0] + m[4] * uv[1] + m[7],
  ];
}

export function getTexCoords(
  pointUV: [number, number],
  quadPos: [number, number],
  e: TexCoordEntry,
  panelSize: [number, number],
  nowSeconds: number,
): [number, number] {
  let norm = num(e.normalization, 0);
  let ratio: [number, number] = [1, 1];
  if (norm < 0) {
    const absNorm = Math.abs(norm);
    const minSide = Math.max(Math.min(panelSize[0], panelSize[1]), 1);
    const aspect: [number, number] = [panelSize[0] / minSide, panelSize[1] / minSide];
    ratio = [1 + (aspect[0] - 1) * absNorm, 1 + (aspect[1] - 1) * absNorm];
  }
  const b = Math.max(0, Math.min(1, norm));
  // Use GLSL mix formula (a*(1-t)+b*t) for exact results at t=0 and t=1
  const uv: [number, number] = [
    pointUV[0] * (1 - b) + quadPos[0] * b,
    pointUV[1] * (1 - b) + quadPos[1] * b,
  ];
  return applyMat3(texCoordMat3(e, nowSeconds, ratio), uv);
}
