// src/bg/state.ts
export type BgTab = 'backdrops' | 'lights' | 'texcoords' | 'gradients';

export interface BgState {
  tab: BgTab;
  selected: Record<BgTab, string | null>;
  // preview pairing per backdrop slot name → [light0, light1] light slot names ('' = None/White)
  pairing: Record<string, [string, string]>;
  playing: boolean;
  scrubSeconds: number;     // fixed time when paused/scrubbing
  gradientRev: number;      // bump to force gradient-atlas re-upload
  structuralNonce: number;
}

export const bgState: BgState = {
  tab: 'backdrops',
  selected: { backdrops: null, lights: null, texcoords: null, gradients: null },
  pairing: {}, playing: true, scrubSeconds: 0, gradientRev: 0, structuralNonce: 0,
};

type Listener = () => void;
const listeners: Listener[] = [];
export function bgSubscribe(fn: Listener): void { listeners.push(fn); }
// Re-entrancy guard: a notify raised *during* notification (e.g. an update() that calls
// setPairing) is coalesced into one more pass rather than recursing — prevents stack overflow.
let notifying = false, pending = false;
export function bgNotify(): void {
  if (notifying) { pending = true; return; }
  notifying = true;
  try { do { pending = false; for (const fn of listeners) fn(); } while (pending); }
  finally { notifying = false; }
}

export function bgStructuralKey(): string {
  return [bgState.tab, bgState.selected[bgState.tab] ?? '', String(bgState.structuralNonce)].join('|');
}
export function bumpBgStructural(): void { bgState.structuralNonce++; }

export function selectTab(tab: BgTab): void { bgState.tab = tab; bgNotify(); }
export function selectEntry(tab: BgTab, name: string | null): void { bgState.selected[tab] = name; bgNotify(); }

// localStorage-backed pairing (preview-only; never touches the document).
const PAIR_KEY = 'bg.pairing.v1';
export function loadPairing(): void {
  try { bgState.pairing = JSON.parse(localStorage.getItem(PAIR_KEY) || '{}'); } catch { bgState.pairing = {}; }
}
export function setPairing(slot: string, light0: string, light1: string): void {
  const cur = bgState.pairing[slot];
  if (cur && cur[0] === light0 && cur[1] === light1) return; // unchanged → no write, no notify
  bgState.pairing[slot] = [light0, light1];
  try { localStorage.setItem(PAIR_KEY, JSON.stringify(bgState.pairing)); } catch { /* ignore */ }
  bgNotify();
}
