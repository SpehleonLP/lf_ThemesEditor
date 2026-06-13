// src/bg/rename.ts
import type { PackageDoc } from '../package/model';
import type { RefIndex, Namespace } from '../package/refIndex';

const NS_TABLE: Partial<Record<Namespace, 'TexCoords' | 'Gradients'>> = {
  'bg:texcoords': 'TexCoords',
  'bg:gradients': 'Gradients',
};

// Rename a named bg entry and rewrite every consumer ref. Mutates pkg.files.backgrounds.root in place.
export function renameNamedEntry(pkg: PackageDoc, index: RefIndex, ns: Namespace, oldName: string, newName: string): void {
  const tableKey = NS_TABLE[ns];
  if (!tableKey) throw new Error(`renameNamedEntry: unsupported namespace ${ns}`);
  if (newName === oldName) return;
  const root = pkg.files.backgrounds.root;
  const table = root?.[tableKey];
  if (!table || !Object.hasOwn(table, oldName)) throw new Error(`renameNamedEntry: "${oldName}" not in ${tableKey}`);
  if (Object.hasOwn(table, newName)) throw new Error(`renameNamedEntry: "${newName}" already exists in ${tableKey}`);

  // Rewrite consumers first (they live in the same file root).
  for (const edge of index.consumers(ns, oldName)) {
    let node: any = pkg.files[edge.from.file].root;
    const path = edge.from.jsonPath;
    for (let i = 0; i < path.length - 1; ++i) node = node?.[path[i]];
    const leaf = path[path.length - 1];
    if (node && node[leaf] === oldName) node[leaf] = newName;
  }

  // Rewrite the definition key, preserving insertion order.
  const next: Record<string, any> = {};
  for (const k of Object.keys(table)) next[k === oldName ? newName : k] = table[k];
  root[tableKey] = next;
}
