// src/ui/sharedSheets.ts
import type { RefIndex } from '../package/refIndex';

/**
 * How many distinct borders reference this Image path.
 * Used to render the ⛓N shared-sheet badge when the count is ≥ 2.
 *
 * Image assets are indexed under namespace 'asset:image'.
 * Border→image edges have e.from.file === 'borders' and the border name at
 * e.from.jsonPath[0] (captured by the '*' wildcard in the rule paths
 * ['*', 'Overlay', 'Image'] and ['*', 'Mask', 'Image']).
 * The image path is stored verbatim (no normalization).
 */
export function countBordersSharingImage(index: RefIndex, imagePath: string): number {
  const consumers = index.consumers('asset:image', imagePath);
  const borders = new Set<string>();
  for (const e of consumers) {
    if (e.from.file !== 'borders') continue;
    const name = e.from.jsonPath?.[0];
    if (typeof name === 'string') borders.add(name);
  }
  return borders.size;
}
