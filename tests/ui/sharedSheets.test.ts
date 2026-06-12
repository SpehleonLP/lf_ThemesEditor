// tests/ui/sharedSheets.test.ts
import { describe, it, expect } from 'vitest';
import { countBordersSharingImage } from '../../src/ui/sharedSheets';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc, FileDoc } from '../../src/package/model';

function fd(root: any): FileDoc { return { path: 'x', root, dirty: false, indent: '\t' }; }

function buildIndexFromBorders(bordersRoot: any): ReturnType<typeof buildRefIndex> {
  const pkg: PackageDoc = {
    files: {
      borders: fd(bordersRoot),
      backgrounds: fd({}),
      responseCurves: fd({}),
      codingThemes: fd({}),
    },
  };
  return buildRefIndex(pkg);
}

describe('countBordersSharingImage', () => {
  it('counts distinct borders that reference the same Image path', () => {
    // Image keys are stored as-is (no normalization); the rule path is
    // ['*', 'Overlay', 'Image'] so jsonPath[0] is the border name.
    const index = buildIndexFromBorders({
      Window_0: { Overlay: { Image: 'Images/shared.png', Cells: '#COPY' } },
      Window_1: { Overlay: { Image: 'Images/shared.png', Cells: '#COPY' } },
      Header_0: { Overlay: { Image: 'Images/solo.png', Cells: '#COPY' } },
    });
    expect(countBordersSharingImage(index, 'Images/shared.png')).toBe(2);
    expect(countBordersSharingImage(index, 'Images/solo.png')).toBe(1);
    expect(countBordersSharingImage(index, 'Images/none.png')).toBe(0);
  });

  it('deduplicates when the same border references the same image via both Overlay and Mask', () => {
    // A single border may have both Overlay.Image and Mask.Image pointing to the same path.
    // It should still count as 1 distinct border.
    const index = buildIndexFromBorders({
      Window_0: {
        Overlay: { Image: 'Images/shared.png', Cells: '#COPY' },
        Mask:    { Image: 'Images/shared.png', Cells: '#COPY' },
      },
      Window_1: { Overlay: { Image: 'Images/shared.png', Cells: '#COPY' } },
    });
    expect(countBordersSharingImage(index, 'Images/shared.png')).toBe(2);
  });
});
