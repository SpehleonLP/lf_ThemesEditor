// src/rc/rename.ts
import type { PackageDoc } from '../package/model';
import type { RefIndex, Namespace } from '../package/refIndex';

const NS_TABLE: Partial<Record<Namespace, string>> = {
  'rc:events': 'Events',
  'rc:splines1d': '1D Splines',
  'rc:splines2d': '2D Splines',
  'rc:gradients': 'Gradients',
  'rc:sounds': 'Sound Effects',
};

// Rename a named responseCurves entry and rewrite every consumer ref. Mutates pkg in place.
export function renameRcEntry(pkg: PackageDoc, index: RefIndex, ns: Namespace, oldName: string, newName: string): void {
  const tableKey = NS_TABLE[ns];
  if (!tableKey) throw new Error(`renameRcEntry: unsupported namespace ${ns}`);
  if (newName === oldName) return;
  const root = pkg.files.responseCurves.root;
  const table = root?.[tableKey];
  if (!table || !Object.hasOwn(table, oldName)) throw new Error(`renameRcEntry: "${oldName}" not in ${tableKey}`);
  if (Object.hasOwn(table, newName)) throw new Error(`renameRcEntry: "${newName}" already exists in ${tableKey}`);

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
