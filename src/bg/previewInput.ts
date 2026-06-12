// src/bg/previewInput.ts
import { getTexCoords, type TexCoordEntry } from './texcoord';
import type { WrapMode } from './backdropModel';

export const CORNERS = { TL: 0, TR: 1, BR: 2, BL: 3 } as const;
// Quad-space corner positions (engine quad coords, -1..1) and their 0..1 point fractions.
const QUAD: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const FRAC: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

export interface SceneLayer {
  enabled: boolean;
  image?: string;
  imageSize?: [number, number];
  texCoord?: string;
  wrapX?: WrapMode; wrapY?: WrapMode;
  light?: { id: number } | null; // resolved light slot index (0 = white)
}
export interface BgScene {
  panelSize: [number, number];
  now: number;                          // seconds (already (timestamp&0x7FFFFF)·1e-3)
  texcoords: Record<string, TexCoordEntry>;
  layers: [SceneLayer, SceneLayer];
  glass: { blur: number; zoom: number; opacity: number } | null;
}

export interface CornerUV {
  quad: [number, number];
  detail0: [number, number] | null;
  detail1: [number, number] | null;
  light0: [number, number] | null;
  light1: [number, number] | null;
  glassUV: [number, number] | null;
}
export interface BgPreviewInput { corners: CornerUV[] }

function layerUV(layer: SceneLayer, tcs: Record<string, TexCoordEntry>, panelSize: [number, number], frac: [number, number], quad: [number, number], now: number): [number, number] | null {
  if (!layer.enabled) return null;
  const tc = (layer.texCoord && tcs[layer.texCoord]) || {};
  const size = layer.imageSize ?? [1, 1];
  const pointUV: [number, number] = [(frac[0] * panelSize[0]) / size[0], (frac[1] * panelSize[1]) / size[1]];
  return getTexCoords(pointUV, quad, tc, panelSize, now);
}

export function buildBgPreviewInput(scene: BgScene): BgPreviewInput {
  const [l0, l1] = scene.layers;
  // Glass center = average of the 4 quad corners = (0,0); zoom around it.
  const corners: CornerUV[] = QUAD.map((quad, i) => {
    const frac = FRAC[i];
    const lightTc0 = l0.light ? (scene.texcoords[l0.texCoord ?? ''] ? l0.texCoord : undefined) : undefined;
    const c: CornerUV = {
      quad,
      detail0: layerUV(l0, scene.texcoords, scene.panelSize, frac, quad, scene.now),
      detail1: layerUV(l1, scene.texcoords, scene.panelSize, frac, quad, scene.now),
      // Lights sweep in quad space; light texcoord already resolved upstream into layer.texCoord by the caller.
      light0: l0.light && l0.light.id !== 0 ? layerUV({ ...l0, texCoord: lightTc0 }, scene.texcoords, scene.panelSize, frac, quad, scene.now) : null,
      light1: l1.light && l1.light.id !== 0 ? layerUV(l1, scene.texcoords, scene.panelSize, frac, quad, scene.now) : null,
      glassUV: null,
    };
    if (scene.glass) {
      const z = scene.glass.zoom || 1;
      const zx = quad[0] / z, zy = quad[1] / z; // center is (0,0)
      c.glassUV = [(zx + 1) * 0.5, (zy + 1) * 0.5];
    }
    return c;
  });
  return { corners };
}
