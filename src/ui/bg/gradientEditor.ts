// src/ui/bg/gradientEditor.ts
import { bgState, bgNotify } from '../../bg/state';
import type { Mark } from '../../bg/gradients';
import type { BgFormDeps } from './types';
import { createGradientBar } from './gradientBar';

let bar: { update(): void } | null = null;
let barHost: HTMLElement | null = null;

export function mountGradientEditor(host: HTMLElement, deps: BgFormDeps): void {
  barHost = host;
  const marksOf = (): Mark[] => {
    const n = bgState.selected.gradients;
    const raw = n ? deps.file.root.Gradients?.[n] : null;
    return Array.isArray(raw) ? raw : [];
  };
  bar = createGradientBar(host, {
    interp: 'linear-srgb',
    getMarks: marksOf,
    setMarks: (marks, { live }) => {
      const n = bgState.selected.gradients; if (!n) return;
      if (!live) marks.sort((a, b) => a[0] - b[0]);
      deps.file.root.Gradients[n] = marks;
      bgState.gradientRev++;
      if (!live) deps.markDirty();
      bgNotify();
    },
    consumers: () => {
      const n = bgState.selected.gradients; if (!n) return [];
      return deps.ctx().index.consumers('bg:gradients', n).map((c) => ({ label: c.from.label }));
    },
  });
  if (barHost) barHost.style.display = bgState.selected.gradients ? '' : 'none';
}

export function updateGradientEditor(): void {
  if (!bar) return;
  bar.update();
  // Preserve the original hide-when-no-gradient-selected behaviour (the bar always shows itself).
  if (barHost) barHost.style.display = bgState.selected.gradients ? '' : 'none';
}
