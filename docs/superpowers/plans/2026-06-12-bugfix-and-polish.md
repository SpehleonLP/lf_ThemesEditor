# Bugfix & Polish Implementation Plan (post-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the data-loss and wrong-output bugs found in the 2026-06-12 code review, close the validator blind spots, and add the highest-value workflow shortcomings (audio preview, RC go-to-definition, dropdown adds, pack edge gutter). The Build/`.lf_gui` button is explicitly OUT of scope.

**Architecture:** All fixes are in-place edits to the existing modules; two small new shared helpers are added (`src/ui/options.ts` select-filler, `src/ui/audio.ts` audio player, `src/ui/pickerDialog.ts` dropdown dialog). Pure-logic changes get vitest unit tests (node env — no DOM/GL in unit tests); UI/GL changes get e2e or scripted manual verification.

**Tech Stack:** TypeScript + Vite, vitest (`npx vitest run`), Playwright e2e (`npx playwright test`, port 8137 — kill zombies first, see TECHNICAL-DEBT/e2e notes), plain Node `server.js`.

**Conventions for every task:**
- Run `npx vitest run` (full suite) before each commit, not just the new test file.
- Run `npx tsc --noEmit` before each commit.
- Commit messages follow the repo's `fix(scope):` / `feat(scope):` style.
- Tests live in `tests/`, mirroring existing file naming.

---

## Phase A — data-safety bugs

### Task 1: `applyPackResult` crashes mid-mutation on string `Mask`/`Overlay`

`entry.Mask ??= {}` doesn't replace the schema-legal string forms (`"#OVERLAY"`, copy-ref strings), so `entry.Mask.Image = ...` throws after the overlay block and PNG sheets were already written.

**Files:**
- Modify: `src/document.ts:60-70`
- Test: `tests/applyEdits.test.ts` (existing file — add cases)

- [ ] **Step 1: Write the failing tests**

Add to `tests/applyEdits.test.ts` (reuse the file's existing imports of `applyPackResult`; add a grid helper if one isn't already there):

```ts
import { describe, it, expect } from 'vitest';
import { applyPackResult } from '../src/document';
import type { CellGrid, EditorCell } from '../src/types';

const grid = (): CellGrid =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, (): EditorCell => ({ rect: [0, 0, 1, 1], mirrorX: false, mirrorY: false })));

const packApply = (over: Partial<Parameters<typeof applyPackResult>[1]>) => ({
  overlayImage: null, maskImage: null, overlayCells: null, maskCells: null,
  linked: false, source: { linked: false }, sourceCells: grid(), pack: { gutter: 8, align: 4 },
  ...over,
});

describe('applyPackResult with string layers', () => {
  it('replaces Mask:"#OVERLAY" with an object instead of throwing', () => {
    const entry: any = { Mask: '#OVERLAY' };
    applyPackResult(entry, packApply({ maskImage: 'Images/packed/m.png', maskCells: grid() }));
    expect(typeof entry.Mask).toBe('object');
    expect(entry.Mask.Image).toBe('Images/packed/m.png');
  });
  it('replaces a string Overlay with an object instead of throwing', () => {
    const entry: any = { Overlay: 'whatever' };
    applyPackResult(entry, packApply({ overlayImage: 'Images/packed/o.png', overlayCells: grid() }));
    expect(typeof entry.Overlay).toBe('object');
    expect(entry.Overlay.Image).toBe('Images/packed/o.png');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/applyEdits.test.ts`
Expected: FAIL with `TypeError: Cannot create property 'Image' on string`

- [ ] **Step 3: Implement the guard**

In `src/document.ts`, replace the body of `applyPackResult`'s two layer blocks:

```ts
// A pack result always rewrites the layer as the object form; the string forms
// ("#OVERLAY", copy refs) can't carry the new Image/Cells.
const objectLayer = (entry: any, key: 'Mask' | 'Overlay'): any => {
  if (typeof entry[key] !== 'object' || entry[key] === null || Array.isArray(entry[key])) entry[key] = {};
  return entry[key];
};

export function applyPackResult(entry: any, r: PackApply): void {
  if (r.overlayImage && r.overlayCells) {
    const o = objectLayer(entry, 'Overlay');
    o.Image = r.overlayImage;
    o.Cells = serializeCells(r.overlayCells);
  }
  if (r.maskImage && r.maskCells) {
    const m = objectLayer(entry, 'Mask');
    m.Image = r.maskImage;
    m.Cells = r.linked ? '#COPY' : serializeCells(r.maskCells);
  }
  setEditorMeta(entry, { version: 1, source: r.source, sourceCells: flat(r.sourceCells), pack: r.pack });
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → PASS
- [ ] **Step 5: Commit** — `fix(borders): pack export no longer crashes on string Mask/Overlay forms`

### Task 2: any read failure is treated as "file missing" → silent overwrite on Save

`loadPackage` catches every `read()` rejection as `missing: true`. A transient FUSE/permission error (real hazard on this ntfs-3g mount) then presents as "created on first save" and Save overwrites the real file. `server.js` already returns 404 only for ENOENT — the client just doesn't look.

**Files:**
- Modify: `src/api.ts`, `src/package/model.ts:36-48`
- Test: `tests/package/model.test.ts` if it exists, else add cases to the existing package model test (`grep -rl loadPackage tests/`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadPackage } from '../../src/package/model';
import { HttpError } from '../../src/api';

describe('loadPackage read-error handling', () => {
  it('marks 404 as missing', async () => {
    const pkg = await loadPackage(async () => { throw new HttpError('read x: 404', 404); });
    expect(pkg.files.borders.missing).toBe(true);
    expect(pkg.files.borders.loadError).toBeUndefined();
  });
  it('marks non-404 failures as loadError (read-only), not missing', async () => {
    const pkg = await loadPackage(async () => { throw new HttpError('read x: 500 EIO', 500); });
    expect(pkg.files.borders.missing).toBeUndefined();
    expect(pkg.files.borders.loadError).toContain('500');
  });
  it('treats a non-HTTP failure (network down) as loadError', async () => {
    const pkg = await loadPackage(async () => { throw new TypeError('fetch failed'); });
    expect(pkg.files.borders.loadError).toContain('fetch failed');
  });
});
```

Run: fails (`HttpError` doesn't exist; second/third assertions fail).

- [ ] **Step 2: Implement**

`src/api.ts` — typed error, thrown from both readers:

```ts
export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'HttpError'; }
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new HttpError(`read ${path}: ${r.status} ${await r.text()}`, r.status);
  return new Uint8Array(await r.arrayBuffer());
}
```

(`writeFileBytes`/`listDir` may also throw `HttpError` for consistency — optional, do it.)

`src/package/model.ts` — in `loadPackage`'s first catch:

```ts
    try {
      text = await read(path);
    } catch (e) {
      // Only a confirmed 404 means "doesn't exist yet". Anything else (5xx, network)
      // must NOT degrade to missing: a later Save would overwrite the real file.
      if ((e as any)?.status === 404) {
        files[key] = { path, root: {}, dirty: false, indent: '\t', missing: true };
      } else {
        files[key] = { path, root: {}, dirty: false, indent: '\t', loadError: String((e as Error)?.message ?? e) };
      }
      continue;
    }
```

(Use a structural `status` check, not `instanceof`, so tests and future callers can throw plain objects.)

- [ ] **Step 3: Run tests** — `npx vitest run` → PASS. Also verify the loadError save-protection still holds: `grep -n loadError src/ui/shell.ts` should show Save skipping loadError files.
- [ ] **Step 4: Commit** — `fix(package): only HTTP 404 counts as missing file; other read errors are read-only loadError`

### Task 3: schema-legal numeric border keys crash the app at mount

`wrapBordersRoot` throws on `^[0-9]+$` keys; it's called unguarded inside the borders surface at boot → blank app for a schema-valid file.

**Files:**
- Modify: `src/ui/boot.ts` (after `loadPackage`), `src/ui/surfaces/borders.ts` (guard the mount)
- Test: `tests/document.test.ts` (the throw stays — it's a backstop), plus a new pure helper test

- [ ] **Step 1: Add the pure check + failing test**

In `src/document.ts`:

```ts
// The editor cannot round-trip numeric root keys (JS key-order rules would silently
// reorder them on serialize). Detect at load so the file degrades to read-only.
export function numericBorderKeys(root: Record<string, any>): string[] {
  return Object.keys(root).filter((k) => /^[0-9]+$/.test(k));
}
```

Test in `tests/document.test.ts`:

```ts
import { numericBorderKeys } from '../src/document';

it('numericBorderKeys finds raw-enum keys', () => {
  expect(numericBorderKeys({ '12': {}, Header_0: {} })).toEqual(['12']);
  expect(numericBorderKeys({ Header_0: {} })).toEqual([]);
});
```

- [ ] **Step 2: Wire into boot**

In `src/ui/boot.ts`, immediately after the package is loaded (before validators run / surfaces mount):

```ts
import { numericBorderKeys } from '../document';
// ...
const b = pkg.files.borders;
if (!b.loadError && !b.missing) {
  const bad = numericBorderKeys(b.root);
  if (bad.length) b.loadError = `borders.json uses numeric key "${bad[0]}" (raw enum). The editor cannot round-trip numeric keys; the file is read-only here. Rename the key to its slot name in a text editor.`;
}
```

- [ ] **Step 3: Guard the borders surface mount**

In `src/ui/surfaces/borders.ts`, at the top of the function that calls `wrapBordersRoot` (around line 47, in `buildOnce`/mount): if the borders `FileDoc` has `loadError`, render a read-only notice instead of building the surface and return:

```ts
if (bordersFile.loadError) {
  host.replaceChildren();
  const div = document.createElement('div');
  div.className = 'ro-empty';
  div.textContent = `borders.json is read-only: ${bordersFile.loadError}`;
  host.appendChild(div);
  return;
}
```

(Match the actual variable name for the borders FileDoc in that file. The existing `fileStateValidator` already emits the drawer error for `loadError` files — no validator change needed.)

- [ ] **Step 4: Verify** — `npx vitest run` PASS; `npx tsc --noEmit` clean. Manual: temporarily add a `"12": {}` key to a scratch borders.json, boot the app (`npm run dev` or the e2e mirror), confirm the app loads with the borders surface showing the read-only notice and the Issues drawer showing the load error; Save must not write borders.json.
- [ ] **Step 5: Commit** — `fix(borders): numeric root keys degrade to read-only file instead of crashing at mount`

---

## Phase B — wrong-output bugs

### Task 4: `sampleSpline` crashes on empty marks

**Files:** Modify: `src/rc/spline.ts:47-49` · Test: `tests/rc/spline.test.ts` (existing)

- [ ] **Step 1: Failing test**

```ts
it('returns zeros for empty marks instead of crashing', () => {
  expect(sampleSpline([], 1, 0.5, false)).toEqual([0]);
  expect(sampleSpline([], 2, 0.5, true)).toEqual([0, 0]);
});
```

- [ ] **Step 2: Fix** — first line of `computeSelect`:

```ts
  const input = s.input, output = s.output, elements = input.length;
  if (elements === 0) return new Array<number>(dim).fill(0); // hand-edited doc; schema requires >=1
  if (elements === 1) return output[0].slice();
```

- [ ] **Step 3:** `npx vitest run tests/rc/spline.test.ts` → PASS → commit `fix(rc): sampleSpline returns zeros on empty marks instead of crashing`

### Task 5: `in`-operator prototype collisions in rename (rc + bg)

`'constructor' in table` is `true` for any parsed JSON object. Both `src/rc/rename.ts:20-21` and `src/bg/rename.ts:17-18` have it, and the `name in table` checks in `src/ui/rc/surface.ts:42,46,77` and `src/ui/bg/surface.ts:39,45,66` have the same hole.

**Files:** Modify: `src/rc/rename.ts`, `src/bg/rename.ts`, `src/ui/rc/surface.ts`, `src/ui/bg/surface.ts` · Test: `tests/rc/rename.test.ts` (existing)

- [ ] **Step 1: Failing test** (in `tests/rc/rename.test.ts`, using the file's existing pkg/index fixture helpers):

```ts
it('allows renaming to Object.prototype names', () => {
  // build a pkg with an event 'A'; rename A → 'toString' must not throw "already exists"
  // and 'constructor' must count as absent
});
```

Write it concretely against the fixture pattern already in that file (it constructs a `PackageDoc` and `RefIndex` — copy the arrange code of an existing rename test, then `expect(() => renameRcEntry(pkg, index, 'rc:events', 'A', 'toString')).not.toThrow()`).

- [ ] **Step 2: Fix** — in both rename files replace:

```ts
  if (!table || !Object.hasOwn(table, oldName)) throw new Error(...);
  if (Object.hasOwn(table, newName)) throw new Error(...);
```

In the two surface files replace every `name in table` / `next in (table ?? {})` / `key in table` membership test with `Object.hasOwn(table, name)` (guard `table` first where it can be undefined: `Object.hasOwn(table ?? {}, next)`).

- [ ] **Step 3:** `npx vitest run` → PASS → commit `fix(rename): use Object.hasOwn — JSON tables inherit Object.prototype`

### Task 6: stale gradient atlas in the Backgrounds preview (and per-frame rebake)

`setGradients` gates on a numeric rev that only the stop editor bumps; add/delete/rename change row indices without bumping. Also `rebuildGradients` re-bakes every gradient on every animation frame.

**Files:** Modify: `src/preview/bg/renderer.ts` (`setGradients`, `gradRev` field), `src/ui/bg/previewPanel.ts:33-38`

- [ ] **Step 1: Change the gate to a content key**

`src/preview/bg/renderer.ts`: change the field `gradRev` from number to `private gradKey = '';` and:

```ts
  // key: identifies the gradient set + content revision; re-upload only when it changes.
  setGradients(rows: Float32Array[], key: string): void {
    if (key === this.gradKey) return;
    this.gradKey = key;
    // ... rest unchanged ...
  }
```

- [ ] **Step 2: Build the key from order + rev, and cache the bake**

`src/ui/bg/previewPanel.ts`, replace `rebuildGradients`:

```ts
let gradKey = '';
let gradRows: Float32Array[] = [];

function rebuildGradients(): void {
  const grads = _deps!.file.root.Gradients ?? {};
  const order = Object.keys(grads);
  // gradientRev covers stop edits; the name list covers add/delete/rename (row indices shift).
  const key = `${bgState.gradientRev}|${order.join(' ')}`;
  if (key !== gradKey) {
    gradKey = key;
    gradOrder = order;
    gradRows = order.map((n) => bakeGradient(Array.isArray(grads[n]) ? grads[n] : []) as Float32Array);
  }
  renderer!.setGradients(gradRows.length ? gradRows : [new Float32Array(128 * 4).fill(1)], gradKey);
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx vitest run`. Manual: backgrounds surface, pair a light with gradient B, then delete gradient A (above it) → the light must immediately re-sample the right row; add a gradient → no stale render.
- [ ] **Step 4: Commit** — `fix(bg-preview): gradient atlas keys on name-set + rev; bake once per change, not per frame`

### Task 7: imageless `#COPY` mask renders from leftover GPU state

`updatePreview` sets `maskMode 1` for `#COPY`, but `layerInput('mask')` is null when the mask has no image — the renderer then skips all mask uploads while the shader still masks.

**Files:** Modify: `src/ui/previewPanel.ts` (~line 540), `src/preview/renderer.ts` (~line 180), `src/package/validate.ts` (+ export for test) · Test: `tests/validate.maskImage.test.ts` (new)

- [ ] **Step 1: Preview downgrade** — in `updatePreview` (`src/ui/previewPanel.ts`):

```ts
  const mm = readMaskMode(entry);
  const maskLayer = layerInput('mask');
  // '#COPY'/'image' need a sampleable mask texture; without one, render unmasked
  // (matches "nothing to sample") instead of inheriting the previous draw's uniforms.
  const maskMode: 0 | 1 | 2 = mm === 'none' ? 0 : mm === '#OVERLAY' ? 2 : maskLayer ? 1 : 0;
  const input: PreviewInput = {
    mask: maskLayer,
    /* ... rest unchanged ... */
```

- [ ] **Step 2: Renderer backstop** — in `src/preview/renderer.ts` where `u_maskMode` is set:

```ts
    const maskMode = input.maskMode === 1 && !input.mask ? 0 : input.maskMode;
    gl.uniform1i(u('u_maskMode'), maskMode);
    if (maskMode === 1 && input.mask) {
```

- [ ] **Step 3: Validator** — in `src/package/validate.ts`, new validator (exported for tests) + registry entry:

```ts
// 8. borders-mask-image — object-form Mask/Overlay with no Image samples nothing in the
// engine; the preview renders it unmasked. Warn so the author notices.
export const bordersLayerImageValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const doc = pkg.files.borders;
  if (doc.loadError || doc.missing || !doc.root) return out;
  for (const name of Object.keys(doc.root)) {
    for (const key of ['Mask', 'Overlay'] as const) {
      const layer = doc.root[name]?.[key];
      if (layer && typeof layer === 'object' && !Array.isArray(layer)
          && (typeof layer.Image !== 'string' || layer.Image === '')) {
        out.push({
          severity: 'warning', category: 'borders-mask-image',
          message: `Border "${name}" ${key} has no Image — there is nothing to sample; the preview renders it disabled.`,
          file: 'borders', jsonPath: [name, key],
          nav: { surface: 'borders', entry: { name } },
        });
      }
    }
  }
  return out;
};
```

Add to `REGISTRY`. Note: `Validator` is a module-private type — exporting the const is fine; export the `Validator` type too if tsc complains.

- [ ] **Step 4: Test** (`tests/validate.maskImage.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { bordersLayerImageValidator } from '../src/package/validate';

const pkgWith = (borders: any) => ({
  files: {
    borders: { path: 'borders.json', root: borders, dirty: false, indent: '\t' },
    backgrounds: { path: 'backgrounds.json', root: {}, dirty: false, indent: '\t' },
    responseCurves: { path: 'response curves.json', root: {}, dirty: false, indent: '\t' },
    codingThemes: { path: 'coding themes.json', root: {}, dirty: false, indent: '\t' },
  },
}) as any;

describe('bordersLayerImageValidator', () => {
  it('warns on object Mask without Image', () => {
    const issues = bordersLayerImageValidator(pkgWith({ Header_0: { Mask: { Cells: '#COPY' } } }), null as any, null as any, null as any);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });
  it('is silent for string Mask and image-bearing layers', () => {
    const issues = bordersLayerImageValidator(pkgWith({
      A: { Mask: '#OVERLAY' }, B: { Overlay: { Image: 'Images/x.png' } },
    }), null as any, null as any, null as any);
    expect(issues).toHaveLength(0);
  });
});
```

- [ ] **Step 5:** `npx vitest run` → PASS → commit `fix(preview): imageless #COPY mask renders unmasked, not from stale GPU state; warn in validator`

### Task 8: Assets "go ↗" navigates with the table name, not the entry name

`assets.ts:43` uses `jsonPath[0]` — correct only for borders. Backgrounds/sounds edges start with the table name.

**Files:** Modify: `src/package/refIndex.ts` (new helper), `src/ui/surfaces/assets.ts:43` · Test: `tests/refIndex.test.ts` or wherever refIndex tests live (`grep -rl refIndex tests/`)

- [ ] **Step 1: Helper + failing test**

`src/package/refIndex.ts`:

```ts
// The entry name a consumer edge belongs to, for reveal()-style navigation.
// borders edges are rooted at the entry ([name, 'Overlay', 'Image']); every other
// file roots at the table ([table, name, ...]).
export function edgeEntryName(e: RefEdge): string {
  return String((e.from.file === 'borders' ? e.from.jsonPath[0] : e.from.jsonPath[1]) ?? '');
}
```

Test:

```ts
import { edgeEntryName } from '../src/package/refIndex';

it('edgeEntryName picks the entry, not the table', () => {
  expect(edgeEntryName({ from: { file: 'borders', jsonPath: ['Header_0', 'Overlay', 'Image'], label: '' }, to: {} } as any)).toBe('Header_0');
  expect(edgeEntryName({ from: { file: 'backgrounds', jsonPath: ['Backgrounds', '3', 'Detail Layers', 0, 'image'], label: '' }, to: {} } as any)).toBe('3');
  expect(edgeEntryName({ from: { file: 'responseCurves', jsonPath: ['Sound Effects', 'click', 'file'], label: '' }, to: {} } as any)).toBe('click');
});
```

- [ ] **Step 2: Use it** — `src/ui/surfaces/assets.ts:43`:

```ts
      go.addEventListener('click', () => ctxRef.navigate({ surface: e.from.file, entry: { name: edgeEntryName(e) } }));
```

- [ ] **Step 3: Verify reveal paths** — read `bg/surface.ts reveal()` and `rc/surface.ts reveal()` (both resolve a bare `{name}` through `resolveEntrySelection` then fall back to slot tables — already compatible). Manual check: Assets → a sound referenced by a Sound Effect → "go ↗" must land on that sound-effect entry; an image referenced by a backdrop must land on that backdrop slot.
- [ ] **Step 4:** `npx vitest run` → PASS → commit `fix(assets): go-to-consumer navigates to the entry, not the table`

### Task 9: bg-form dangling refs show "(none)"; option lists built via unescaped innerHTML

RC forms already append a `(missing)` sentinel option; the bg forms don't — a dangling gradient/texCoord displays as unset and an unrelated change rewrites it to `''`. The same selects interpolate names into `innerHTML` unescaped.

**Files:**
- Create: `src/ui/options.ts`
- Modify: `src/ui/bg/lightForm.ts:65-73`, `src/ui/bg/backdropForm.ts:117-135`, `src/ui/bg/previewPanel.ts:125-128`; refactor `src/ui/rc/curveForm.ts:56-62`, `src/ui/rc/eventForm.ts:38-45`, `src/ui/rc/soundForm.ts:50-56` onto the same helper

- [ ] **Step 1: Shared helper** (`src/ui/options.ts`):

```ts
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
```

- [ ] **Step 2: lightForm** — replace the two `innerHTML` option builders in `updateLightForm` (keep the `!== active` guards):

```ts
  const gSel = _host.querySelector<HTMLSelectElement>('[data-f="gradient"]')!;
  if (gSel !== active) fillOptions(gSel, gNames, entry.gradient ?? '', '(none — required)');
  const tSel = _host.querySelector<HTMLSelectElement>('[data-f="texCoord"]')!;
  if (tSel !== active) fillOptions(tSel, tcNames, entry.texCoord ?? '', '(inherit layer texCoord)');
```

then delete the now-redundant `set('[data-f="gradient"]', ...)` / `set('[data-f="texCoord"]', ...)` lines.

- [ ] **Step 3: backdropForm** — same for the texCoord select (`fillOptions(tcSel, tcNames, l.texCoord, '(none)')` inside the per-layer loop; move it after `readLayers` so `current` is available). For the image select keep the existing "manual path goes to the text input" behavior, but build options via DOM:

```ts
    if (imgSel !== active) fillOptions(imgSel, ['#HURL_NOISE', ...images], inList ? l.image : '', '(none)');
```

(`fillOptions` already prepends the empty option; restructure the update loop so `inList`/`l` are computed before filling. Delete the corresponding `set(...)` calls.)

- [ ] **Step 4: bg/previewPanel `fill`** — rewrite using `fillOptions` (current values always exist here; the sentinel is harmless):

```ts
  const fill = (sel: string, opts: string[], val: string) => {
    const el = _host!.querySelector<HTMLSelectElement>(sel);
    if (!el || el === document.activeElement) return;
    fillOptions(el, opts.filter((o) => o !== ''), val, '(none)');
  };
```

- [ ] **Step 5: RC forms** — replace the hand-rolled option loops in `curveForm.updateCurveForm`, `eventForm.updateEventForm`, `soundForm.updateSoundForm` with `fillOptions(sel, names, cur, '— none —')` (behavior identical; less duplication).

- [ ] **Step 6: CSS** — add to the surface stylesheet (find where `.rc-slot` is defined, likely `src/ui/*.css` or `index.html`-linked css): `.opt-missing { color: #f66; }`

- [ ] **Step 7: Verify** — `npx tsc --noEmit`; `npx vitest run`; `npx playwright test` (the bg/rc e2e specs exercise these forms). Manual: hand-edit a light's gradient to a nonexistent name → select shows `name (missing)` in red, and changing *another* field must not clear it.
- [ ] **Step 8: Commit** — `fix(forms): dangling refs show a (missing) sentinel; options DOM-built (no innerHTML injection)`

### Task 10: drag robustness in `splinePlot` and `gradientBar`

Three defects: no `pointercancel` (stuck drag), `splinePlot` recomputes its y-range mid-drag (handle runs away), duplicate-`t` selection recovery picks the wrong mark.

**Files:** Modify: `src/ui/rc/splinePlot.ts:71-102`, `src/ui/bg/gradientBar.ts:73-103`

- [ ] **Step 1: splinePlot** — freeze the axis at drag start, share an end-drag path, recover selection by identity:

```ts
  let sel = 0, dragging = -1;
  let dragAxis: { maxT: number; lo: number; hi: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    const marks = opts.getMarks(); if (!marks.length) return;
    const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    /* nearest-mark hit test unchanged */
    if (nearest >= 0) {
      sel = nearest; dragging = nearest; dragAxis = { maxT, lo, hi };
      canvas.setPointerCapture(e.pointerId); draw();
    } else { /* add-mark branch unchanged */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging < 0 || !dragAxis) return;
    const marks = opts.getMarks().slice();
    const t = tFromX(e.offsetX, dragAxis.maxT);
    const v = vFromY(e.offsetY, dragAxis.lo, dragAxis.hi);
    const old = marks[dragging];
    marks[dragging] = opts.dim === 1 ? [t, v] : [t, (old[1] as number[]).slice() as any];
    opts.setMarks(marks, { live: true });
  });
  function endDrag(e: PointerEvent): void {
    if (dragging < 0) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const marks = opts.getMarks().slice();
    const dragged = marks[dragging];
    marks.sort((a, b) => a[0] - b[0]);
    sel = Math.max(0, marks.indexOf(dragged)); // identity, not t-equality
    dragging = -1; dragAxis = null;
    opts.setMarks(marks, { live: false }); renderMarks();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
```

(Note the y-axis freeze also fixes the "rescales under the cursor" feedback loop — `vFromY` now maps through the range captured at pointerdown.)

- [ ] **Step 2: gradientBar** — same shape: capture `const dragMaxT = maxTOf(marks)` at pointerdown into a `let` next to `dragging`; use it in pointermove instead of recomputing; extract `endDrag` with identity-based `sel = marks.indexOf(dragged)`; register for both `pointerup` and `pointercancel`.

- [ ] **Step 3: Verify** — `npx vitest run`; `npx playwright test e2e/editor.spec.ts` (gradient-stop-drag and spline-mark e2e tests must stay green). Manual: drag a 1D spline mark far above the current max — the handle must track the cursor without accelerating away.
- [ ] **Step 4: Commit** — `fix(drag): pointercancel handling, frozen drag axis, identity-based selection recovery`

### Task 11: RC form commits skip `rcNotify()`

Cross-panel state stays stale until the 150 ms validation debounce happens to refresh.

**Files:** Modify: `src/ui/rc/curveForm.ts`, `src/ui/rc/eventForm.ts`, `src/ui/rc/soundForm.ts`

- [ ] **Step 1:** Import `rcNotify` from `'../../rc/state'` in all three. Add `rcNotify();` immediately after every `deps!.markDirty();` / `deps.markDirty();` call site (curveForm: `writeSlot` + Comment handler; eventForm: channel change + Comment; soundForm: file change, `writeRange`, Comment). The update functions all guard `document.activeElement`, so a notify mid-change is safe (this is the established pattern — bg forms already do `markDirty(); bgNotify();`).
- [ ] **Step 2:** `npx vitest run && npx playwright test` → green. Commit `fix(rc): form commits notify immediately instead of riding the validation debounce`

### Task 12: bg preview doesn't repaint on W/H change or async image arrival while paused

**Files:** Modify: `src/ui/bg/previewPanel.ts:25-31, 104-105`

- [ ] **Step 1:**

```ts
host.querySelector('[data-pv="w"]')!.addEventListener('change', (e) => {
  panelW = Number((e.target as HTMLInputElement).value) || panelW;
  if (!bgState.playing) frame();
});
// same for "h"
```

```ts
function ensureImage(path: string | null): Rgba | null {
  if (!path || path === '#HURL_NOISE') return null;
  if (imgCache.has(path)) return imgCache.get(path)!;
  imgCache.set(path, null);
  loadImage(path)
    .then((img) => { imgCache.set(path, img); if (!bgState.playing) frame(); })
    .catch(() => imgCache.set(path, null));
  return null;
}
```

- [ ] **Step 2:** Manual verify: pause the bg preview, change W → repaints; select a backdrop whose image isn't cached while paused → paints when the image lands. Commit `fix(bg-preview): repaint on size change and async image arrival while paused`

### Task 13: referenced assets in engine-unsupported formats validate clean

Only `webp`/`mp3` are "rejected"; a referenced `.psd`/`.tga` that exists on disk produces zero issues. Make the check reference-driven.

**Files:** Modify: `src/package/assets.ts`, `src/package/validate.ts` (assetsValidator) · Test: the existing assets test (`grep -rl classifyAssets tests/`)

- [ ] **Step 1: Failing test**

```ts
it('flags referenced files whose extension the engine cannot load', () => {
  const edges = [edgeTo('asset:image', 'Images/foo.psd')]; // reuse the file's edge fixture helper
  const list = classifyAssets([{ path: 'Images/foo.psd' }], edges);
  expect(list.wrongFormat).toEqual([{ name: 'Images/foo.psd', kind: 'image', ext: 'psd' }]);
});
it('eligible referenced files are not flagged', () => {
  const list = classifyAssets([{ path: 'Images/foo.png' }], [edgeTo('asset:image', 'Images/foo.png')]);
  expect(list.wrongFormat).toEqual([]);
});
```

- [ ] **Step 2: Implement** — `src/package/assets.ts`:

```ts
export interface WrongFormatRef { name: string; kind: AssetKind; ext: string }

export interface AssetList {
  images: AssetEntry[];
  sounds: AssetEntry[];
  missing: MissingRef[];
  wrongFormat: WrongFormatRef[];   // referenced + on disk, but the engine can't load the format
  exists(path: string): boolean;
}
```

In `classifyAssets`, alongside the missing loop:

```ts
  const missing: MissingRef[] = [];
  const wrongFormat: WrongFormatRef[] = [];
  for (const ns of ['asset:image', 'asset:sound'] as const) {
    const kind: AssetKind = ns === 'asset:image' ? 'image' : 'sound';
    const eligible = ns === 'asset:image' ? IMAGE_ELIGIBLE : SOUND_ELIGIBLE;
    for (const name of new Set(edges.filter((e) => e.to.ns === ns).map((e) => e.to.name))) {
      if (!present.has(name)) missing.push({ name, kind });
      else if (!eligible.has(ext(name))) wrongFormat.push({ name, kind, ext: ext(name) });
    }
  }
  return { images, sounds, missing, wrongFormat, exists: (path) => present.has(path) };
```

- [ ] **Step 3: Validator** — in `assetsValidator` (`src/package/validate.ts`):

```ts
  for (const w of assets.wrongFormat) {
    out.push({
      severity: 'error', category: 'asset',
      message: `Referenced ${w.kind} "${w.name}" is a .${w.ext} — the engine only loads ${w.kind === 'image' ? 'png/jpg/jpeg/bmp' : 'wav/flac/ogg'}. Export it to a supported format.`,
      file: 'assets', nav: { surface: 'assets' },
    });
  }
```

Fix any other `AssetList` literal in tests/fixtures (`wrongFormat: []`).

- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit` → commit `fix(validate): referenced assets in engine-unsupported formats are errors`

### Task 14: RC spline/gradient mark validation (ordering + shape)

Schemas say "t strictly ascending" but only `backgrounds.Gradients` is checked. Malformed/disordered RC marks reach `sampleSpline` (Task 4's input).

**Files:** Modify: `src/package/validate.ts` (new exported validator + registry) · Test: `tests/validate.rcMarks.test.ts` (new)

- [ ] **Step 1: Failing test** (same `pkgWith`-style fixture as Task 7, but populating `responseCurves.root`):

```ts
import { rcMarksValidator } from '../src/package/validate';

it('errors on non-ascending t', () => {
  const issues = rcMarksValidator(pkgWith({ '1D Splines': { bad: [[1, 0], [0.5, 1]] } }), ...);
  expect(issues.some((i) => i.severity === 'error' && i.message.includes('ascending'))).toBe(true);
});
it('errors on wrong value shape for the table dim', () => {
  const issues = rcMarksValidator(pkgWith({ '2D Splines': { bad: [[0, 5]] } }), ...);  // scalar in a 2D table
  expect(issues).toHaveLength(1);
});
it('accepts well-formed marks', () => {
  const issues = rcMarksValidator(pkgWith({
    '1D Splines': { ok: [[0, 0], [1, 2]] },
    '2D Splines': { ok: [[0, [0, 0]]] },
    'Gradients': { ok: [[0, [1, 1, 1, 1]]] },
  }), ...);
  expect(issues).toHaveLength(0);
});
```

- [ ] **Step 2: Implement**

```ts
// 9. rc-marks — the engine's Catmull-Rom evaluation assumes strictly ascending knots and
// fixed-dim values; the schemas document it but ajv can't express the ordering.
const RC_MARK_TABLES: { table: string; ns: Namespace; dim: number }[] = [
  { table: '1D Splines', ns: 'rc:splines1d', dim: 1 },
  { table: '2D Splines', ns: 'rc:splines2d', dim: 2 },
  { table: 'Gradients', ns: 'rc:gradients', dim: 4 },
];
export const rcMarksValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const doc = pkg.files.responseCurves;
  if (doc.loadError || doc.missing || !doc.root) return out;
  for (const { table, ns, dim } of RC_MARK_TABLES) {
    const tbl = doc.root[table];
    if (!tbl || typeof tbl !== 'object') continue;
    for (const name of Object.keys(tbl)) {
      const marks = tbl[name];
      if (!Array.isArray(marks)) continue; // shape itself is ajv's job
      const issue = (message: string) => out.push({
        severity: 'error', category: 'rc-marks', message,
        file: 'responseCurves', jsonPath: [table, name],
        nav: { surface: 'responseCurves', entry: { ns, name } },
      });
      const badShape = marks.some((m: any) =>
        !Array.isArray(m) || typeof m[0] !== 'number'
        || (dim === 1 ? typeof m[1] !== 'number'
            : !Array.isArray(m[1]) || m[1].length !== dim || m[1].some((v: any) => typeof v !== 'number')));
      if (badShape) { issue(`${NS_LABEL[ns]} "${name}" has a malformed mark — expected [t, ${dim === 1 ? 'value' : `[${dim} numbers]`}].`); continue; }
      for (let i = 1; i < marks.length; ++i) {
        if (!(marks[i][0] > marks[i - 1][0])) {
          issue(`${NS_LABEL[ns]} "${name}" mark times are not strictly ascending (t[${i}]=${marks[i][0]} after t[${i - 1}]=${marks[i - 1][0]}) — spline evaluation misbehaves.`);
          break;
        }
      }
    }
  }
  return out;
};
```

Add to `REGISTRY`.

- [ ] **Step 3:** `npx vitest run` → PASS → commit `feat(validate): rc spline/gradient mark shape + strict-ascending checks`

### Task 15: `timeFactor` warning (brief §3.4) and the contradicting form label

Brief: "only `timeFactor: 0` is reliable (a known shader int/float bug); warn on nonzero." The form label currently *recommends* 1.

**Files:** Modify: `src/package/validate.ts`, `src/ui/bg/texCoordForm.ts:13` · Test: extend `tests/validate.rcMarks.test.ts` or a small new file

- [ ] **Step 1: Validator**

```ts
// 10. texcoord-timefactor — only timeFactor 0 is reliable (known engine shader int/float
// bug, brief §3.4); warn when an explicit nonzero value is authored.
export const texCoordTimeFactorValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const tcs = pkg.files.backgrounds.root?.TexCoords;
  if (!tcs || typeof tcs !== 'object') return out;
  for (const name of Object.keys(tcs)) {
    const tf = tcs[name]?.timeFactor;
    if (typeof tf === 'number' && tf !== 0) {
      out.push({
        severity: 'warning', category: 'texcoord-timefactor',
        message: `TexCoord "${name}" has timeFactor=${tf} — only 0 is reliable (known engine shader int/float bug).`,
        file: 'backgrounds', jsonPath: ['TexCoords', name, 'timeFactor'],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:texcoords', name } },
      });
    }
  }
  return out;
};
```

Add to `REGISTRY`. Before finalizing, check `src/bg/texcoord.ts` for the port's default when `timeFactor` is absent: if the default is nonzero, ALSO warn on absent (and say "defaults to N") — adjust the condition accordingly and note the decision in the commit message.

- [ ] **Step 2: Label** — `src/ui/bg/texCoordForm.ts:13`:

```ts
  ['timeFactor', 'timeFactor (only 0 is reliable — known engine bug)', false, '0'],
```

(keep the placeholder consistent with the actual engine default found in step 1.)

- [ ] **Step 3: Test** — explicit nonzero warns; 0/absent per the default decision. `npx vitest run` → PASS → commit `feat(validate): warn on nonzero TexCoord timeFactor; fix misleading form label`

---

## Phase C — shortcomings

### Task 16: audio preview (wav / flac / ogg-vorbis — all natively decodable in Chromium & Firefox)

**Files:**
- Modify: `server.js` (MIME for media on `/api/file`)
- Create: `src/ui/audio.ts`
- Modify: `src/ui/rc/soundForm.ts` (▶ next to file select), `src/ui/surfaces/assets.ts` (▶ on sound cards + inspector)

- [ ] **Step 1: Server MIME** — extend the `MIME` map and use it on the file API:

```js
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.map': 'application/json',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
};
```

and in the `/api/file` GET branch:

```js
        const data = await fsp.readFile(abs);
        res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' });
        return res.end(data);
```

Check `tests/server.test.ts` — if it asserts the octet-stream content type for file reads, update the expectation for media extensions.

- [ ] **Step 2: Player helper** (`src/ui/audio.ts`):

```ts
// One-at-a-time asset audio player. Tone/volume mirror the engine's per-play
// randomization within the authored range (gui_themepackage.cpp sound trigger):
// pitch = 2^random(tone), volume = random(volume). Browser playbackRate shifts
// speed+pitch together (preservesPitch=false) — close enough for preview.
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
let current: HTMLAudioElement | null = null;

export interface SoundRanges { tone?: [number, number]; volume?: [number, number] }

export function playAsset(path: string, ranges: SoundRanges = {}): void {
  stopAudio();
  const a = new Audio(`/api/file?path=${encodeURIComponent(path)}`);
  if (Array.isArray(ranges.tone)) {
    (a as any).preservesPitch = false;
    a.playbackRate = Math.min(4, Math.max(0.25, Math.pow(2, rand(ranges.tone[0], ranges.tone[1]))));
  }
  if (Array.isArray(ranges.volume)) a.volume = Math.max(0, Math.min(1, rand(ranges.volume[0], ranges.volume[1])));
  a.addEventListener('ended', () => { if (current === a) current = null; });
  a.play().catch((e) => console.warn(`audio ${path}:`, e));
  current = a;
}

export function stopAudio(): void {
  if (current) { current.pause(); current = null; }
}
```

- [ ] **Step 3: soundForm ▶** — in `mountSoundForm`, after the file select:

```ts
import { playAsset } from '../audio';
// ...
  const play = document.createElement('button'); play.className = 'rc-play'; play.textContent = '▶'; play.title = 'Play (randomized in authored ranges)';
  play.addEventListener('click', (e) => {
    e.preventDefault();
    const s = soundOf();
    if (s?.file) playAsset(s.file, { tone: Array.isArray(s.tone) ? s.tone : undefined, volume: Array.isArray(s.volume) ? s.volume : undefined });
  });
  fileRow.appendChild(play);
```

- [ ] **Step 4: assets surface ▶** — in `renderMain`'s card loop, for `a.kind === 'sound' && a.status !== 'rejected-format'`:

```ts
      if (a.kind === 'sound' && a.status !== 'rejected-format') {
        const play = document.createElement('button'); play.className = 'as-play'; play.textContent = '▶';
        play.addEventListener('click', (ev) => { ev.stopPropagation(); playAsset(a.path); });
        card.appendChild(play);
      }
```

and the same button in `renderInspector` next to the status line. Add minimal CSS for `.as-play` next to the existing `.as-*` rules.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`; manual: run the server against the real Gui root, play a wav, an ogg, and a flac from the Assets tab; play from a Sound Effect with a tone range and confirm pitch varies between plays; starting a second sound stops the first.
- [ ] **Step 6: Commit** — `feat(audio): play sounds from Assets and Sound Effect forms (wav/flac/ogg, range-randomized)`

### Task 17: RC go-to-definition ↗ everywhere + dead `gradient` trigger kind

**Files:** Modify: `src/ui/rc/curveForm.ts`, `src/ui/rc/eventForm.ts`, `src/ui/rc/surface.ts:119-135`

- [ ] **Step 1: curveForm** — in the slot-row builder (next to the existing ▶):

```ts
      const go = document.createElement('button'); go.className = 'ro-go'; go.textContent = '↗'; go.title = 'go to event';
      go.addEventListener('click', (e) => {
        e.preventDefault();
        const v = curveOf()?.[slot];
        if (v) deps!.ctx().navigate({ surface: 'responseCurves', entry: { ns: 'rc:events', name: v } });
      });
      row.append(name, sel, play, go);
```

- [ ] **Step 2: eventForm** — per channel row; `CHANNELS[key].ns` already holds the namespace:

```ts
    const go = document.createElement('button'); go.className = 'ro-go'; go.textContent = '↗'; go.title = 'go to definition';
    go.addEventListener('click', (e) => {
      e.preventDefault();
      const ref = eventOf()?.[key];
      if (ref) deps!.ctx().navigate({ surface: 'responseCurves', entry: { ns: CHANNELS[key].ns, name: ref } });
    });
    row.append(name, sel, go);
```

- [ ] **Step 3: lightForm "+ new" parity (small)** — `src/ui/bg/lightForm.ts`: next to the gradient ↗, add a `+ new…` button cloning the backdropForm `tcNew` pattern (prompt name → `(_deps!.file.root.Gradients ??= {})[name] = [[0, [1, 1, 1, 1]]]` if absent → `entry.gradient = name` → `commit()`).

- [ ] **Step 4: gradient trigger** — `src/ui/rc/surface.ts`, `mountEditor` gradients branch:

```ts
    else if (tab === 'gradients') {
      const sel = rcState.selected.gradients;
      if (sel) setTrigger({ kind: 'gradient', name: sel });
      mountRcGradientForm(editorHost, formDeps());
    }
```

(selection is part of `rcStructuralKey`, so mountEditor re-runs per selection — same mechanism the spline tabs use.)

- [ ] **Step 5: Verify** — `npx playwright test` green; manual: Curves tab slot ↗ lands on the Event entry; Events channel ↗ lands on the right spline/gradient/sound; selecting an RC Gradient tints the preview widget.
- [ ] **Step 6: Commit** — `feat(rc): go-to-definition on curve slots and event channels; gradients preview on select`

### Task 18: replace free-text `prompt()` adds with dropdown pickers (bg slots, RC curve keys)

Brief: enum-keyed tables are "picked from a dropdown, never free text". Borders already complies; bg backdrops/lights and RC curves don't. Named tables (texcoords/gradients/events/splines/sounds) legitimately keep free-text prompt.

**Files:**
- Create: `src/ui/pickerDialog.ts`
- Modify: `src/ui/bg/surface.ts:30-50`, `src/ui/rc/surface.ts:35-50`
- Modify: `e2e/editor.spec.ts` (the backdrop-add test currently answers a `prompt()` dialog)

- [ ] **Step 1: Dialog helper** (`src/ui/pickerDialog.ts`):

```ts
// Modal <dialog> with one or more labelled <select>s. Resolves to the chosen values, or null on cancel.
export function pickFrom(title: string, fields: { label: string; options: string[] }[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'picker-dialog';
    const h = document.createElement('div'); h.className = 'picker-title'; h.textContent = title; dlg.appendChild(h);
    const sels: HTMLSelectElement[] = [];
    for (const f of fields) {
      const row = document.createElement('label'); row.textContent = `${f.label} `;
      const sel = document.createElement('select');
      for (const o of f.options) { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; sel.appendChild(opt); }
      row.appendChild(sel); sels.push(sel); dlg.appendChild(row);
    }
    const bar = document.createElement('div'); bar.className = 'picker-buttons';
    const ok = document.createElement('button'); ok.textContent = 'Add'; ok.value = 'ok';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.value = 'cancel';
    bar.append(ok, cancel); dlg.appendChild(bar);
    ok.addEventListener('click', (e) => { e.preventDefault(); dlg.close('ok'); });
    cancel.addEventListener('click', (e) => { e.preventDefault(); dlg.close('cancel'); });
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue === 'ok' ? sels.map((s) => s.value) : null;
      dlg.remove(); resolve(v);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}
```

Add CSS for `.picker-dialog` (dark theme to match; `dialog::backdrop { background: rgba(0,0,0,.5) }`).

- [ ] **Step 2: bg surface** — `addEntry` backdrops/lights branch becomes:

```ts
    if (tab === 'backdrops' || tab === 'lights') {
      const unused = tab === 'backdrops' ? unusedDetailNames(Object.keys(table)) : unusedLightNames(Object.keys(table));
      if (!unused.length) { alert('All slots are in use.'); return; }
      void pickFrom(`Add ${tab === 'backdrops' ? 'backdrop' : 'light'} slot`, [{ label: 'Slot', options: unused }]).then((picked) => {
        if (!picked) return;
        const name = picked[0];
        table[name] = tab === 'lights' ? { gradient: '' } : {};
        selectEntry(tab, name);
        markDirty();
      });
      return;
    }
```

(move the trailing `markDirty()` into each branch since the dropdown path is now async; the named-table branch keeps its synchronous prompt + `markDirty()`.)

- [ ] **Step 3: rc surface** — curves branch:

```ts
    if (tab === 'curves') {
      void pickFrom('Add response curve', [
        { label: 'Archetype', options: ARCHETYPES },
        { label: 'Index', options: ['0', '1', '2', '3'] },
      ]).then((picked) => {
        if (!picked) return;
        const key = `${picked[0]}_${picked[1]}`;
        if (Object.hasOwn(table, key)) { alert('Already exists.'); return; }
        table[key] = {}; selectRcEntry('curves', key);
        markDirty();
      });
      return;
    }
```

(The raw `_N`/`N` escape hatch disappears from the UI; raw keys remain schema-legal and load fine. Note this in the commit message.)

- [ ] **Step 4: e2e** — update `e2e/editor.spec.ts`'s backdrop-add test: instead of `page.on('dialog')`, after clicking Add, interact with the `<dialog>`: `await page.locator('.picker-dialog select').first().selectOption(...)`; click the `Add` button. Likewise for any RC-curve-add e2e step. (Reminder: `dialog.accept()` returning `''` was a known prompt() pain — this removes it.)
- [ ] **Step 5:** `npx playwright test` → green → commit `feat(ui): enum slots and curve keys are added via dropdown dialog, not free-text prompt`

### Task 19: reserve pack-canvas edge gutter (TECHNICAL-DEBT "Task 13/14 consumer" item)

Sprites flush against the right/bottom canvas edge get zero trailing margin → bilinear/mip bleed after the engine repacks sheets into megatextures. TD prescribes packing into `(canvasW - gutter) × (canvasH - gutter)`.

**Files:** Modify: `src/legality.ts:43-56` · Test: `tests/legality.test.ts` and/or `tests/packer.test.ts`

- [ ] **Step 1: Failing test** (`tests/legality.test.ts`):

```ts
it('findCanvas keeps the trailing canvas edge clear by one gutter', () => {
  const pieces = [{ id: 0, w: 250, h: 250 }];
  const r = findCanvas(pieces, { gutter: 8, align: 4 })!;
  for (const p of r.placed) {
    expect(p.x + p.w).toBeLessThanOrEqual(r.w - 8);
    expect(p.y + p.h).toBeLessThanOrEqual(r.h - 8);
  }
});
it('a piece exactly the size of a legal canvas spills to the next size', () => {
  const r = findCanvas([{ id: 0, w: 256, h: 256 }], { gutter: 8, align: 4 })!;
  expect(r.w * r.h).toBeGreaterThan(256 * 256);
});
```

(Match the actual `Piece` shape from `src/maxrects.ts` — check whether placed pieces carry `w/h`; if `Placed` is `{id,x,y}` only, assert via the input pieces array instead.)

- [ ] **Step 2: Implement** — `findCanvas`:

```ts
export function findCanvas(
  pieces: Piece[],
  opts: { gutter: number; align: number },
  maxDim = 4096,
): { w: number; h: number; placed: Placed[] } | null {
  const minArea = pieces.reduce((s, p) => s + (p.w + opts.gutter) * (p.h + opts.gutter), 0);
  const minSide = Math.max(...pieces.map((p) => Math.max(p.w, p.h)), 1);
  for (const [w, h] of candidateSheets(maxDim)) {
    // Pack into the canvas minus one trailing gutter: the packer pads only trailing
    // edges, so without this, right/bottom-edge sprites have no outer margin and
    // bleed under bilinear/mip sampling after the engine's megatexture repack
    // (TECHNICAL-DEBT: MaxRects packer note).
    const pw = w - opts.gutter, ph = h - opts.gutter;
    if (pw <= 0 || ph <= 0 || w * h < minArea || (pw < minSide && ph < minSide)) continue;
    const placed = packRects(pieces, pw, ph, opts);
    if (placed) return { w, h, placed };
  }
  return null;
}
```

- [ ] **Step 3:** `npx vitest run` — packer/maxrects/editorReadback suites must stay green; if any packer test asserted an exact canvas size that now grows, update it to assert the *invariant* (legal sheet + all placements inside `w-gutter`/`h-gutter`) rather than a magic size.
- [ ] **Step 4: Commit** — `fix(pack): reserve trailing-edge gutter on the canvas (closes the TD Task-13/14 consumer item)`

### Task 20: unify borders serialization; delete dead code

`exportPanel` saves via `serializeDocument` (hard tabs); toolbar Save uses `serializeFile` (detected indent) — same file, two formats. Also remove confirmed-dead `parseDocument`.

**Files:** Modify: `src/ui/state.ts`, `src/ui/surfaces/borders.ts` (wherever `state.doc` is assigned), `src/ui/exportPanel.ts:3,98`, `src/document.ts:18-24`

- [ ] **Step 1: Thread the FileDoc** — add to the borders UI state (`src/ui/state.ts`):

```ts
import type { FileDoc } from '../package/model';
// in the state object:
file: null as FileDoc | null,   // borders FileDoc — single source of truth for indent/dirty
```

Set `state.file = bordersFile;` at the same place `state.doc` is set (find it: `grep -n 'state.doc =' src/ui`).

- [ ] **Step 2: exportPanel** — replace the save line:

```ts
import { serializeFile } from '../package/model';
// ...
      await writeFileBytes('borders.json', serializeFile(state.file!));
      state.file!.dirty = false;
      state.dirty = false;
```

and drop the `serializeDocument` import. Guard at the top of the click handler: `if (!state.file) throw new Error('borders file not loaded');`

- [ ] **Step 3: Dead code** — in `src/document.ts` delete `parseDocument` and `serializeDocument` (verify zero remaining imports: `grep -rn 'serializeDocument\|parseDocument' src tests`). If a test imports them purely to test them, delete those test cases too.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit && npx playwright test` → green. Manual: open a space-indented borders.json, pack-export, confirm the file keeps spaces.
- [ ] **Step 5: Commit** — `refactor(borders): single serialization path (detected indent); drop dead parse/serializeDocument`

### Task 21: stop bg preview rendering while hidden

The bg surface defaults `playing: true` and its rAF loop keeps drawing behind `display:none`. (RC preview only plays on user action — leave it.)

**Files:** Modify: `src/ui/bg/previewPanel.ts` (`frame`, `updateBgPreview`)

- [ ] **Step 1:**

```ts
function frame(): void {
  raf = 0;
  if (!renderer || !canvas || !_deps) return;
  // Hidden surface (display:none host) — skip work; updateBgPreview restarts on next show.
  if (_host && _host.offsetParent === null) return;
  /* ...existing body... */
  if (bgState.playing) raf = requestAnimationFrame(frame);
}
```

(every other `raf = requestAnimationFrame(frame)` call site stays; they're idempotent with the `raf = 0` reset.)

In `updateBgPreview`, at the end:

```ts
  if (bgState.playing && !raf) raf = requestAnimationFrame(frame);
  else if (!bgState.playing) frame(); // existing static-refresh line, keep
```

(The shell calls `refresh()` → `bgNotify()` → `updateBgPreview()` when the surface is re-shown, which restarts the loop.)

- [ ] **Step 2: Verify** — manual: open Backgrounds (animation runs), switch to Borders, check in devtools Performance that no per-frame work continues; switch back → animation resumes. `npx playwright test` (the "bg preview persists across tabs" e2e must stay green).
- [ ] **Step 3: Commit** — `perf(bg-preview): suspend the rAF loop while the surface is hidden`

### Task 22: TECHNICAL-DEBT.md reconciliation

**Files:** Modify: `TECHNICAL-DEBT.md`

- [ ] **Step 1:** Mark as CLOSED (with commit refs from this plan + the pre-existing closures the review found):
  - Edge-gutter "Task 13/14 consumer" item → closed by Task 19.
  - "getEditorMeta is write-only / re-edit not wired" → already closed by `editorReadback.ts` + `selectBorder` source path (pre-existing; note the closure).
  - `isValidBorderName` orphan → already consumed by `slotList.ts:128` (pre-existing).
- [ ] **Step 2:** Add new known-debt entries so the file stays honest:
  - `server.js atomicWrite` fixed `.tmp` name races concurrent PUTs to the same path (acceptable, single-user dev tool).
  - `BordersDoc`/`FileDoc` dual-model dirty-sync in `surfaces/borders.ts` remains the most fragile coupling (partially mitigated by Task 20's single FileDoc reference).
  - Border-name enum is encoded in three places (`borderNames.ts` PATTERNS, `allBorderNames()`, schema) — drift hazard, no checker.
  - RGB5551 quantization not simulated in the coding-themes sample.
- [ ] **Step 3:** Commit — `docs: reconcile TECHNICAL-DEBT with current code and this plan's fixes`

---

## Self-review checklist (done at planning time)

- Review coverage: every Phase-A/B bug from the 2026-06-12 review maps to Tasks 1–15; shortcomings → 16–21 (audio, RC nav, dropdown adds, gutter, serialization, idle rAF). Explicitly dropped per user: Build/`.lf_gui` button. Deliberately deferred (not in this plan): asset thumbnails/waveforms/search/import, inline per-field validation boxes beyond the `(missing)` sentinel, spec-annotation overlays, archetype-aware RC preview widget, GL pixel-assert tests.
- Types: `HttpError` (T2) matches the structural `status` check; `AssetList.wrongFormat` (T13) added everywhere the type is constructed; `fillOptions` (T9) used by both bg and rc forms; `state.file` (T20) is `FileDoc | null`.
- Ordering: T1–T5 are independent; T6 must precede T21 (shares `rebuildGradients`); T9 touches files T17 also touches (curve/eventForm) — do T9 before T17 or rebase carefully; T20 depends on nothing but should follow T1 (same file).
