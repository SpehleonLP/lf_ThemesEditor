// tests/bg/previewInput.test.ts
import { describe, it, expect } from 'vitest';
import { buildBgPreviewInput, CORNERS, type BgScene } from '../../src/bg/previewInput';

const scene: BgScene = {
  panelSize: [100, 50],
  now: 0,
  texcoords: { tc: {} }, // identity
  layers: [
    { enabled: true, image: 'a.png', imageSize: [100, 50], texCoord: 'tc', wrapX: 'REPEAT', wrapY: 'REPEAT', light: null },
    { enabled: false },
  ],
  glass: null,
};

describe('buildBgPreviewInput', () => {
  it('emits 4 corners with detail0 UVs for the enabled layer', () => {
    const input = buildBgPreviewInput(scene);
    expect(input.corners).toHaveLength(4);
    // identity texcoord, image == panel size → point UV == quad-fraction (0..1 across corners)
    const topLeft = input.corners[CORNERS.TL];
    expect(topLeft.detail0).toEqual([0, 0]);
    const botRight = input.corners[CORNERS.BR];
    expect(botRight.detail0![0]).toBeCloseTo(1, 6);
    expect(botRight.detail0![1]).toBeCloseTo(1, 6);
  });

  it('disabled layer 0 yields null detail0', () => {
    const s2 = { ...scene, layers: [{ enabled: false }, { enabled: false }] as any };
    expect(buildBgPreviewInput(s2).corners[CORNERS.TL].detail0).toBeNull();
  });

  it('glass corners zoom around center by 1/zoom', () => {
    const s2: BgScene = { ...scene, glass: { blur: 0, zoom: 2, opacity: 0 } };
    const out = buildBgPreviewInput(s2);
    // center quadPos is (0,0); corner (-1,-1) zoomed by 1/2 → (-0.5,-0.5) → uv (0.25,0.25)
    expect(out.corners[CORNERS.TL].glassUV![0]).toBeCloseTo(0.25, 6);
  });
});
