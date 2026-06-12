// src/ui/propertiesForm.ts
import { state, notify, bumpStructural } from './state';
import { readMaskMode, setMaskMode, type MaskMode } from '../maskMode';
import { selectBorder } from './main';
import type { FillMode } from '../types';

const FILLS: readonly FillMode[] = ['STRETCH', 'TILE', 'SNAP', 'FLEXIBLE', 'CENTER'];
const MASK_MODES: readonly MaskMode[] = ['image', '#COPY', '#OVERLAY', 'none'];

// The JSON key for the currently-active layer (state.activeLayer is the lowercase in-memory name).
const layerKeyOf = (l: 'mask' | 'overlay'): 'Mask' | 'Overlay' => (l === 'mask' ? 'Mask' : 'Overlay');

// One-line description per fill mode, shown under the EdgeFill/CenterFill selects. SNAP verbatim.
// Typed Record<FillMode, string> so every mode is provably covered (no '' fallback needed below).
const FILL_DESC: Record<FillMode, string> = {
  STRETCH: "Stretches the band's pixels to fill the available space.",
  TILE: 'Repeats the band at native size to fill the space.',
  FLEXIBLE: 'Grows only as needed; otherwise keeps native size.',
  CENTER: 'Draws the band at native size, centered.',
  SNAP: 'Reserved — renders as stretch.',
};

// One-line description per mask authoring mode, shown under the Mask mode select.
const MASK_DESC: Record<MaskMode, string> = {
  none: 'No mask — the overlay draws unmasked.',
  image: 'Mask has its own image + cells.',
  '#COPY': "Mask reuses the overlay's cells/geometry.",
  '#OVERLAY': 'Mask IS the overlay (alpha-masked by it).',
};

// Module-level reference to the mounted host so updateGeometryFields can find fields.
let _host: HTMLElement | null = null;

// ── Build the form skeleton ONCE ──────────────────────────────────────────────
export function mountGeometryFields(host: HTMLElement): void {
  _host = host;

  host.innerHTML = `
    <h3 data-field="heading" style="margin:8px"></h3>
    <div data-field="dockNote" style="margin:0 8px 4px;font-size:11px;opacity:0.55">Preview readout — edits here drive the preview; canvas drags read back here.</div>
    <div style="padding:8px;display:grid;gap:6px">
      <fieldset class="pf-zone"><legend>Overlay</legend>
      <label>EdgeFill x/y:
        <select data-fill="edge0">${FILLS.map((f) => `<option>${f}</option>`).join('')}</select>
        <select data-fill="edge1">${FILLS.map((f) => `<option>${f}</option>`).join('')}</select>
      </label>
      <div data-desc="edge" style="font-size:11px;opacity:0.6;margin:-2px 0 2px"></div>
      <label>CenterFill x/y:
        <select data-fill="center0">${FILLS.map((f) => `<option>${f}</option>`).join('')}</select>
        <select data-fill="center1">${FILLS.map((f) => `<option>${f}</option>`).join('')}</select>
      </label>
      <div data-desc="center" style="font-size:11px;opacity:0.6;margin:-2px 0 2px"></div>
      </fieldset>
      <fieldset class="pf-zone"><legend>Mask</legend>
        <label>Mode:
          <select data-mask="mode">${MASK_MODES.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
        </label>
        <div data-desc="mask" style="font-size:11px;opacity:0.6;margin:-2px 0 2px"></div>
      </fieldset>
      <fieldset class="pf-zone"><legend>Comment</legend>
        <label>Border:
          <input type="text" data-comment="border" placeholder="(border comment)" style="width:100%">
        </label>
        <label>Layer (<span data-comment-layer-name></span>):
          <input type="text" data-comment="layer" placeholder="(layer comment)" style="width:100%">
        </label>
      </fieldset>
      <label>Tessellation (l,t,r,b):
        <input type="number" step="any" data-edge="Tessellation" data-i="0" style="width:60px">
        <input type="number" step="any" data-edge="Tessellation" data-i="1" style="width:60px">
        <input type="number" step="any" data-edge="Tessellation" data-i="2" style="width:60px">
        <input type="number" step="any" data-edge="Tessellation" data-i="3" style="width:60px">
      </label>
      <label>Expansion (l,t,r,b):
        <input type="number" step="any" data-edge="Expansion" data-i="0" style="width:60px">
        <input type="number" step="any" data-edge="Expansion" data-i="1" style="width:60px">
        <input type="number" step="any" data-edge="Expansion" data-i="2" style="width:60px">
        <input type="number" step="any" data-edge="Expansion" data-i="3" style="width:60px">
      </label>
      <label>CenterTile (x0,y0,x1,y1):
        <input type="number" step="any" data-edge="CenterTile" data-i="0" style="width:60px">
        <input type="number" step="any" data-edge="CenterTile" data-i="1" style="width:60px">
        <input type="number" step="any" data-edge="CenterTile" data-i="2" style="width:60px">
        <input type="number" step="any" data-edge="CenterTile" data-i="3" style="width:60px">
      </label>
      <fieldset><legend>Style</legend>
        <label>Margin:
          <input type="number" step="any" data-edge="Style.Margin" data-i="0" style="width:60px">
          <input type="number" step="any" data-edge="Style.Margin" data-i="1" style="width:60px">
          <input type="number" step="any" data-edge="Style.Margin" data-i="2" style="width:60px">
          <input type="number" step="any" data-edge="Style.Margin" data-i="3" style="width:60px">
        </label>
        <label>Padding:
          <input type="number" step="any" data-edge="Style.Padding" data-i="0" style="width:60px">
          <input type="number" step="any" data-edge="Style.Padding" data-i="1" style="width:60px">
          <input type="number" step="any" data-edge="Style.Padding" data-i="2" style="width:60px">
          <input type="number" step="any" data-edge="Style.Padding" data-i="3" style="width:60px">
        </label>
        <label>MinSize w/h:
          <input type="number" step="any" data-edge="Style.MinSize" data-i="0" style="width:60px">
          <input type="number" step="any" data-edge="Style.MinSize" data-i="1" style="width:60px">
        </label>
      </fieldset>
    </div>`;

  const markDirty = () => { state.dirty = true; notify(); };

  host.querySelectorAll<HTMLSelectElement>('select[data-fill]').forEach((s) => {
    s.onchange = () => {
      if (!state.layers) return;
      const L = state.layers[state.activeLayer];
      const which = s.dataset.fill!;
      const tgt = which.startsWith('edge') ? L.edgeFill : L.centerFill;
      tgt[Number(which.slice(-1))] = s.value as FillMode;
      markDirty();
    };
  });

  host.querySelectorAll<HTMLInputElement>('input[data-edge]').forEach((inp) => {
    inp.onchange = () => {
      if (!state.doc || !state.selected) return;
      const entry = state.doc.root[state.selected];
      const n = Number(inp.value);
      if (!Number.isFinite(n)) return;
      const parts = inp.dataset.edge!.split('.');
      let tgt: Record<string, any> = entry;
      for (const k of parts.slice(0, -1)) tgt = tgt[k] ??= {};
      const f = parts[parts.length - 1];
      if (!Array.isArray(tgt[f]))
        tgt[f] = f === 'CenterTile' ? [1, 1, -1, -1] : f === 'MinSize' ? [0, 0] : [0, 0, 0, 0];
      tgt[f][Number(inp.dataset.i)] = n;
      markDirty();
    };
  });

  // Mask-mode select: mutate the entry, force a structural remount + rebuild the in-memory
  // layer state from the new entry (mask presence/copy/image can change), then re-assert dirty.
  const maskSel = host.querySelector<HTMLSelectElement>('select[data-mask="mode"]');
  if (maskSel) {
    maskSel.onchange = async () => {
      if (!state.doc || !state.selected) return;
      const entry = state.doc.root[state.selected];
      setMaskMode(entry, maskSel.value as MaskMode);
      bumpStructural();
      // selectBorder reloads both layers from the mutated entry and fires notify(); it does NOT
      // touch state.dirty, so set it AFTER the await and notify once more so panels see dirty=true.
      await selectBorder(state.selected);
      state.dirty = true;
      notify();
    };
  }

  // Comment fields: free text on the border and on the active layer. oninput so each keystroke
  // round-trips; the focus-preserving update() skips these while focused so typing isn't clobbered.
  host.querySelectorAll<HTMLInputElement>('input[data-comment]').forEach((inp) => {
    inp.oninput = () => {
      if (!state.doc || !state.selected) return;
      const entry = state.doc.root[state.selected];
      const v = inp.value;
      let tgt: Record<string, any>;
      if (inp.dataset.comment === 'border') {
        tgt = entry;
      } else {
        const key = layerKeyOf(state.activeLayer);
        // Only objects can carry a Comment; a string-form layer (#OVERLAY / #COPY ref) has nowhere
        // to put it, so skip rather than clobber the ref.
        if (entry[key] == null || typeof entry[key] === 'string') return;
        tgt = entry[key];
      }
      if (v === '') delete tgt.Comment; else tgt.Comment = v;
      state.dirty = true;
      notify();
    };
  });

  // Populate values immediately after building.
  updateGeometryFields();
}

// ── Update field values in place, skipping the focused element ───────────────
export function updateGeometryFields(): void {
  if (!_host) return;

  if (!state.doc || !state.selected || !state.layers) {
    _host.style.display = 'none';
    return;
  }
  _host.style.display = '';

  const entry = state.doc.root[state.selected];
  const L = state.layers[state.activeLayer];
  const active = document.activeElement;

  // Heading
  const heading = _host.querySelector<HTMLElement>('[data-field="heading"]');
  if (heading) heading.textContent = `${state.selected} — ${state.activeLayer}`;

  // Fill selects
  const fillValues: Record<string, string> = {
    edge0: L.edgeFill[0],
    edge1: L.edgeFill[1],
    center0: L.centerFill[0],
    center1: L.centerFill[1],
  };
  _host.querySelectorAll<HTMLSelectElement>('select[data-fill]').forEach((s) => {
    if (s === active) return;
    const key = s.dataset.fill!;
    if (key in fillValues) s.value = fillValues[key];
  });

  // Fill-mode descriptions for the active edge/center selection. If x and y differ, show both.
  const describe = (x: FillMode, y: FillMode): string =>
    x === y ? FILL_DESC[x] : `x: ${FILL_DESC[x]}  ·  y: ${FILL_DESC[y]}`;
  const edgeDesc = _host.querySelector<HTMLElement>('[data-desc="edge"]');
  const centerDesc = _host.querySelector<HTMLElement>('[data-desc="center"]');
  if (edgeDesc) edgeDesc.textContent = describe(L.edgeFill[0], L.edgeFill[1]);
  if (centerDesc) centerDesc.textContent = describe(L.centerFill[0], L.centerFill[1]);

  // Mask-mode select + description (skip writing .value while it's focused).
  const mm = readMaskMode(entry);
  const maskSel = _host.querySelector<HTMLSelectElement>('select[data-mask="mode"]');
  if (maskSel && maskSel !== active) maskSel.value = mm;
  const maskDesc = _host.querySelector<HTMLElement>('[data-desc="mask"]');
  if (maskDesc) maskDesc.textContent = MASK_DESC[mm];

  // Comment fields (skip writing while focused so typing isn't clobbered).
  const layerKey = layerKeyOf(state.activeLayer);
  const layerObj = entry[layerKey];
  const layerHasComment = layerObj != null && typeof layerObj !== 'string';
  const borderComment = _host.querySelector<HTMLInputElement>('input[data-comment="border"]');
  if (borderComment && borderComment !== active) borderComment.value = entry.Comment ?? '';
  const layerComment = _host.querySelector<HTMLInputElement>('input[data-comment="layer"]');
  if (layerComment) {
    // A string-form layer (#OVERLAY/#COPY ref) can't carry a Comment — disable the field there.
    layerComment.disabled = !layerHasComment;
    if (layerComment !== active) layerComment.value = layerHasComment ? (layerObj.Comment ?? '') : '';
  }
  const layerName = _host.querySelector<HTMLElement>('[data-comment-layer-name]');
  if (layerName) layerName.textContent = layerKey;

  // Numeric inputs — resolve value by traversing the entry path
  _host.querySelectorAll<HTMLInputElement>('input[data-edge]').forEach((inp) => {
    if (inp === active) return;
    const parts = inp.dataset.edge!.split('.');
    let tgt: Record<string, any> = entry;
    for (const k of parts.slice(0, -1)) {
      tgt = tgt?.[k];
      if (!tgt) return;
    }
    const f = parts[parts.length - 1];
    const arr: number[] | undefined = tgt?.[f];
    const idx = Number(inp.dataset.i);
    const defaultVal =
      f === 'CenterTile' ? [1, 1, -1, -1][idx] :
      f === 'MinSize'    ? 0 :
                           0;
    inp.value = String(arr?.[idx] ?? defaultVal);
  });
}

// ── Thin compatibility wrapper (used by any other callers) ───────────────────
export function renderPropertiesForm(host: HTMLElement): void {
  mountGeometryFields(host);
}
