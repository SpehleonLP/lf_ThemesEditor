// src/rc/state.ts
export type RcTab = 'curves' | 'events' | 'splines1d' | 'splines2d' | 'gradients' | 'sounds';
export type TriggerKind = 'event' | 'spline1d' | 'spline2d' | 'gradient';
export interface Trigger { kind: TriggerKind; name: string; }

export interface RcState {
  tab: RcTab;
  selected: Record<RcTab, string | null>;
  // preview transport — NEVER dirties the document
  playing: boolean;
  scrubSeconds: number;
  loop: boolean;
  trigger: Trigger | null;
  structuralNonce: number;
  rev: number; // bump to force plot/preview redraw without a re-mount
}

export const rcState: RcState = {
  tab: 'curves',
  selected: { curves: null, events: null, splines1d: null, splines2d: null, gradients: null, sounds: null },
  playing: false, scrubSeconds: 0, loop: true, trigger: null, structuralNonce: 0, rev: 0,
};

type Listener = () => void;
const listeners: Listener[] = [];
export function rcSubscribe(fn: Listener): void { listeners.push(fn); }

// Re-entrancy guard (slice-4 fix): a notify raised during notification is coalesced into one more pass.
let notifying = false, pending = false;
export function rcNotify(): void {
  if (notifying) { pending = true; return; }
  notifying = true;
  try { do { pending = false; for (const fn of listeners) fn(); } while (pending); }
  finally { notifying = false; }
}

export function rcStructuralKey(): string {
  return [rcState.tab, rcState.selected[rcState.tab] ?? '', String(rcState.structuralNonce)].join('|');
}
export function bumpRcStructural(): void { rcState.structuralNonce++; }
export function bumpRcRev(): void { rcState.rev++; rcNotify(); }

export function selectRcTab(tab: RcTab): void { if (rcState.tab === tab) return; rcState.tab = tab; rcNotify(); }
export function selectRcEntry(tab: RcTab, name: string | null): void {
  if (rcState.selected[tab] === name) return;
  rcState.selected[tab] = name; rcNotify();
}

export function setTrigger(t: Trigger | null): void {
  const cur = rcState.trigger;
  if (cur === t || (cur && t && cur.kind === t.kind && cur.name === t.name) || (!cur && !t)) return;
  rcState.trigger = t; rcNotify();
}

export function setTransport(p: Partial<Pick<RcState, 'playing' | 'scrubSeconds' | 'loop'>>): void {
  let changed = false;
  if (p.playing !== undefined && p.playing !== rcState.playing) { rcState.playing = p.playing; changed = true; }
  if (p.scrubSeconds !== undefined && p.scrubSeconds !== rcState.scrubSeconds) { rcState.scrubSeconds = p.scrubSeconds; changed = true; }
  if (p.loop !== undefined && p.loop !== rcState.loop) { rcState.loop = p.loop; changed = true; }
  if (changed) rcNotify();
}
