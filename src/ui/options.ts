// src/ui/options.ts
// Fill a <select> with names + an empty option, appending a "(missing)" sentinel when the
// current value isn't defined — so dangling refs are visible and not silently rewritten.
// DOM-built (no innerHTML): names may contain <, ", &.
export function fillOptions(sel: HTMLSelectElement, names: string[], current: string, emptyLabel: string): void {
  sel.replaceChildren();
  for (const n of ['', ...names]) {
    const o = document.createElement('option');
    o.value = n; o.textContent = n || emptyLabel;
    sel.appendChild(o);
  }
  if (current && !names.includes(current)) {
    const o = document.createElement('option');
    o.value = current; o.textContent = `${current} (missing)`; o.className = 'opt-missing';
    sel.appendChild(o);
  }
  sel.value = current;
}
