import type { BordersDoc } from '../document';
import type { CellGrid, FillMode, Rgba } from '../types';

export type LayerName = 'mask' | 'overlay';

export interface LayerState {
  imagePath: string | null;   // as written in JSON (relative to Gui root)
  image: Rgba | null;
  cells: CellGrid | null;     // null = #COPY of the other layer
  edgeFill: [FillMode, FillMode];
  centerFill: [FillMode, FillMode];
}

export interface AppState {
  doc: BordersDoc | null;
  selected: string | null;            // border name
  layers: Record<LayerName, LayerState> | null;
  activeLayer: LayerName;
  linked: boolean;                    // edit both layers at once
  selectedCell: [number, number] | null; // [y][x]
  dirty: boolean;
  saveStatus: string | null;          // HTML for #save-status, survives re-render
}

type Listener = () => void;
const listeners: Listener[] = [];

export const state: AppState = {
  doc: null, selected: null, layers: null,
  activeLayer: 'overlay', linked: false, selectedCell: null, dirty: false, saveStatus: null,
};

export function subscribe(fn: Listener): void { listeners.push(fn); }
export function notify(): void { for (const fn of listeners) fn(); }

// A self-contained panel: built once into `host` via mount(), then refreshed in place via update().
export interface Panel { host: HTMLElement; mount(host: HTMLElement): void; update(): void }

// Structural identity of the surface: changes exactly when a border switch or a layer
// add/remove happens (or the linked flag toggles), and stays the same for plain value edits.
// `layers` is a fixed Record<'mask'|'overlay', ...> | null, so its structure is captured by
// which layer keys are present (vs the whole object being null).
// A monotonically-increasing nonce that callers bump to force a structural remount even when
// nothing in structuralKey()'s other terms changed. Needed for mask-mode switches: the layers
// Record always has both 'mask','overlay' keys, so layerKeys never moves — but switching mask
// mode changes the mask layer's image/cells/copy semantics and must remount every panel.
let structuralNonce = 0;
export function bumpStructural(): void { structuralNonce++; }

export function structuralKey(): string {
  const layerKeys = state.layers ? Object.keys(state.layers).join(',') : '';
  return [state.selected, state.activeLayer, layerKeys, state.linked, String(structuralNonce)].join('|');
}
