// src/ui/rc/curveForm.ts
import { rcState, setTrigger } from '../../rc/state';
import { fillOptions } from '../options';
import type { RcFormDeps } from './types';

export const STATE_SLOTS = ['HoveringState', 'ToggledState', 'SelectedState', 'BaselineLoop'] as const;
export const EVENT_SLOTS = [
  'OnHoverBegin', 'OnHoverEnd', 'OnSelected', 'OnDeselected', 'OnToggled', 'OnUntoggled',
  'OnCameOnScreen', 'OnClick', 'OnDoubleClick', 'OnHotKey', 'OnActivate1', 'OnActivate2',
] as const;
export type CurveSlot = typeof STATE_SLOTS[number] | typeof EVENT_SLOTS[number];

let host: HTMLElement | null = null, deps: RcFormDeps | null = null;

const curveOf = (): any => {
  const n = rcState.selected.curves;
  return n ? deps!.file.root['Response Curves']?.[n] : null;
};

export function mountCurveForm(h: HTMLElement, d: RcFormDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-form';
  const group = (title: string, slots: readonly string[]) => {
    const fs = document.createElement('fieldset'); fs.className = 'pf-zone';
    const lg = document.createElement('legend'); lg.textContent = title; fs.appendChild(lg);
    for (const slot of slots) {
      const row = document.createElement('label'); row.className = 'rc-slot';
      const name = document.createElement('span'); name.className = 'rc-slot-name'; name.textContent = slot;
      const sel = document.createElement('select'); sel.dataset.slot = slot;
      sel.addEventListener('change', () => writeSlot(slot, sel.value));
      const play = document.createElement('button'); play.className = 'rc-play'; play.textContent = '▶'; play.title = 'Preview';
      play.dataset.slot = slot;
      play.addEventListener('click', (e) => { e.preventDefault(); const v = (curveOf()?.[slot] ?? ''); if (v) setTrigger({ kind: 'event', name: v }); });
      row.append(name, sel, play); fs.appendChild(row);
    }
    return fs;
  };
  h.append(group('States (loop)', STATE_SLOTS), group('Events (one-shot)', EVENT_SLOTS));
  const cf = document.createElement('label'); cf.className = 'rc-comment';
  cf.textContent = 'Comment '; const ci = document.createElement('input'); ci.type = 'text'; ci.dataset.k = 'Comment';
  ci.addEventListener('change', () => { const c = curveOf(); if (!c) return; if (ci.value) c.Comment = ci.value; else delete c.Comment; deps!.markDirty(); });
  cf.appendChild(ci); h.appendChild(cf);
  updateCurveForm();
}

function writeSlot(slot: string, value: string): void {
  const c = curveOf(); if (!c) return;
  if (value) c[slot] = value; else delete c[slot];
  deps!.markDirty();
}

export function updateCurveForm(): void {
  if (!host || !deps) return;
  const c = curveOf();
  host.style.display = c ? '' : 'none'; if (!c) return;
  const events = Object.keys(deps.file.root['Events'] ?? {});
  const active = document.activeElement;
  host.querySelectorAll<HTMLSelectElement>('select[data-slot]').forEach((sel) => {
    const slot = sel.dataset.slot!;
    const cur = c[slot] ?? '';
    if (sel !== active) fillOptions(sel, events, cur, '— none —');
  });
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = c.Comment ?? '';
}
