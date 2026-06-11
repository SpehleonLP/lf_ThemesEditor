// src/package/assets.ts
import type { RefEdge } from './refIndex';

// Package-eligible formats (NOT src/images.ts SUPPORTED_IMAGE_EXTS, which is source-art loadable).
const IMAGE_ELIGIBLE = new Set(['png', 'jpg', 'jpeg', 'bmp']);
const IMAGE_REJECTED = new Set(['webp']);
const SOUND_ELIGIBLE = new Set(['ogg', 'wav', 'flac']);
const SOUND_REJECTED = new Set(['mp3']);

export interface DiskFile { path: string }                 // path relative to Gui root, e.g. 'Images/a.png'
export type AssetStatus = 'referenced' | 'unreferenced' | 'rejected-format';
export type AssetKind = 'image' | 'sound';

export interface AssetEntry { path: string; ext: string; kind: AssetKind; status: AssetStatus; consumers: number }
export interface MissingRef { name: string; kind: AssetKind }

export interface AssetList {
  images: AssetEntry[];
  sounds: AssetEntry[];
  missing: MissingRef[];        // referenced paths not present on disk
  exists(path: string): boolean;
}

function ext(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(i + 1).toLowerCase();
}

export function classifyAssets(disk: DiskFile[], edges: RefEdge[]): AssetList {
  const present = new Set(disk.map((f) => f.path));
  const consumersOf = (path: string, ns: 'asset:image' | 'asset:sound') =>
    edges.filter((e) => e.to.ns === ns && e.to.name === path).length;

  const images: AssetEntry[] = [];
  const sounds: AssetEntry[] = [];
  for (const f of disk) {
    const e = ext(f.path);
    if (IMAGE_ELIGIBLE.has(e) || IMAGE_REJECTED.has(e)) {
      const c = consumersOf(f.path, 'asset:image');
      const status: AssetStatus = IMAGE_REJECTED.has(e) ? 'rejected-format' : c > 0 ? 'referenced' : 'unreferenced';
      images.push({ path: f.path, ext: e, kind: 'image', status, consumers: c });
    } else if (SOUND_ELIGIBLE.has(e) || SOUND_REJECTED.has(e)) {
      const c = consumersOf(f.path, 'asset:sound');
      const status: AssetStatus = SOUND_REJECTED.has(e) ? 'rejected-format' : c > 0 ? 'referenced' : 'unreferenced';
      sounds.push({ path: f.path, ext: e, kind: 'sound', status, consumers: c });
    }
    // everything else (psd, csv, rar, …) is 'other' — working files, ignored entirely
  }

  const missing: MissingRef[] = [];
  for (const ns of ['asset:image', 'asset:sound'] as const) {
    const kind: AssetKind = ns === 'asset:image' ? 'image' : 'sound';
    for (const name of new Set(edges.filter((e) => e.to.ns === ns).map((e) => e.to.name))) {
      if (!present.has(name)) missing.push({ name, kind });
    }
  }

  return { images, sounds, missing, exists: (path) => present.has(path) };
}

export type ListDir = (dir: string) => Promise<{ name: string; dir: boolean }[]>;

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '.' : path.slice(0, i);
}

export async function fetchAssetList(edges: RefEdge[], listDir: ListDir): Promise<AssetList> {
  const dirs = new Set<string>(['Images', 'Sounds']);
  for (const e of edges) if (e.to.ns === 'asset:image' || e.to.ns === 'asset:sound') dirs.add(dirname(e.to.name));
  const disk: DiskFile[] = [];
  await Promise.all([...dirs].map(async (dir) => {
    try {
      const entries = await listDir(dir);
      for (const ent of entries) if (!ent.dir) disk.push({ path: dir === '.' ? ent.name : `${dir}/${ent.name}` });
    } catch { /* dir may not exist — leave it out */ }
  }));
  return classifyAssets(disk, edges);
}
