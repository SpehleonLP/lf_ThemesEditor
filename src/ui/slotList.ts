// src/ui/slotList.ts
// Left-column slot list for the borders surface: per-border row with a lazily-loaded 32px overlay
// thumbnail, the monospace slot name, a shared-sheet ⛓N badge, and a worst-severity dot. Plus an
// add-slot dropdown (unused enum names) and a per-row delete affordance.
//
// Wired specially (not as a generic Panel) because rows need the SurfaceContext (index + issues),
// which the Panel { mount(host); update() } interface doesn't carry. The owning surface supplies a
// `getCtx` closure returning the latest ctx; mountSlotList builds the DOM + add control once and
// updateSlotList refreshes badges/dots/thumbs/selection in place, rebuilding rows only when the
// name set changes.
import { state } from './state';
import { loadImage } from '../images';
import { unusedBorderNames, isValidBorderName } from '../borderNames';
import { countBordersSharingImage } from './sharedSheets';
import { worstSeverity } from '../package/navTarget';
import type { SurfaceContext } from './surfaces/registry';
import type { Issue, Severity } from '../package/validate';
import type { Rgba } from '../types';

// Decoded thumbnails cached per Rgba identity (mirrors rectEditor's imageCanvasCache). The same
// Rgba buffer is never reused here (each row loads its own), but identity keying is cheap and safe.
const thumbCache = new WeakMap<Rgba, HTMLCanvasElement>();
const THUMB = 32;

// The overlay image path as written in JSON, or null if the border has no overlay-object image.
function overlayImagePath(entry: any): string | null {
  const raw = entry?.Overlay;
  if (raw == null || typeof raw === 'string') return null;
  return typeof raw.Image === 'string' && raw.Image ? raw.Image : null;
}

// Render a decoded Rgba into a THUMB×THUMB canvas (contain-fit, nearest), cached by identity.
function thumbFor(image: Rgba): HTMLCanvasElement {
  const cached = thumbCache.get(image);
  if (cached) return cached;
  const src = document.createElement('canvas');
  src.width = image.width; src.height = image.height;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

  const c = document.createElement('canvas');
  c.width = THUMB; c.height = THUMB;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(THUMB / image.width, THUMB / image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  ctx.drawImage(src, Math.floor((THUMB - w) / 2), Math.floor((THUMB - h) / 2), w, h);
  thumbCache.set(image, c);
  return c;
}

function worstBorderSeverity(issues: Issue[], borderName: string): Severity | null {
  const relevant = issues.filter((i) => i.file === 'borders' && i.nav?.entry?.name === borderName);
  return worstSeverity(relevant, 'borders');
}

const SEV_COLOR: Record<Severity, string> = { error: '#e0564a', warning: '#d6a13a', notice: '#888' };

// --- Panel state (module-singleton; the borders surface mounts exactly one slot list) ---
let listEl: HTMLElement | null = null;   // scrollable rows container
let addSelect: HTMLSelectElement | null = null;
let getCtx: (() => SurfaceContext | null) | null = null;
let onSelect: ((name: string) => void) | null = null;
let onMutate: (() => void) | null = null; // called after add/delete to drive structural remount
let lastNamesKey = '';

export interface SlotListDeps {
  getCtx: () => SurfaceContext | null;
  onSelect: (name: string) => void;   // select + load + notify (selectBorder)
  onMutate: () => void;               // structural remount after add/delete (notify)
}

export function mountSlotList(host: HTMLElement, deps: SlotListDeps): void {
  getCtx = deps.getCtx;
  onSelect = deps.onSelect;
  onMutate = deps.onMutate;

  host.replaceChildren();
  const rows = document.createElement('div'); rows.className = 'sl-rows';
  const adder = document.createElement('div'); adder.className = 'sl-add';
  const sel = document.createElement('select'); sel.className = 'sl-add-select';
  adder.append(sel);
  host.append(rows, adder);

  listEl = rows;
  addSelect = sel;

  sel.onchange = () => {
    const name = sel.value;
    sel.value = '';
    if (name) addSlot(name);
  };

  lastNamesKey = '';
  updateSlotList();
}

function addSlot(name: string): void {
  if (!state.doc || !isValidBorderName(name)) return;
  if (state.doc.root[name]) { void onSelect?.(name); return; }
  // Minimal schema-valid seed (verified against borders.schema.json via ajv): an Overlay layer
  // (anyOf requires Mask or Overlay), with the required Cells in grid-lines form [xLines, yLines].
  state.doc.root[name] = { Overlay: { Image: '', Cells: [[0, 1], [0, 1]] } };
  // BordersDoc.names is a snapshot of Object.keys(root) (see document.ts wrapBordersRoot), not a
  // live getter — keep it in sync so the new row appears and unusedBorderNames excludes it.
  if (!state.doc.names.includes(name)) state.doc.names.push(name);
  state.dirty = true;
  onSelect?.(name); // selects + loads + notify; structuralKey() changes -> surface remounts panels
}

function deleteSlot(name: string): void {
  if (!state.doc || !state.doc.root[name]) return;
  delete state.doc.root[name];
  const idx = state.doc.names.indexOf(name);
  if (idx >= 0) state.doc.names.splice(idx, 1);
  if (state.selected === name) {
    const next = state.doc.names[0] ?? null;
    if (next) { state.selected = null; state.layers = null; onSelect?.(next); }
    else { state.selected = null; state.layers = null; }
  }
  state.dirty = true;
  onMutate?.(); // structural remount + revalidate
}

// Build a single row element. Kicks off the lazy thumbnail load fire-and-forget.
function buildRow(name: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sl-row';
  row.dataset.name = name;

  const thumb = document.createElement('div'); thumb.className = 'sl-thumb';
  // A <div> (not <span>) so the existing e2e selector `.bs-slots div` with hasText /^Name$/ still
  // resolves to exactly this element (its text is precisely the name; the row div's text also
  // includes the ✕, so the anchored regex matches only here).
  const label = document.createElement('div'); label.className = 'sl-name'; label.textContent = name;
  const badge = document.createElement('span'); badge.className = 'sl-badge';
  const dot = document.createElement('span'); dot.className = 'sl-dot';
  const del = document.createElement('button'); del.className = 'sl-del'; del.textContent = '✕';
  del.title = `Delete ${name}`;

  row.append(thumb, label, badge, dot, del);

  row.onclick = (e) => {
    if ((e.target as HTMLElement).closest('.sl-del')) return; // delete handles its own click
    void onSelect?.(name);
  };
  del.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete border slot "${name}"? This cannot be undone until you discard changes.`)) deleteSlot(name);
  };

  loadThumb(name, thumb);
  return row;
}

// Fire-and-forget overlay-image load into the row's thumbnail. Guards against the slot being
// deleted mid-load (path re-read from the live root). Neutral placeholder on absence / failure.
function loadThumb(name: string, thumb: HTMLElement): void {
  const entry = state.doc?.root[name];
  const path = overlayImagePath(entry);
  if (!path) { thumb.classList.add('sl-thumb-empty'); return; }
  void loadImage(path)
    .then((img) => {
      // Race guard: the row may have been removed (name set changed) since the load started.
      if (!thumb.isConnected) return;
      // Path may have changed under us (unlikely here, but cheap to check).
      if (overlayImagePath(state.doc?.root[name]) !== path) return;
      thumb.classList.remove('sl-thumb-empty');
      thumb.replaceChildren(thumbFor(img));
    })
    .catch(() => { thumb.classList.add('sl-thumb-empty'); });
}

function rebuildRows(names: string[]): void {
  if (!listEl) return;
  listEl.replaceChildren();
  for (const name of names) listEl.appendChild(buildRow(name));
}

// Refresh badges/dots/selection in place; rebuild rows only when the name set changed.
export function updateSlotList(): void {
  if (!listEl) return;
  const names = state.doc?.names ?? [];
  const namesKey = names.join('|');
  if (namesKey !== lastNamesKey) {
    lastNamesKey = namesKey;
    rebuildRows(names);
  }

  // Refresh the add-slot dropdown options against the current name set.
  if (addSelect) {
    const unused = state.doc ? unusedBorderNames(state.doc.names) : [];
    addSelect.replaceChildren();
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = '＋ Add slot…'; addSelect.appendChild(ph);
    for (const n of unused) { const o = document.createElement('option'); o.value = n; o.textContent = n; addSelect.appendChild(o); }
    addSelect.disabled = unused.length === 0;
  }

  const ctx = getCtx?.() ?? null;
  const issues = ctx?.issues ?? [];
  for (const row of Array.from(listEl.children) as HTMLElement[]) {
    const name = row.dataset.name!;
    row.classList.toggle('sl-selected', name === state.selected);

    const entry = state.doc?.root[name];
    const path = overlayImagePath(entry);

    // Shared-sheet badge ⛓N (N = borders sharing this overlay image, only when >= 2).
    const badge = row.querySelector<HTMLElement>('.sl-badge')!;
    const shared = ctx && path ? countBordersSharingImage(ctx.index, path) : 0;
    if (shared >= 2) { badge.textContent = `⛓${shared}`; badge.style.display = ''; badge.title = `${shared} borders share ${path}`; }
    else { badge.textContent = ''; badge.style.display = 'none'; }

    // Worst-severity dot among issues for this border.
    const dot = row.querySelector<HTMLElement>('.sl-dot')!;
    const sev = worstBorderSeverity(issues, name);
    if (sev) { dot.style.display = ''; dot.style.background = SEV_COLOR[sev]; dot.title = sev; }
    else { dot.style.display = 'none'; }
  }
}
