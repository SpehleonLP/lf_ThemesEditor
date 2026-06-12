// src/ui/rc/eventForm.ts
import { rcState, setTrigger } from '../../rc/state';
import { CHANNELS, CHANNEL_KEYS } from '../../rc/channels';
import { fillOptions } from '../options';
import type { RcFormDeps } from './types';

let host: HTMLElement | null = null, deps: RcFormDeps | null = null;
const eventOf = (): any => { const n = rcState.selected.events; return n ? deps!.file.root['Events']?.[n] : null; };

export function mountEventForm(h: HTMLElement, d: RcFormDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-form';
  const head = document.createElement('div'); head.className = 'rc-form-head';
  const play = document.createElement('button'); play.className = 'rc-play'; play.textContent = '▶ Preview event';
  play.addEventListener('click', () => { const n = rcState.selected.events; if (n) setTrigger({ kind: 'event', name: n }); });
  head.appendChild(play); h.appendChild(head);

  const fs = document.createElement('fieldset'); fs.className = 'pf-zone';
  const lg = document.createElement('legend'); lg.textContent = 'Channels'; fs.appendChild(lg);
  for (const key of CHANNEL_KEYS) {
    const row = document.createElement('label'); row.className = 'rc-slot';
    const name = document.createElement('span'); name.className = 'rc-slot-name'; name.textContent = `${key} (${CHANNELS[key].table})`;
    const sel = document.createElement('select'); sel.dataset.ch = key;
    sel.addEventListener('change', () => { const ev = eventOf(); if (!ev) return; if (sel.value) ev[key] = sel.value; else delete ev[key]; deps!.markDirty(); });
    row.append(name, sel); fs.appendChild(row);
  }
  h.appendChild(fs);

  const cf = document.createElement('label'); cf.className = 'rc-comment'; cf.textContent = 'Comment ';
  const ci = document.createElement('input'); ci.type = 'text'; ci.dataset.k = 'Comment';
  ci.addEventListener('change', () => { const ev = eventOf(); if (!ev) return; if (ci.value) ev.Comment = ci.value; else delete ev.Comment; deps!.markDirty(); });
  cf.appendChild(ci); h.appendChild(cf);
  updateEventForm();
}

export function updateEventForm(): void {
  if (!host || !deps) return;
  const ev = eventOf(); host.style.display = ev ? '' : 'none'; if (!ev) return;
  const active = document.activeElement;
  host.querySelectorAll<HTMLSelectElement>('select[data-ch]').forEach((sel) => {
    const key = sel.dataset.ch!;
    const names = Object.keys(deps!.file.root[CHANNELS[key as keyof typeof CHANNELS].table] ?? {});
    const cur = ev[key] ?? '';
    if (sel !== active) fillOptions(sel, names, cur, '— none —');
  });
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = ev.Comment ?? '';
}
