// src/ui/rc/gradientForm.ts
import { rcState, rcNotify } from '../../rc/state';
import type { Mark } from '../../bg/gradients';
import { createGradientBar } from '../bg/gradientBar';
import type { RcFormDeps } from './types';

let bar: { update(): void } | null = null;
let barHost: HTMLElement | null = null;

export function mountRcGradientForm(host: HTMLElement, deps: RcFormDeps): void {
  barHost = host;
  const marksOf = (): Mark[] => {
    const n = rcState.selected.gradients;
    const raw = n ? deps.file.root['Gradients']?.[n] : null;
    return Array.isArray(raw) ? raw : [];
  };
  bar = createGradientBar(host, {
    interp: 'engine-cubic-raw',
    getMarks: marksOf,
    setMarks: (marks, { live }) => {
      const n = rcState.selected.gradients; if (!n) return;
      if (!live) marks.sort((a, b) => a[0] - b[0]);
      deps.file.root['Gradients'][n] = marks;
      if (!live) deps.markDirty();
      rcNotify();
    },
    consumers: () => {
      const n = rcState.selected.gradients; if (!n) return [];
      return deps.ctx().index.consumers('rc:gradients', n).map((c) => ({ label: c.from.label }));
    },
  });
  if (barHost) barHost.style.display = rcState.selected.gradients ? '' : 'none';
}

export function updateRcGradientForm(): void {
  if (!bar) return;
  bar.update();
  // Preserve hide-when-no-gradient-selected behaviour (the bar always shows itself).
  if (barHost) barHost.style.display = rcState.selected.gradients ? '' : 'none';
}
