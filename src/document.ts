import { serializeCells } from './cells';
import type { CellGrid, EditorCell, Vec4 } from './types';

export interface BordersDoc {
  root: Record<string, any>;
  names: string[];
}

export function wrapBordersRoot(root: Record<string, any>): BordersDoc {
  const bad = numericBorderKeys(root);
  if (bad.length) {
    throw new Error(`numeric border key "${bad[0]}": JS object key-order rules would reorder it; not supported by this editor`);
  }
  return { root, names: Object.keys(root) };
}

// The editor cannot round-trip numeric root keys (JS key-order rules would silently
// reorder them on serialize). Detect at load so the file degrades to read-only.
export function numericBorderKeys(root: Record<string, any>): string[] {
  return Object.keys(root).filter((k) => /^[0-9]+$/.test(k));
}

export function parseDocument(text: string): BordersDoc {
  return wrapBordersRoot(JSON.parse(text) as Record<string, any>);
}

export function serializeDocument(doc: BordersDoc): string {
  return JSON.stringify(doc.root, null, '\t') + '\n';
}

export function getEditorMeta(entry: any): any | undefined {
  return entry?.Editor;
}

export function setEditorMeta(entry: any, meta: any): void {
  entry.Editor = meta;
}

export interface LayerEdit {
  cells: CellGrid | null; // null = leave as #COPY
  edgeFill: [string, string];
  centerFill: [string, string];
}

export function applyLayerToEntry(entry: any, key: 'Mask' | 'Overlay', edit: LayerEdit): void {
  if (entry[key] == null || typeof entry[key] === 'string') return; // absent / Mask:"#OVERLAY" — nothing to write
  if (edit.cells) entry[key].Cells = serializeCells(edit.cells);
  entry[key].EdgeFill = edit.edgeFill;
  entry[key].CenterFill = edit.centerFill;
}

export interface PackApply {
  overlayImage: string | null;
  maskImage: string | null;
  overlayCells: CellGrid | null;
  maskCells: CellGrid | null;
  linked: boolean;
  source: { overlay?: string; mask?: string; linked: boolean };
  sourceCells: CellGrid;
  pack: { gutter: number; align: number };
}

const flat = (g: CellGrid): EditorCell[] => g.flat().map((c) => ({ rect: [...c.rect] as Vec4, mirrorX: c.mirrorX, mirrorY: c.mirrorY }));

// A pack result always rewrites the layer as the object form; the string forms
// ("#OVERLAY", copy refs) can't carry the new Image/Cells.
const objectLayer = (entry: any, key: 'Mask' | 'Overlay'): any => {
  if (typeof entry[key] !== 'object' || entry[key] === null || Array.isArray(entry[key])) entry[key] = {};
  return entry[key];
};

export function applyPackResult(entry: any, r: PackApply): void {
  if (r.overlayImage && r.overlayCells) {
    const overlay = objectLayer(entry, 'Overlay');
    overlay.Image = r.overlayImage;
    overlay.Cells = serializeCells(r.overlayCells);
  }
  if (r.maskImage && r.maskCells) {
    const mask = objectLayer(entry, 'Mask');
    mask.Image = r.maskImage;
    mask.Cells = r.linked ? '#COPY' : serializeCells(r.maskCells);
  }
  setEditorMeta(entry, {
    version: 1,
    source: r.source,
    sourceCells: flat(r.sourceCells),
    pack: r.pack,
  });
}
