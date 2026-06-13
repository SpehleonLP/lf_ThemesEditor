import { describe, it, expect } from 'vitest';
import { bordersLayerImageValidator } from '../src/package/validate';

const pkgWith = (borders: any) => ({
  files: {
    borders: { path: 'borders.json', root: borders, dirty: false, indent: '\t' },
    backgrounds: { path: 'backgrounds.json', root: {}, dirty: false, indent: '\t' },
    responseCurves: { path: 'response curves.json', root: {}, dirty: false, indent: '\t' },
    codingThemes: { path: 'coding themes.json', root: {}, dirty: false, indent: '\t' },
  },
}) as any;

describe('bordersLayerImageValidator', () => {
  it('warns on object Overlay without Image', () => {
    const issues = bordersLayerImageValidator(pkgWith({ Header_0: { Overlay: { Tessellate: 'Stretch' } } }), null as any, null as any, null as any);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].category).toBe('borders-overlay-image');
  });

  // The false-positive guard: an imageless #COPY Mask reuses the Overlay image and is legitimate.
  it('is SILENT for an object Mask { Cells: "#COPY" } without Image', () => {
    const issues = bordersLayerImageValidator(pkgWith({ Header_0: { Mask: { Cells: '#COPY' } } }), null as any, null as any, null as any);
    expect(issues).toHaveLength(0);
  });

  it('is silent for string Mask and image-bearing layers', () => {
    const issues = bordersLayerImageValidator(pkgWith({
      A: { Mask: '#OVERLAY' },
      B: { Overlay: { Image: 'Images/x.png' } },
      C: { Mask: { Image: 'Images/m.png' }, Overlay: { Image: 'Images/o.png' } },
    }), null as any, null as any, null as any);
    expect(issues).toHaveLength(0);
  });
});
