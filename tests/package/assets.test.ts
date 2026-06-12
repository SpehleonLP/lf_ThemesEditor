// tests/package/assets.test.ts
import { expect, test } from 'vitest';
import { classifyAssets, fetchAssetList, type DiskFile } from '../../src/package/assets';
import type { RefEdge } from '../../src/package/refIndex';

const edge = (ns: 'asset:image' | 'asset:sound', name: string): RefEdge =>
  ({ from: { file: 'borders', jsonPath: [], label: '' }, to: { ns, name } });

test('classifies eligible / rejected / other and resolves edges', () => {
  const disk: DiskFile[] = [
    { path: 'Images/a.png' }, { path: 'Images/b.webp' }, { path: 'Images/used.png' },
    { path: 'Images/working.psd' }, { path: 'Sounds/s.ogg' }, { path: 'Sounds/bad.mp3' },
  ];
  const edges = [edge('asset:image', 'Images/used.png'), edge('asset:image', 'Images/gone.png'), edge('asset:sound', 'Sounds/s.ogg')];
  const list = classifyAssets(disk, edges);

  const png = list.images.find((a) => a.path === 'Images/a.png')!;
  expect(png.status).toBe('unreferenced');           // eligible, zero edges → dead notice
  expect(list.images.find((a) => a.path === 'Images/b.webp')!.status).toBe('rejected-format');
  expect(list.images.find((a) => a.path === 'Images/used.png')!.status).toBe('referenced');
  expect(list.images.some((a) => a.path === 'Images/working.psd')).toBe(false); // psd = 'other', ignored
  expect(list.sounds.find((a) => a.path === 'Sounds/bad.mp3')!.status).toBe('rejected-format');
  expect(list.missing.map((m) => m.name)).toEqual(['Images/gone.png']); // referenced, not on disk
  expect(list.exists('Images/used.png')).toBe(true);
  expect(list.exists('Images/gone.png')).toBe(false);
});

test('flags referenced files whose extension the engine cannot load', () => {
  const edges = [edge('asset:image', 'Images/foo.psd')];
  const list = classifyAssets([{ path: 'Images/foo.psd' }], edges);
  expect(list.wrongFormat).toEqual([{ name: 'Images/foo.psd', kind: 'image', ext: 'psd' }]);
});

test('referenced on-disk rejected formats are not double-reported as wrongFormat', () => {
  // .webp has a dedicated rejected-format channel; it must NOT also surface in wrongFormat.
  const list = classifyAssets([{ path: 'Images/foo.webp' }], [edge('asset:image', 'Images/foo.webp')]);
  expect(list.wrongFormat).toEqual([]);
  expect(list.images.find((a) => a.path === 'Images/foo.webp')!.status).toBe('rejected-format');
});

test('eligible referenced files are not flagged as wrong format', () => {
  const list = classifyAssets([{ path: 'Images/foo.png' }], [edge('asset:image', 'Images/foo.png')]);
  expect(list.wrongFormat).toEqual([]);
});

test('fetchAssetList lists Images/Sounds plus every referenced directory', async () => {
  const seen: string[] = [];
  const listDir = async (dir: string) => {
    seen.push(dir);
    if (dir === 'Images') return [{ name: 'a.png', dir: false }];
    if (dir === 'Sounds') return [{ name: 's.ogg', dir: false }];
    if (dir === 'custom') return [{ name: 'c.png', dir: false }];
    return [];
  };
  const edges = [edge('asset:image', 'custom/c.png')];
  const list = await fetchAssetList(edges, listDir);
  expect(seen.sort()).toEqual(['Images', 'Sounds', 'custom']);
  expect(list.exists('custom/c.png')).toBe(true);
});
