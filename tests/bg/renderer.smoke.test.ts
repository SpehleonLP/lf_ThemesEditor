// tests/bg/renderer.smoke.test.ts
import { describe, it, expect } from 'vitest';

const hasGL = (() => {
  try {
    const c: any = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    return !!c?.getContext?.('webgl2');
  } catch { return false; }
})();

describe.skipIf(!hasGL)('BgPreviewRenderer', () => {
  it('constructs, links, and renders one frame without throwing', async () => {
    const { BgPreviewRenderer } = await import('../../src/preview/bg/renderer');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const r = new BgPreviewRenderer(canvas);
    r.setGradients([new Float32Array(128 * 4).fill(1)], '1');
    r.render({
      input: { corners: [
        { quad: [-1, -1], detail0: [0, 0], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [1, -1], detail0: [1, 0], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [1, 1], detail0: [1, 1], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [-1, 1], detail0: [0, 1], detail1: null, light0: null, light1: null, glassUV: null },
      ] },
      layer0: null, layer1: null,
      wrap0: [0, 0], wrap1: [0, 0],
      light0: null, light1: null,
      detailOpacity: 1, glass: null,
    });
    expect(() => r.dispose()).not.toThrow();
  });
});
