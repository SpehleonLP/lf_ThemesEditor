import { describe, it, expect, vi } from 'vitest';
import { buildSourceLayers } from '../src/ui/main';
import { editorSourceCells } from '../src/editorReadback';
import { applyPackResult } from '../src/document';
import { ninePatchGrid } from '../src/cells';
import type { Rgba } from '../src/types';

// A fake Rgba whose dims encode the path, so tests can assert which image landed on which layer.
const fakeImage = (w: number, h: number): Rgba => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });

// Build an entry with valid Editor metadata via applyPackResult (the real writer), then read it
// back into an EditorSource — mirrors the source→pack→re-edit loop the feature closes.
function entryWithEditor(opts: { mask?: string; linked?: boolean } = {}) {
  const grid = ninePatchGrid([10, 20], [10, 20], [40, 40]);
  const entry: any = {};
  applyPackResult(entry, {
    overlayImage: 'Images/packed/b_overlay.png',
    maskImage: opts.mask ? 'Images/packed/b_mask.png' : null,
    overlayCells: grid,
    maskCells: opts.mask ? grid : null,
    linked: !!opts.linked,
    source: { overlay: 'SourceArt/o.psd', mask: opts.mask, linked: !!opts.linked },
    sourceCells: grid,
    pack: { gutter: 8, align: 4 },
  });
  return { entry, grid };
}

describe('buildSourceLayers', () => {
  it('builds overlay+mask from sourceCells with images from the loader (separate mask source)', async () => {
    const { entry, grid } = entryWithEditor({ mask: 'SourceArt/m.psd', linked: false });
    const es = editorSourceCells(entry)!;
    expect(es).not.toBeNull();

    const load = vi.fn(async (path: string) =>
      path === 'SourceArt/o.psd' ? fakeImage(64, 32) : fakeImage(48, 24));

    const built = await buildSourceLayers(entry, es, load);
    expect(built).not.toBeNull();

    // overlay: cells are the source grid, image is the overlay source.
    expect(built!.overlay.imagePath).toBe('SourceArt/o.psd');
    expect(built!.overlay.image).toEqual(fakeImage(64, 32));
    expect(built!.overlay.cells).toBe(es.sourceCells);
    expect(built!.overlay.cells![1][1].rect).toEqual(grid[1][1].rect);

    // mask: distinct source, distinct image; cells are an INDEPENDENT clone (never aliased), so
    // in-place edits on one layer can't corrupt the other in non-linked Free mode.
    expect(built!.mask.imagePath).toBe('SourceArt/m.psd');
    expect(built!.mask.image).toEqual(fakeImage(48, 24));
    expect(built!.mask.cells).not.toBe(es.sourceCells);          // cloned, not aliased
    expect(built!.mask.cells![1][1].rect).toEqual(grid[1][1].rect); // equal value
    // Mutating an overlay cell must NOT bleed into the mask (no shared EditorCell objects).
    const maskBefore = built!.mask.cells![1][1].rect[0];
    built!.overlay.cells![1][1].rect[0] += 999;
    expect(built!.mask.cells![1][1].rect[0]).toBe(maskBefore);
    expect(built!.mask.cells![1][1].rect[0]).not.toBe(built!.overlay.cells![1][1].rect[0]);
    expect(load).toHaveBeenCalledWith('SourceArt/o.psd');
    expect(load).toHaveBeenCalledWith('SourceArt/m.psd');
  });

  it('linked mask gets a CLONED (not aliased) copy of sourceCells', async () => {
    const { entry } = entryWithEditor({ mask: 'SourceArt/m.psd', linked: true });
    const es = editorSourceCells(entry)!;
    const load = vi.fn(async () => fakeImage(16, 16));

    const built = await buildSourceLayers(entry, es, load);
    expect(built).not.toBeNull();
    expect(built!.mask.cells).not.toBe(es.sourceCells);          // cloned
    expect(built!.mask.cells![2][2].rect).toEqual(es.sourceCells[2][2].rect); // equal value
  });

  it('no mask source → mask mirrors overlay (#COPY): same image, cloned cells', async () => {
    const { entry } = entryWithEditor({ linked: false }); // no mask
    const es = editorSourceCells(entry)!;
    const overlayImg = fakeImage(64, 32);
    const load = vi.fn(async () => overlayImg);

    const built = await buildSourceLayers(entry, es, load);
    expect(built).not.toBeNull();
    expect(built!.mask.imagePath).toBe('SourceArt/o.psd');
    expect(built!.mask.image).toBe(built!.overlay.image);        // shares overlay image
    expect(built!.mask.cells).not.toBe(es.sourceCells);          // cloned, not aliased
    // Mutating an overlay cell must NOT bleed into the mirrored mask (no shared EditorCell objects).
    const maskBefore = built!.mask.cells![1][1].rect[0];
    built!.overlay.cells![1][1].rect[0] += 999;
    expect(built!.mask.cells![1][1].rect[0]).toBe(maskBefore);
    expect(built!.mask.cells![1][1].rect[0]).not.toBe(built!.overlay.cells![1][1].rect[0]);
    expect(load).toHaveBeenCalledTimes(1);                       // only the overlay loaded
  });

  it('returns null when a required source image fails to load (caller falls back to packed)', async () => {
    const { entry } = entryWithEditor({ mask: 'SourceArt/m.psd' });
    const es = editorSourceCells(entry)!;
    const load = vi.fn(async () => { throw new Error('ENOENT'); });

    const built = await buildSourceLayers(entry, es, load);
    expect(built).toBeNull();
  });
});
