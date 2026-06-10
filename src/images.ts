import { readFileBytes } from './api';
import { decodePng } from './png';
import type { Rgba } from './types';

export async function loadImage(path: string): Promise<Rgba> {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const bytes = await readFileBytes(path);
  if (ext === 'png') return decodePng(bytes);
  throw new Error(`unsupported image format .${ext} (png only until slice 5)`);
}
