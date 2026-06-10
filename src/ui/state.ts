import type { BordersDoc } from '../document';
import type { CellGrid, Rgba } from '../types';

export type LayerName = 'mask' | 'overlay';

export interface LayerState {
  imagePath: string | null;   // as written in JSON (relative to Gui root)
  image: Rgba | null;
  cells: CellGrid | null;     // null = #COPY of the other layer
  edgeFill: [string, string];
  centerFill: [string, string];
}

export interface AppState {
  doc: BordersDoc | null;
  selected: string | null;            // border name
  layers: Record<LayerName, LayerState> | null;
  activeLayer: LayerName;
  linked: boolean;                    // edit both layers at once
  selectedCell: [number, number] | null; // [y][x]
  dirty: boolean;
}

type Listener = () => void;
const listeners: Listener[] = [];

export const state: AppState = {
  doc: null, selected: null, layers: null,
  activeLayer: 'overlay', linked: false, selectedCell: null, dirty: false,
};

export function subscribe(fn: Listener): void { listeners.push(fn); }
export function notify(): void { for (const fn of listeners) fn(); }
