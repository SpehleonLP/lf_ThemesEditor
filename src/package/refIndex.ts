// src/package/refIndex.ts
import type { PackageDoc, FileKey } from './model';

export type Namespace =
  | 'bg:gradients' | 'bg:texcoords'
  | 'rc:events' | 'rc:splines1d' | 'rc:splines2d' | 'rc:gradients' | 'rc:sounds'
  | 'asset:image' | 'asset:sound';

export type PathSeg = string; // literal key, or '*' for any object key / array index
export interface RefRule { file: FileKey; path: PathSeg[]; ns: Namespace }

export interface RefEdge {
  from: { file: FileKey; jsonPath: (string | number)[]; label: string };
  to: { ns: Namespace; name: string };
}

// Names that define each name namespace (file → table). Asset namespaces are defined on disk.
const NS_DEFINITIONS: { ns: Namespace; file: FileKey; table: string }[] = [
  { ns: 'bg:gradients', file: 'backgrounds', table: 'Gradients' },
  { ns: 'bg:texcoords', file: 'backgrounds', table: 'TexCoords' },
  { ns: 'rc:events', file: 'responseCurves', table: 'Events' },
  { ns: 'rc:splines1d', file: 'responseCurves', table: '1D Splines' },
  { ns: 'rc:splines2d', file: 'responseCurves', table: '2D Splines' },
  { ns: 'rc:gradients', file: 'responseCurves', table: 'Gradients' },
  { ns: 'rc:sounds', file: 'responseCurves', table: 'Sound Effects' },
];

const RULES: RefRule[] = [
  { file: 'borders', path: ['*', 'Overlay', 'Image'], ns: 'asset:image' },
  { file: 'borders', path: ['*', 'Mask', 'Image'], ns: 'asset:image' },
  { file: 'backgrounds', path: ['Backgrounds', '*', 'Detail Layers', '*', 'image'], ns: 'asset:image' },
  { file: 'backgrounds', path: ['Backgrounds', '*', 'Detail Layers', '*', 'texCoord'], ns: 'bg:texcoords' },
  { file: 'backgrounds', path: ['Lights', '*', 'gradient'], ns: 'bg:gradients' },
  { file: 'backgrounds', path: ['Lights', '*', 'texCoord'], ns: 'bg:texcoords' },
  { file: 'responseCurves', path: ['Response Curves', '*', '*'], ns: 'rc:events' },
  { file: 'responseCurves', path: ['Events', '*', 'Translation'], ns: 'rc:splines2d' },
  { file: 'responseCurves', path: ['Events', '*', 'Scaling'], ns: 'rc:splines2d' },
  { file: 'responseCurves', path: ['Events', '*', 'Rotation'], ns: 'rc:splines1d' },
  { file: 'responseCurves', path: ['Events', '*', 'Style'], ns: 'rc:splines1d' },
  { file: 'responseCurves', path: ['Events', '*', 'Tint'], ns: 'rc:gradients' },
  { file: 'responseCurves', path: ['Events', '*', 'Font Color'], ns: 'rc:gradients' },
  { file: 'responseCurves', path: ['Events', '*', 'Sound Effect'], ns: 'rc:sounds' },
  { file: 'responseCurves', path: ['Sound Effects', '*', 'file'], ns: 'asset:sound' },
];

// The entry name a consumer edge belongs to, for reveal()-style navigation.
// borders edges are rooted at the entry ([name, 'Overlay', 'Image']); every other
// file roots at the table ([table, name, ...]).
export function edgeEntryName(e: RefEdge): string {
  return String((e.from.file === 'borders' ? e.from.jsonPath[0] : e.from.jsonPath[1]) ?? '');
}

function isRefValue(v: unknown): v is string {
  // empty string = unassigned; '#...' = directive; non-string = wrong type (schema's problem)
  return typeof v === 'string' && v !== '' && !v.startsWith('#');
}

// Walk `node` matching `path` from `path[depth]`, collecting (jsonPath, value) at full matches.
function walk(node: any, path: PathSeg[], depth: number, jsonPath: (string | number)[], out: { jsonPath: (string | number)[]; value: any }[]): void {
  if (depth === path.length) { out.push({ jsonPath: [...jsonPath], value: node }); return; }
  if (node === null || typeof node !== 'object') return;
  const seg = path[depth];
  const keys: (string | number)[] = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
  for (const k of keys) {
    if (k === 'Comment') continue;            // reserved annotation key, never a reference
    if (seg !== '*' && String(k) !== seg) continue;
    walk((node as any)[k], path, depth + 1, [...jsonPath, k], out);
  }
}

function makeLabel(jsonPath: (string | number)[]): string {
  return jsonPath.join(' › ');
}

export interface RefIndex {
  definitions(ns: Namespace): string[];
  consumers(ns: Namespace, name: string): RefEdge[];
  dangling(): RefEdge[];          // name namespaces only; asset dangles are owned by assets.ts
  dead(ns: Namespace): string[];  // defined, zero consumers (name namespaces only)
  edges(): RefEdge[];
}

export function buildRefIndex(pkg: PackageDoc): RefIndex {
  const defs = new Map<Namespace, Set<string>>();
  for (const d of NS_DEFINITIONS) {
    const table = pkg.files[d.file]?.root?.[d.table];
    const names = table && typeof table === 'object' && !Array.isArray(table) ? Object.keys(table) : [];
    defs.set(d.ns, new Set(names));
  }

  const edges: RefEdge[] = [];
  for (const rule of RULES) {
    const matches: { jsonPath: (string | number)[]; value: any }[] = [];
    walk(pkg.files[rule.file]?.root ?? {}, rule.path, 0, [], matches);
    for (const m of matches) {
      if (!isRefValue(m.value)) continue;
      edges.push({ from: { file: rule.file, jsonPath: m.jsonPath, label: makeLabel(m.jsonPath) }, to: { ns: rule.ns, name: m.value } });
    }
  }

  const isNameNs = (ns: Namespace) => !ns.startsWith('asset:');

  return {
    definitions: (ns) => [...(defs.get(ns) ?? [])],
    consumers: (ns, name) => edges.filter((e) => e.to.ns === ns && e.to.name === name),
    edges: () => edges,
    dangling: () =>
      edges.filter((e) => isNameNs(e.to.ns) && !(defs.get(e.to.ns)?.has(e.to.name) ?? false)),
    dead: (ns) =>
      isNameNs(ns)
        ? [...(defs.get(ns) ?? [])].filter((name) => !edges.some((e) => e.to.ns === ns && e.to.name === name))
        : [],
  };
}
