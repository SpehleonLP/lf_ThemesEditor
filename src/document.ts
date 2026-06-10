import { serializeCells } from './cells';
import type { CellGrid } from './types';

export interface BordersDoc {
  root: Record<string, any>;
  names: string[];
}

export function parseDocument(text: string): BordersDoc {
  const root = JSON.parse(text) as Record<string, any>;
  for (const k of Object.keys(root)) {
    if (/^[0-9]+$/.test(k)) {
      throw new Error(`numeric border key "${k}": JS object key-order rules would reorder it; not supported by this editor`);
    }
  }
  return { root, names: Object.keys(root) };
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
