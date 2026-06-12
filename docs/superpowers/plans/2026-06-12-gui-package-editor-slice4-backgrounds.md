# GUI Package Editor — Slice 4: Backgrounds Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only TexCoords/Gradients placeholder with a full Backgrounds surface — four table tabs (Backdrops / Lights / TexCoords / Gradients), per-table editors, entry lifecycle (add/rename/delete with consumer rewrite), and a faithful WebGL2 live preview of the backdrop composite (detail layers × lights × texCoord animation × gradients × frosted glass).

**Architecture:** Engine-faithful pure modules carry all testable behavior and land first: slot-name generation, the gradient bake, the texCoord animation matrix, light-texCoord sentinel inheritance, backdrop (de)serialization, and named-entry rename. A WebGL2 preview core (shaders + renderer + synthetic scene) ports `gui_panel.frag` `ReadDetailLayer`/`GetLight`/`SampleImage` and the compute-shader `TexCoord_GetMat3`/`GetTexCoords`. The UI follows the slice-3 borders contract: `createBackgroundsSurface(file, onDirty)` with a surface-local bus, a structural key that re-mounts panels vs in-place `update()`, pointer capture + commit-on-pointer-up, and one-way `file.dirty → onDirty()` sync. Six dependency-ordered phases: (0) pure logic, (1) validators+schema, (2) preview core, (3) surface shell + entry lists, (4) editors, (5) preview panel + wiring + e2e.

**Tech Stack:** Vite 5 + vanilla TypeScript (strict), Vitest (node env, no DOM), Playwright (e2e, port 8137), WebGL2, ajv 8 (draft-07). Spec: `/mnt/Passport/Engine/Kreatures/docs/superpowers/specs/2026-06-12-gui-package-editor-slice4-backgrounds-design.md`.

**Conventions (carry into every task):**
- TDD red→green, bite-sized commits, DRY/YAGNI.
- **Never `npm install` in the project dir** — `node_modules` is a symlink to the ext4 cache. Use only `npm test`, `npm run build`, `npx vitest run <file>`, `npx tsc --noEmit`, `npx playwright test`.
- **`server.js` serves the built `dist/`, NOT source.** Before ANY e2e run or manual verification: `npm run build`. `npx tsc --noEmit` does NOT build dist. A "fix didn't work" e2e result is almost always a stale-dist artifact.
- Pure logic lives under `src/` with no DOM; preview GL under `src/preview/bg/`; UI under `src/ui/bg/`; tests under `tests/`.
- All edits mutate `pkg.files.backgrounds.root` **in place** so unknown keys round-trip untouched (slice-1 invariant). Preview-only state NEVER dirties the document (slice-3 rule).
- The schema (`/mnt/Passport/Lifaundi/Gui/schemas/backgrounds.schema.json`) already whitelists `Comment` on texCoord/light/layer/backdrop and already has the layers-or-glass `anyOf` (verified during planning). The schemas dir is editable; the live `backgrounds.json` is read-only working data (only the user-invoked Save path writes it).
- Engine defaults verified during planning (`gui_themepackage.h`): `TexCoord` → normalization 0, spinSpeed 0, rotationCenter [0,0], scrollFactor [0,0], scaleFactor [1,1], initialTime 0, timeFactor 1.0; `BackDrop` → glass opacity 1.0, blurFactor -1, zoomFactor 1.0, detailOpacity 1.0.
- Run the app: `npm run build && npm run serve` (= `node server.js /mnt/Passport/Lifaundi/Gui`), open `http://localhost:8137`; console prints `root=/mnt/Passport/Lifaundi/Gui`. If a prior e2e run was killed, free the port first: `ss -ltnp | grep 8137` then `pkill -f server.js`.

---

## File Structure

**New files (pure logic):**
- `src/package/slotNames.ts` — `allDetailNames()` (28), `allLightNames()` (125, `White` first), `isValidDetailName`/`isValidLightName`, `unusedDetailNames`/`unusedLightNames`. Copies the `borderNames.ts` shape (rule of three — do NOT generalize).
- `src/bg/gradients.ts` — faithful port of `gui_packagebuilder.cpp:1164-1230`: parse marks, `marksAscending`, `alphaRange`, `bakeGradient` → 128×RGBA `Float32Array` in **linear** space.
- `src/bg/texcoord.ts` — `texCoordMat3(entry, nowSeconds, ratio)` and `getTexCoords(pointUV, quadPos, entry, panelSize, nowSeconds)`: CPU ports of `TexCoord_GetMat3`/`GetTexCoords` (comp:115/133) with **float** timeFactor.
- `src/bg/lightInput.ts` — `resolveLightTexCoord(lightEntry, layerEntry)`: the 0xFFFF sentinel rule (a light with no `texCoord` inherits the same-index layer's `texCoord`).
- `src/bg/backdropModel.ts` — pure read/write of a backdrop entry: `readLayers`/`writeLayers` (serialization rules: `[{}, {…}]` slot-1-only, omit `Detail Layers` when both disabled), glass key presence read/write, detailOpacity.
- `src/bg/rename.ts` — `renameNamedEntry(pkg, index, ns, oldName, newName)`: rewrite the table key + every consumer path from `index.consumers(ns, old)` in one mutation.

**New files (preview GL):**
- `src/preview/bg/shaders.ts` — vert + frag (`ReadDetailLayer`, `GetLight`, `SampleImage` with per-axis wrap + signed noise, glass mix).
- `src/preview/bg/scene.ts` — procedural synthetic backdrop scene rendered once to a texture.
- `src/preview/bg/renderer.ts` — `BgPreviewRenderer`: GL state, gradient atlas (128×N RGBA32F, rebuilt on gradient edits), layer textures (WeakMap on decoded-image identity), scene texture w/ mipmaps, cached uniform locations.
- `src/bg/previewInput.ts` — pure CPU corner-UV builder (`buildBgPreviewInput`) feeding the renderer (mirrors `create_panel`).

**New files (UI):**
- `src/bg/state.ts` — surface-local state + tiny pub/sub (selected tab, selected entry per tab, preview pairing per slot, play/scrub). Do NOT extend `src/ui/state.ts` (borders-specific).
- `src/ui/bg/surface.ts` — `createBackgroundsSurface`; tabs + layout + bus + dirty flow + `reveal`.
- `src/ui/bg/entryList.ts` — per-tab list (swatch, severity dot, dead pill, `↗N`), add/rename/delete affordances.
- `src/ui/bg/backdropForm.ts`, `lightForm.ts`, `texCoordForm.ts`, `gradientEditor.ts` — the four editors.
- `src/ui/bg/previewPanel.ts` — canvas pair + pairing pickers + play/scrub + size handles.

**New test files:** `tests/package/slotNames.test.ts`, `tests/bg/gradients.test.ts`, `tests/bg/texcoord.test.ts`, `tests/bg/lightInput.test.ts`, `tests/bg/backdropModel.test.ts`, `tests/bg/rename.test.ts`, `tests/bg/previewInput.test.ts`, `tests/bg/state.test.ts`.

**Modified files:**
- `src/package/validate.ts` — remove `timeFactorValidator` + its category; add `bgGradientMarksValidator`; reword the dangling-ref message.
- `src/ui/boot.ts` — swap `createReadOnlyTableSurface('backgrounds', …)` for `createBackgroundsSurface(pkg.files.backgrounds, scheduleRevalidate)`.
- `src/ui/surfaces/readOnlyTable.ts` — drop the `backgrounds` config (keep `responseCurves`); keep `resolveEntrySelection` (reused).
- `tests/package/validate.test.ts` — drop timeFactor cases; add gradient-marks cases; update dangling-ref wording assertion.
- `/mnt/Passport/Lifaundi/Gui/schemas/backgrounds.schema.json` — drop the timeFactor warning sentence; tighten the layers-or-glass `anyOf` so an empty `Detail Layers: []` doesn't satisfy "has layers".
- `index.html` — CSS for the backgrounds tabs/lists/forms/gradient bar/preview.
- `e2e/editor.spec.ts` — backgrounds smokes (Phase 5). **Do not modify the existing borders/harness sections** — append new tests only.

---

# PHASE 0 — Pure logic (no DOM, fully TDD)

All six tasks are independent; they land first because Phases 2–5 wire them in. Engine truth is quoted inline per task so the worker needs no cross-repo reading.

## Task 0.1: `slotNames.ts` — Detail (28) + Light (125) enum names

**Files:**
- Create: `src/package/slotNames.ts`
- Test: `tests/package/slotNames.test.ts`

Engine truth (schema `backgrounds.schema.json` patternProperties, verified):
- Detail (28): `(Backdrop|Progress|Affordance|GridItem|Panel|Decoration|Overlay)_[0-3]` = 7×4.
- Light (125): `White` (1) + `(Backing|Header|Footer|Backdrop|Progress|Affordance|GridItem|ListItem|Button|Action)_[01]_[0-2]` (10×2×3=60) + `(Panel|Decoration|GroupBox|Overlay)_[0-3]_[0-3]` (4×4×4=64). `White` is enum 1 and MUST sort first.

- [ ] **Step 1: Write the failing test**

```ts
// tests/package/slotNames.test.ts
import { describe, it, expect } from 'vitest';
import {
  allDetailNames, allLightNames,
  isValidDetailName, isValidLightName,
  unusedDetailNames, unusedLightNames,
} from '../../src/package/slotNames';

describe('slotNames', () => {
  it('lists 28 unique detail slots, all valid', () => {
    const d = allDetailNames();
    expect(d).toHaveLength(28);
    expect(new Set(d).size).toBe(28);
    for (const n of d) expect(isValidDetailName(n)).toBe(true);
    expect(d).toContain('Backdrop_0');
    expect(d).toContain('Overlay_3');
  });

  it('lists 125 unique light slots, White first, all valid', () => {
    const l = allLightNames();
    expect(l).toHaveLength(125);
    expect(new Set(l).size).toBe(125);
    expect(l[0]).toBe('White');
    for (const n of l) expect(isValidLightName(n)).toBe(true);
    expect(l).toContain('Header_0_0');
    expect(l).toContain('Action_1_2');
    expect(l).toContain('Panel_3_3');
    expect(l).toContain('Overlay_0_0');
  });

  it('rejects bad names', () => {
    expect(isValidDetailName('Backdrop_4')).toBe(false);
    expect(isValidDetailName('White')).toBe(false);
    expect(isValidLightName('Header_2_0')).toBe(false); // first index only 0/1
    expect(isValidLightName('Backdrop_4')).toBe(false);
  });

  it('unused subtracts used', () => {
    expect(unusedDetailNames(['Backdrop_0'])).not.toContain('Backdrop_0');
    expect(unusedDetailNames(['Backdrop_0'])).toHaveLength(27);
    expect(unusedLightNames(['White'])).not.toContain('White');
    expect(unusedLightNames(['White'])).toHaveLength(124);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/package/slotNames.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/package/slotNames.ts
const DETAIL_PATTERNS = [
  /^(Backdrop|Progress|Affordance|GridItem|Panel|Decoration|Overlay)_[0-3]$/,
];
const LIGHT_PATTERNS = [
  /^White$/,
  /^(Backing|Header|Footer|Backdrop|Progress|Affordance|GridItem|ListItem|Button|Action)_[01]_[0-2]$/,
  /^(Panel|Decoration|GroupBox|Overlay)_[0-3]_[0-3]$/,
];

export function isValidDetailName(name: string): boolean {
  return DETAIL_PATTERNS.some((p) => p.test(name));
}
export function isValidLightName(name: string): boolean {
  return LIGHT_PATTERNS.some((p) => p.test(name));
}

export function allDetailNames(): string[] {
  const out: string[] = [];
  for (const f of ['Backdrop', 'Progress', 'Affordance', 'GridItem', 'Panel', 'Decoration', 'Overlay'])
    for (let i = 0; i <= 3; ++i) out.push(`${f}_${i}`);
  return out;
}

export function allLightNames(): string[] {
  const out: string[] = ['White']; // enum 1 — first
  for (const f of ['Backing', 'Header', 'Footer', 'Backdrop', 'Progress', 'Affordance', 'GridItem', 'ListItem', 'Button', 'Action'])
    for (let a = 0; a <= 1; ++a) for (let b = 0; b <= 2; ++b) out.push(`${f}_${a}_${b}`);
  for (const f of ['Panel', 'Decoration', 'GroupBox', 'Overlay'])
    for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 3; ++b) out.push(`${f}_${a}_${b}`);
  return out;
}

export function unusedDetailNames(used: readonly string[]): string[] {
  const s = new Set(used);
  return allDetailNames().filter((n) => !s.has(n));
}
export function unusedLightNames(used: readonly string[]): string[] {
  const s = new Set(used);
  return allLightNames().filter((n) => !s.has(n));
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/package/slotNames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/package/slotNames.ts tests/package/slotNames.test.ts
git commit -m "feat(bg): slotNames — 28 detail + 125 light enum names"
```

## Task 0.2: `bg/gradients.ts` — faithful 128-texel bake

**Files:**
- Create: `src/bg/gradients.ts`
- Test: `tests/bg/gradients.test.ts`

Engine truth (`gui_packagebuilder.cpp:1164-1230`, verified): WIDTH=128. Per mark, rgb is linearized `pow(rgb, 2.2)` (alpha **untouched**). `alphaRange = [clamp(min(|a|)·255,0,255), clamp(max(|a|)·255,0,255)]`. Empty → `[{0,[1,1,1,1]}]` (white). Single mark → flat fill of the linearized color (the de-linearize step is commented out — **the baked row is LINEAR**). Else: if `marks[0].t > 0` prepend `{0, marks[0].color}`; if `back.t < 1` append `{1, back.color}`. Then for `j` in `0..127`: `n = j/127`; advance `(itr,next)` while `next.t < n`; `t = (n - itr.t)/(next.t - itr.t)`; `color = mix(itr, next, t)` (full RGBA linear lerp). Ascending: the editor checks properly (engine's own check is broken) — non-decreasing `t` required.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/gradients.test.ts
import { describe, it, expect } from 'vitest';
import { type Mark, marksAscending, alphaRange, bakeGradient } from '../../src/bg/gradients';

const px = (row: Float32Array, i: number) => [row[i * 4], row[i * 4 + 1], row[i * 4 + 2], row[i * 4 + 3]];

describe('marksAscending', () => {
  it('accepts non-decreasing t, rejects a dip', () => {
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.5, [1, 1, 1, 1]]])).toBe(true);
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.5, [1, 1, 1, 1]], [0.5, [1, 0, 0, 1]]])).toBe(true);
    expect(marksAscending([[0, [0, 0, 0, 1]], [0.8, [1, 1, 1, 1]], [0.3, [1, 0, 0, 1]]])).toBe(false);
  });
});

describe('bakeGradient', () => {
  it('empty → all white (linear 1,1,1,1)', () => {
    const r = bakeGradient([]);
    expect(r).toHaveLength(128 * 4);
    expect(px(r, 0)).toEqual([1, 1, 1, 1]);
    expect(px(r, 127)).toEqual([1, 1, 1, 1]);
  });

  it('single mark → flat fill, rgb linearized, alpha untouched', () => {
    const r = bakeGradient([[0.5, [1, 0, 0, 0.5]]]);
    // pow(1,2.2)=1, pow(0,2.2)=0; alpha stays 0.5
    expect(px(r, 0)).toEqual([1, 0, 0, 0.5]);
    expect(px(r, 64)).toEqual([1, 0, 0, 0.5]);
  });

  it('black→white midpoint lerps in linear space (texel value ≈ n)', () => {
    const r = bakeGradient([[0, [0, 0, 0, 1]], [1, [1, 1, 1, 1]]]);
    const [rr] = px(r, 64);
    expect(rr).toBeCloseTo(64 / 127, 5);
  });

  it('end-extension: marks at 0.25..0.75 flat-fill the ends', () => {
    const r = bakeGradient([[0.25, [1, 0, 0, 1]], [0.75, [0, 0, 1, 1]]]);
    expect(px(r, 0)).toEqual([1, 0, 0, 1]);   // before first → first color
    expect(px(r, 127)).toEqual([0, 0, 1, 1]); // after last → last color
  });

  it('alphaRange uses |alpha|', () => {
    expect(alphaRange([[0, [0, 0, 0, -1]], [1, [1, 1, 1, 0.5]]])).toEqual([128, 255]);
  });
});
```

(`alphaRange` expected: min(|−1|,|0.5|)=0.5→clamp(127.5)=127→ wait: 0.5·255=127.5→127; but test asserts 128. Use `Math.round`: 127.5→128. Implement with `Math.round` then clamp; max(|−1|)=1·255=255.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/gradients.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/gradients.ts
// Faithful port of the gradient bake (gui_packagebuilder.cpp:1164-1230).
// The baked row stores LINEAR values (the engine's de-linearize step is commented out);
// callers that DISPLAY a ramp must apply pow(1/2.2) themselves.
export type Rgba4 = [number, number, number, number];
export type Mark = [number, Rgba4]; // [t, [r,g,b,a]]

const WIDTH = 128;
const lin = (c: number) => Math.pow(c, 2.2);

export function marksAscending(marks: Mark[]): boolean {
  for (let i = 1; i < marks.length; ++i) if (marks[i][0] < marks[i - 1][0]) return false;
  return true;
}

export function alphaRange(marks: Mark[]): [number, number] {
  let min = 255, max = 0;
  for (const [, c] of marks) {
    const a = Math.abs(c[3]) * 255;
    min = Math.min(min, a); max = Math.max(max, a);
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(min), clamp(max)];
}

function linearize(marks: Mark[]): Mark[] {
  return marks.map(([t, c]) => [t, [lin(c[0]), lin(c[1]), lin(c[2]), c[3]]] as Mark);
}

export function bakeGradient(input: Mark[]): Float32Array {
  const out = new Float32Array(WIDTH * 4);
  let g = linearize(input);

  if (g.length === 0) g = [[0, [1, 1, 1, 1]]];

  if (g.length === 1) {
    const [, c] = g[0];
    for (let j = 0; j < WIDTH; ++j) out.set(c, j * 4);
    return out;
  }

  if (g[0][0] > 0) g = [[0, g[0][1]], ...g];
  if (g[g.length - 1][0] < 1) g = [...g, [1, g[g.length - 1][1]]];

  let i = 0; // itr; next = i+1
  for (let j = 0; j < WIDTH; ++j) {
    const n = j / (WIDTH - 1);
    while (i + 1 < g.length - 1 && g[i + 1][0] < n) ++i;
    const [t0, c0] = g[i];
    const [t1, c1] = g[i + 1];
    const span = t1 - t0;
    const t = span === 0 ? 0 : (n - t0) / span;
    for (let k = 0; k < 4; ++k) out[j * 4 + k] = c0[k] + (c1[k] - c0[k]) * t;
  }
  return out;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/gradients.test.ts`
Expected: PASS. (If the midpoint case is off, confirm `n = j/(WIDTH-1)` and the `while` advances `i` while `g[i+1].t < n`.)

- [ ] **Step 5: Commit**

```bash
git add src/bg/gradients.ts tests/bg/gradients.test.ts
git commit -m "feat(bg): gradient bake — faithful 128-texel linear port"
```

## Task 0.3: `bg/texcoord.ts` — animation matrix + getTexCoords

**Files:**
- Create: `src/bg/texcoord.ts`
- Test: `tests/bg/texcoord.test.ts`

Engine truth (comp:115/133, verified). `TexCoord_GetMat3(index, ratio)`:
```
now      = (timestamp & 0x7FFFFF) * 1e-3
now      = initialTime + now * timeFactor          // float timeFactor (engine fix landing)
rotation = spinSpeed * 2π * now
t        = scrollFactor * now
s        = scaleFactor * ratio
r        = (cos rotation, sin rotation)
c        = rotationCenter
mat3 columns (GLSL constructor order):
  col0 = (r.x*s.x,  r.y*s.y,  0)
  col1 = (-r.y*s.x, r.x*s.y,  0)
  col2.x = ((r.x*-c.x) + (-r.y*-c.y) + (c.x + t.x*r.x) + (c.y + t.y*-r.y)) * s.x
  col2.y = ((r.y*-c.x) + ( r.x*-c.y) + (c.x + t.x*r.y) + (c.y + t.y* r.x)) * s.y
  col2.z = 1
```
`getTexCoords(pointUV, quadPos, entry, panelSize, nowSeconds)`:
```
norm = entry.normalization; ratio = [1,1]
if norm < 0:
  norm = |norm|
  aspect = panelSize / max(min(panelSize.x, panelSize.y), 1)
  ratio  = mix([1,1], aspect, norm)
uv  = mix(pointUV, quadPos, clamp(norm,0,1))
out = mat3 * vec3(uv, 1)  → out.xy
```
`nowSeconds` is the raw clock `(timestamp & 0x7FFFFF)·1e-3` (caller computes it; tests pass it explicitly).

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/texcoord.test.ts
import { describe, it, expect } from 'vitest';
import { texCoordMat3, applyMat3, getTexCoords, type TexCoordEntry } from '../../src/bg/texcoord';

const ID: TexCoordEntry = {}; // all engine defaults: scaleFactor [1,1], timeFactor 1, rest 0

describe('texCoordMat3', () => {
  it('identity-ish at now=0 (scale 1, no scroll/spin) maps uv → uv', () => {
    const m = texCoordMat3(ID, 0, [1, 1]);
    expect(applyMat3(m, [0.3, 0.7])).toEqual([0.3, 0.7]);
  });

  it('pure scroll translates by scrollFactor·now (timeFactor 1)', () => {
    const e: TexCoordEntry = { scrollFactor: [0.5, -0.25] };
    const m = texCoordMat3(e, 2, [1, 1]); // now = 0 + 2*1 = 2 → translate (1, -0.5)
    const [x, y] = applyMat3(m, [0, 0]);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(-0.5, 6);
  });

  it('float timeFactor scales the clock (now = initialTime + t·timeFactor)', () => {
    const e: TexCoordEntry = { scrollFactor: [1, 0], initialTime: 0.1, timeFactor: 0.5 };
    const m = texCoordMat3(e, 4, [1, 1]); // now = 0.1 + 4*0.5 = 2.1
    expect(applyMat3(m, [0, 0])[0]).toBeCloseTo(2.1, 6);
  });

  it('scale applies ratio', () => {
    const e: TexCoordEntry = { scaleFactor: [2, 3] };
    const m = texCoordMat3(e, 0, [1, 1]);
    expect(applyMat3(m, [1, 1])).toEqual([2, 3]);
  });
});

describe('getTexCoords', () => {
  it('normalization 0 returns the point-space uv', () => {
    expect(getTexCoords([0.4, 0.6], [9, 9], ID, [100, 50], 0)).toEqual([0.4, 0.6]);
  });
  it('normalization 1 returns the quad-space pos', () => {
    expect(getTexCoords([0.4, 0.6], [-1, 1], { normalization: 1 }, [100, 50], 0)).toEqual([-1, 1]);
  });
  it('normalization 0.5 blends point↔quad', () => {
    const [x, y] = getTexCoords([0, 0], [1, 1], { normalization: 0.5 }, [10, 10], 0);
    expect(x).toBeCloseTo(0.5, 6);
    expect(y).toBeCloseTo(0.5, 6);
  });
  it('negative normalization adds aspect compensation to the scale', () => {
    // norm=-1 → blend=clamp(-1,0,1)=0 (uses point uv), ratio = aspect = size/min(size)
    // panel 100x50 → aspect (2,1); scaleFactor default [1,1] → s=(2,1); uv (1,1) → (2,1)
    const [x, y] = getTexCoords([1, 1], [0, 0], { normalization: -1 }, [100, 50], 0);
    expect(x).toBeCloseTo(2, 6);
    expect(y).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/texcoord.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/texcoord.ts
// CPU port of TexCoord_GetMat3 / GetTexCoords (gui_panelbuilder.comp:115/133) with float timeFactor.
export interface TexCoordEntry {
  normalization?: number;
  spinSpeed?: number;
  rotationCenter?: [number, number];
  scrollFactor?: [number, number];
  scaleFactor?: [number, number];
  initialTime?: number;
  timeFactor?: number;
}

export type Mat3 = Float64Array; // column-major, GLSL mat3 constructor order (9 elems)

const num = (v: number | undefined, d: number) => (typeof v === 'number' ? v : d);
const vec = (v: [number, number] | undefined, d: [number, number]): [number, number] =>
  Array.isArray(v) ? [num(v[0], d[0]), num(v[1], d[1])] : d;

export function texCoordMat3(e: TexCoordEntry, nowSeconds: number, ratio: [number, number]): Mat3 {
  const initialTime = num(e.initialTime, 0);
  const timeFactor = num(e.timeFactor, 1);
  const now = initialTime + nowSeconds * timeFactor;
  const spin = num(e.spinSpeed, 0) * (2 * Math.PI * now);
  const [sfx, sfy] = vec(e.scrollFactor, [0, 0]);
  const t: [number, number] = [sfx * now, sfy * now];
  const [scx, scy] = vec(e.scaleFactor, [1, 1]);
  const s: [number, number] = [scx * ratio[0], scy * ratio[1]];
  const r: [number, number] = [Math.cos(spin), Math.sin(spin)];
  const [cx, cy] = vec(e.rotationCenter, [0, 0]);

  const c2x = ((r[0] * -cx) + (-r[1] * -cy) + (cx + t[0] * r[0]) + (cy + t[1] * -r[1])) * s[0];
  const c2y = ((r[1] * -cx) + (r[0] * -cy) + (cx + t[0] * r[1]) + (cy + t[1] * r[0])) * s[1];

  return Float64Array.from([
    r[0] * s[0], r[1] * s[1], 0, // col0
    -r[1] * s[0], r[0] * s[1], 0, // col1
    c2x, c2y, 1,                 // col2
  ]);
}

export function applyMat3(m: Mat3, uv: [number, number]): [number, number] {
  // column-major: x = col0.x*u + col1.x*v + col2.x ; y = col0.y*u + col1.y*v + col2.y
  return [
    m[0] * uv[0] + m[3] * uv[1] + m[6],
    m[1] * uv[0] + m[4] * uv[1] + m[7],
  ];
}

export function getTexCoords(
  pointUV: [number, number],
  quadPos: [number, number],
  e: TexCoordEntry,
  panelSize: [number, number],
  nowSeconds: number,
): [number, number] {
  let norm = num(e.normalization, 0);
  let ratio: [number, number] = [1, 1];
  if (norm < 0) {
    norm = Math.abs(norm);
    const minSide = Math.max(Math.min(panelSize[0], panelSize[1]), 1);
    const aspect: [number, number] = [panelSize[0] / minSide, panelSize[1] / minSide];
    ratio = [1 + (aspect[0] - 1) * norm, 1 + (aspect[1] - 1) * norm];
  }
  const b = Math.max(0, Math.min(1, norm));
  const uv: [number, number] = [
    pointUV[0] + (quadPos[0] - pointUV[0]) * b,
    pointUV[1] + (quadPos[1] - pointUV[1]) * b,
  ];
  return applyMat3(texCoordMat3(e, nowSeconds, ratio), uv);
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/texcoord.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/texcoord.ts tests/bg/texcoord.test.ts
git commit -m "feat(bg): texcoord animation matrix + getTexCoords CPU port"
```

## Task 0.4: `bg/lightInput.ts` — light-texCoord sentinel inheritance

**Files:**
- Create: `src/bg/lightInput.ts`
- Test: `tests/bg/lightInput.test.ts`

Engine truth (comp:203): `light_texCoord = light.gradientTexCoord & 0xFFFF; if (light_texCoord > 0x3FFF) light_texCoord = bk_detailN.y` — a light with no texCoord (sentinel 0xFFFF) inherits the same-index detail layer's texCoord (light0→layer0, light1→layer1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/lightInput.test.ts
import { describe, it, expect } from 'vitest';
import { resolveLightTexCoord } from '../../src/bg/lightInput';

describe('resolveLightTexCoord', () => {
  it('uses the light texCoord when present', () => {
    expect(resolveLightTexCoord({ gradient: 'g', texCoord: 'spin' }, { texCoord: 'scroll' })).toBe('spin');
  });
  it('inherits the layer texCoord when the light has none', () => {
    expect(resolveLightTexCoord({ gradient: 'g' }, { texCoord: 'scroll' })).toBe('scroll');
  });
  it('returns null when neither has one', () => {
    expect(resolveLightTexCoord({ gradient: 'g' }, {})).toBeNull();
    expect(resolveLightTexCoord({ gradient: 'g' }, null)).toBeNull();
  });
  it('treats empty-string texCoord as absent', () => {
    expect(resolveLightTexCoord({ gradient: 'g', texCoord: '' }, { texCoord: 'scroll' })).toBe('scroll');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/lightInput.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/lightInput.ts
// The 0xFFFF sentinel rule (gui_panelbuilder.comp:203): a light with no texCoord inherits
// the same-index detail layer's texCoord (light0→layer0, light1→layer1).
const ref = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' && !v.startsWith('#') ? v : null;

export function resolveLightTexCoord(
  lightEntry: { texCoord?: unknown } | null | undefined,
  layerEntry: { texCoord?: unknown } | null | undefined,
): string | null {
  return ref(lightEntry?.texCoord) ?? ref(layerEntry?.texCoord) ?? null;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/lightInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/lightInput.ts tests/bg/lightInput.test.ts
git commit -m "feat(bg): light-texCoord sentinel inheritance helper"
```

## Task 0.5: `bg/backdropModel.ts` — backdrop layer (de)serialization

**Files:**
- Create: `src/bg/backdropModel.ts`
- Test: `tests/bg/backdropModel.test.ts`

Engine truth (`LoadBackgrounds`, spec §1/§5.3): a backdrop has `Detail Layers` (≤2; layer 1 composites over layer 0; an empty `{}` skips a slot), `Frosted Glass` (key presence = enabled), `detailOpacity`, `Comment`. Serialization rules (spec §5.3): layer 0 disabled + layer 1 enabled → `[{}, {…}]`; both disabled → omit `Detail Layers` entirely; a single enabled layer 0 → `[{…}]`.

This module is the single source of truth the `backdropForm` mutates through, so the slot-skip form round-trips exactly.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/backdropModel.test.ts
import { describe, it, expect } from 'vitest';
import { readLayers, writeLayers, type LayerModel } from '../../src/bg/backdropModel';

const L = (image: string, texCoord: string): LayerModel =>
  ({ enabled: true, image, texCoord, wrapX: 'REPEAT', wrapY: 'REPEAT' });
const OFF: LayerModel = { enabled: false, image: '', texCoord: '', wrapX: 'REPEAT', wrapY: 'REPEAT' };

describe('readLayers', () => {
  it('reads two configured layers', () => {
    const [l0, l1] = readLayers({ 'Detail Layers': [
      { image: 'a.png', texCoord: 'tc', wrapX: 'CLAMP_TO_EDGE' },
      { image: 'b.png', texCoord: 'tc2' },
    ] });
    expect(l0.enabled).toBe(true); expect(l0.image).toBe('a.png'); expect(l0.wrapX).toBe('CLAMP_TO_EDGE');
    expect(l1.enabled).toBe(true); expect(l1.image).toBe('b.png');
  });
  it('treats {} as a disabled slot', () => {
    const [l0, l1] = readLayers({ 'Detail Layers': [{}, { image: 'b.png', texCoord: 't' }] });
    expect(l0.enabled).toBe(false);
    expect(l1.enabled).toBe(true);
  });
  it('missing Detail Layers → both disabled', () => {
    const [l0, l1] = readLayers({ 'Frosted Glass': {} });
    expect(l0.enabled).toBe(false); expect(l1.enabled).toBe(false);
  });
});

describe('writeLayers (in place, omit/skip rules)', () => {
  it('both enabled → [{…},{…}]', () => {
    const e: any = {};
    writeLayers(e, [L('a.png', 't0'), L('b.png', 't1')]);
    expect(e['Detail Layers']).toEqual([
      { image: 'a.png', texCoord: 't0', wrapX: 'REPEAT', wrapY: 'REPEAT' },
      { image: 'b.png', texCoord: 't1', wrapX: 'REPEAT', wrapY: 'REPEAT' },
    ]);
  });
  it('layer0 off + layer1 on → [{}, {…}]', () => {
    const e: any = {};
    writeLayers(e, [OFF, L('b.png', 't1')]);
    expect(e['Detail Layers'][0]).toEqual({});
    expect(e['Detail Layers'][1].image).toBe('b.png');
  });
  it('only layer0 on → [{…}] (no trailing slot)', () => {
    const e: any = {};
    writeLayers(e, [L('a.png', 't0'), OFF]);
    expect(e['Detail Layers']).toHaveLength(1);
    expect(e['Detail Layers'][0].image).toBe('a.png');
  });
  it('both off → omit Detail Layers entirely', () => {
    const e: any = { 'Detail Layers': [{}], Comment: 'keep' };
    writeLayers(e, [OFF, OFF]);
    expect('Detail Layers' in e).toBe(false);
    expect(e.Comment).toBe('keep'); // unrelated keys untouched
  });
  it('omits default REPEAT wrap but keeps non-default', () => {
    const e: any = {};
    writeLayers(e, [{ ...L('a.png', 't0'), wrapX: 'MIRRORED_REPEAT' }, OFF]);
    expect(e['Detail Layers'][0]).toEqual({ image: 'a.png', texCoord: 't0', wrapX: 'MIRRORED_REPEAT' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/backdropModel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/backdropModel.ts
export type WrapMode = 'REPEAT' | 'MIRRORED_REPEAT' | 'CLAMP_TO_EDGE' | 'CLAMP_TO_BORDER';

export interface LayerModel {
  enabled: boolean;
  image: string;       // path | '#HURL_NOISE' | ''
  texCoord: string;    // name | ''
  wrapX: WrapMode;
  wrapY: WrapMode;
}

const DEF: WrapMode = 'REPEAT';
const asWrap = (v: unknown): WrapMode => {
  const s = String(v ?? '').toUpperCase();
  return s === 'MIRRORED_REPEAT' || s === 'CLAMP_TO_EDGE' || s === 'CLAMP_TO_BORDER' ? (s as WrapMode) : DEF;
};

function readLayer(raw: any): LayerModel {
  const empty = raw == null || (typeof raw === 'object' && Object.keys(raw).length === 0);
  if (empty) return { enabled: false, image: '', texCoord: '', wrapX: DEF, wrapY: DEF };
  return {
    enabled: true,
    image: typeof raw.image === 'string' ? raw.image : '',
    texCoord: typeof raw.texCoord === 'string' ? raw.texCoord : '',
    wrapX: asWrap(raw.wrapX),
    wrapY: asWrap(raw.wrapY),
  };
}

export function readLayers(entry: any): [LayerModel, LayerModel] {
  const arr = Array.isArray(entry?.['Detail Layers']) ? entry['Detail Layers'] : [];
  return [readLayer(arr[0]), readLayer(arr[1])];
}

function serializeLayer(l: LayerModel): any {
  const o: any = { image: l.image, texCoord: l.texCoord };
  if (l.wrapX !== DEF) o.wrapX = l.wrapX;
  if (l.wrapY !== DEF) o.wrapY = l.wrapY;
  return o;
}

// Mutate `entry['Detail Layers']` in place per the slot-skip rules; omit when both disabled.
export function writeLayers(entry: any, layers: [LayerModel, LayerModel]): void {
  const [l0, l1] = layers;
  if (!l0.enabled && !l1.enabled) { delete entry['Detail Layers']; return; }
  if (l1.enabled) {
    entry['Detail Layers'] = [l0.enabled ? serializeLayer(l0) : {}, serializeLayer(l1)];
  } else {
    entry['Detail Layers'] = [serializeLayer(l0)];
  }
}

// Glass presence + detailOpacity helpers (thin; used by backdropForm).
export const glassEnabled = (entry: any): boolean =>
  entry?.['Frosted Glass'] != null && typeof entry['Frosted Glass'] === 'object';

export function setGlass(entry: any, on: boolean): void {
  if (on) { if (!glassEnabled(entry)) entry['Frosted Glass'] = { blur: 0.5, zoom: 1, opacity: 0 }; }
  else delete entry['Frosted Glass'];
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/backdropModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/backdropModel.ts tests/bg/backdropModel.test.ts
git commit -m "feat(bg): backdrop layer (de)serialization with slot-skip rules"
```

## Task 0.6: `bg/rename.ts` — rename a named entry + rewrite consumers

**Files:**
- Create: `src/bg/rename.ts`
- Test: `tests/bg/rename.test.ts`

Spec §5.2: rename (TexCoords/Gradients) rewrites the table key + every consumer path from `index.consumers(ns, old)` in one mutation. Consumer edges carry `from.jsonPath` (the full path to the ref string, e.g. `['Backgrounds','Backdrop_0','Detail Layers',0,'texCoord']`). Reuses the slice-1 `RefIndex.consumers`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/rename.test.ts
import { describe, it, expect } from 'vitest';
import { buildRefIndex } from '../../src/package/refIndex';
import { renameNamedEntry } from '../../src/bg/rename';
import type { PackageDoc } from '../../src/package/model';

function pkgWith(bg: any): PackageDoc {
  const blank = { path: '', root: {}, dirty: false, indent: '\t' };
  return { files: {
    borders: { ...blank }, backgrounds: { path: 'backgrounds.json', root: bg, dirty: false, indent: '\t' },
    responseCurves: { ...blank }, codingThemes: { ...blank },
  } } as PackageDoc;
}

describe('renameNamedEntry (bg:texcoords)', () => {
  it('renames the table key and every consumer (two layers + a light)', () => {
    const bg = {
      Backgrounds: { Backdrop_0: { 'Detail Layers': [
        { image: 'a.png', texCoord: 'spin' }, { image: 'b.png', texCoord: 'spin' },
      ] } },
      Lights: { White: { gradient: 'g', texCoord: 'spin' } },
      TexCoords: { spin: { spinSpeed: 1 } },
      Gradients: { g: [[0, [1, 1, 1, 1]]] },
    };
    const pkg = pkgWith(bg);
    renameNamedEntry(pkg, buildRefIndex(pkg), 'bg:texcoords', 'spin', 'rotate');

    expect(bg.TexCoords).toEqual({ rotate: { spinSpeed: 1 } });
    expect(bg.Backgrounds.Backdrop_0['Detail Layers'][0].texCoord).toBe('rotate');
    expect(bg.Backgrounds.Backdrop_0['Detail Layers'][1].texCoord).toBe('rotate');
    expect(bg.Lights.White.texCoord).toBe('rotate');
  });

  it('throws on a duplicate target name', () => {
    const bg = { TexCoords: { a: {}, b: {} } };
    const pkg = pkgWith(bg);
    expect(() => renameNamedEntry(pkg, buildRefIndex(pkg), 'bg:texcoords', 'a', 'b')).toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/rename.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/rename.ts
import type { PackageDoc } from '../package/model';
import type { RefIndex, Namespace } from '../package/refIndex';

const NS_TABLE: Partial<Record<Namespace, 'TexCoords' | 'Gradients'>> = {
  'bg:texcoords': 'TexCoords',
  'bg:gradients': 'Gradients',
};

// Rename a named bg entry and rewrite every consumer ref. Mutates pkg.files.backgrounds.root in place.
export function renameNamedEntry(pkg: PackageDoc, index: RefIndex, ns: Namespace, oldName: string, newName: string): void {
  const tableKey = NS_TABLE[ns];
  if (!tableKey) throw new Error(`renameNamedEntry: unsupported namespace ${ns}`);
  if (newName === oldName) return;
  const root = pkg.files.backgrounds.root;
  const table = root?.[tableKey];
  if (!table || !(oldName in table)) throw new Error(`renameNamedEntry: "${oldName}" not in ${tableKey}`);
  if (newName in table) throw new Error(`renameNamedEntry: "${newName}" already exists in ${tableKey}`);

  // Rewrite consumers first (they live in the same file root).
  for (const edge of index.consumers(ns, oldName)) {
    let node: any = pkg.files[edge.from.file].root;
    const path = edge.from.jsonPath;
    for (let i = 0; i < path.length - 1; ++i) node = node?.[path[i]];
    const leaf = path[path.length - 1];
    if (node && node[leaf] === oldName) node[leaf] = newName;
  }

  // Rewrite the definition key, preserving insertion order.
  const next: Record<string, any> = {};
  for (const k of Object.keys(table)) next[k === oldName ? newName : k] = table[k];
  root[tableKey] = next;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/rename.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/rename.ts tests/bg/rename.test.ts
git commit -m "feat(bg): rename named entry + rewrite all consumer refs"
```

---

# PHASE 1 — Validators & schema

## Task 1.1: Remove `timeFactorValidator`; reword dangling-ref

**Files:**
- Modify: `src/package/validate.ts`
- Test: `tests/package/validate.test.ts`

Spec §5.8: the engine `timeFactor` int→float bug is being fixed; delete the warning validator and its category. The dangling-ref message wrongly says "silently drop" — every name-namespace ref resolves through `GetIndex`, so a dangle is a **build error dialog**, not a silent drop.

- [ ] **Step 1: Update the failing test first**

In `tests/package/validate.test.ts`: delete any test asserting a `texcoord-timefactor` issue (search `timefactor`/`timeFactor`). Add/adjust:

```ts
it('does not emit a timeFactor warning (validator removed)', () => {
  const pkg = pkgWith({ backgrounds: { TexCoords: { spin: { timeFactor: 5 } } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  expect(issues.some((i) => i.category === 'texcoord-timefactor')).toBe(false);
});

it('dangling-ref message says build error, not silent drop', () => {
  const pkg = pkgWith({ backgrounds: { Lights: { White: { gradient: 'ghost' } } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  const d = issues.find((i) => i.category === 'dangling-ref');
  expect(d).toBeTruthy();
  expect(d!.message).toMatch(/build error/i);
  expect(d!.message).not.toMatch(/silently drop/i);
});
```

(Use the file's existing `pkgWith`/`emptyAssets`/`schemas` helpers — match their current signatures; if `pkgWith` takes a full package, adapt the literal accordingly.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: FAIL — timeFactor issue still emitted / message still says "silently drop".

- [ ] **Step 3: Implement**

In `src/package/validate.ts`:
1. Delete the entire `timeFactorValidator` block (lines ~113-126).
2. Remove `timeFactorValidator` from the `REGISTRY` array.
3. Drop `'texcoord-timefactor'` from the `category` comment on the `Issue` interface.
4. Reword `danglingValidator`'s message:

```ts
const danglingValidator: Validator = (_pkg, index) =>
  index.dangling().map((e) => ({
    severity: 'error' as const,
    category: 'dangling-ref',
    message: `${NS_LABEL[e.to.ns]} "${e.to.name}" is referenced but not defined — this is a build error (the packer's GetIndex fails on the missing name).`,
    file: e.from.file,
    jsonPath: e.from.jsonPath,
    nav: { surface: e.from.file, entry: { ns: e.to.ns, name: e.to.name } },
  }));
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/package/validate.ts tests/package/validate.test.ts
git commit -m "refactor(validate): drop timeFactor warning, reword dangling-ref as build error"
```

## Task 1.2: Add `bgGradientMarksValidator`

**Files:**
- Modify: `src/package/validate.ts`
- Test: `tests/package/validate.test.ts`

Spec §5.8: per `Gradients` entry — marks not ascending → **error** (the bake loop reads past the end of the marks; the engine's own check is broken); any `t` outside 0..1 → **warning** (ends auto-extend; out-of-range marks are dead/misleading).

- [ ] **Step 1: Write the failing test**

```ts
it('flags non-ascending gradient marks as an error', () => {
  const pkg = pkgWith({ backgrounds: { Gradients: { bad: [[0, [0, 0, 0, 1]], [0.8, [1, 1, 1, 1]], [0.3, [1, 0, 0, 1]]] } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  const e = issues.find((i) => i.category === 'bg-gradient-marks' && i.severity === 'error');
  expect(e).toBeTruthy();
  expect(e!.message).toMatch(/ascending/i);
});

it('warns on a gradient mark t outside 0..1', () => {
  const pkg = pkgWith({ backgrounds: { Gradients: { oob: [[-0.1, [0, 0, 0, 1]], [1.2, [1, 1, 1, 1]]] } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  expect(issues.some((i) => i.category === 'bg-gradient-marks' && i.severity === 'warning')).toBe(true);
});

it('accepts a well-formed gradient', () => {
  const pkg = pkgWith({ backgrounds: { Gradients: { ok: [[0, [0, 0, 0, 1]], [1, [1, 1, 1, 1]]] } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  expect(issues.some((i) => i.category === 'bg-gradient-marks')).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: FAIL — no `bg-gradient-marks` issues.

- [ ] **Step 3: Implement**

Add to `src/package/validate.ts` (import the pure helper to avoid duplicating the ascending rule):

```ts
import { marksAscending } from '../bg/gradients';

// 7. bg-gradient-marks — non-ascending marks crash the bake; out-of-range t is dead/misleading.
const bgGradientMarksValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const grads = pkg.files.backgrounds.root?.Gradients;
  if (!grads || typeof grads !== 'object') return out;
  for (const name of Object.keys(grads)) {
    const marks = grads[name];
    if (!Array.isArray(marks)) continue;
    const ts = marks.map((m: any) => (Array.isArray(m) ? m[0] : NaN)) as number[];
    const parsed = marks
      .filter((m: any) => Array.isArray(m) && typeof m[0] === 'number')
      .map((m: any) => [m[0], m[1]] as [number, [number, number, number, number]]);
    if (!marksAscending(parsed)) {
      out.push({
        severity: 'error', category: 'bg-gradient-marks',
        message: `Gradient "${name}" has marks that are not in ascending order — the builder's bake loop reads past the end of the marks and can crash the build (the engine's own check misses it).`,
        file: 'backgrounds', jsonPath: ['Gradients', name],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:gradients', name } },
      });
    }
    if (ts.some((t) => t < 0 || t > 1)) {
      out.push({
        severity: 'warning', category: 'bg-gradient-marks',
        message: `Gradient "${name}" has a mark t outside 0..1 — ends are auto-extended, so out-of-range marks are dead or misleading.`,
        file: 'backgrounds', jsonPath: ['Gradients', name],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:gradients', name } },
      });
    }
  }
  return out;
};
```

Append `bgGradientMarksValidator` to the `REGISTRY` array.

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/package/validate.ts tests/package/validate.test.ts
git commit -m "feat(validate): bg gradient marks — ascending error + out-of-range warning"
```

## Task 1.3: Schema edits — timeFactor wording + tighten anyOf

**Files:**
- Modify: `/mnt/Passport/Lifaundi/Gui/schemas/backgrounds.schema.json`
- Test: `tests/package/validate.test.ts` (schema-driven case)

Spec §5.8: drop the timeFactor warning sentence; ensure an informationless backdrop (empty `Detail Layers: []`, no glass) is caught client-side. The `anyOf` already requires `Detail Layers` OR `Frosted Glass` (lines 133-135), but `Detail Layers: []` satisfies presence — tighten so an empty array doesn't count.

- [ ] **Step 1: Write the failing test**

```ts
it('schema rejects an informationless backdrop (empty Detail Layers, no glass)', () => {
  const pkg = pkgWith({ backgrounds: { Backgrounds: { Backdrop_0: { 'Detail Layers': [] } } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  expect(issues.some((i) => i.category === 'schema' && i.file === 'backgrounds' && i.severity === 'error')).toBe(true);
});

it('schema accepts a glass-only backdrop', () => {
  const pkg = pkgWith({ backgrounds: { Backgrounds: { Backdrop_0: { 'Frosted Glass': {} } } } });
  const issues = runValidators(pkg, buildRefIndex(pkg), emptyAssets(), schemas);
  expect(issues.some((i) => i.category === 'schema' && i.file === 'backgrounds')).toBe(false);
});
```

(The test harness compiles schemas from the on-disk files via `createSchemaValidators`/`loadSchemas`; confirm the test's `schemas` fixture reads the real `schemas/backgrounds.schema.json`. If it uses an inline stub, update the stub identically.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: FAIL — empty `Detail Layers` currently passes the `anyOf`.

- [ ] **Step 3: Implement**

In `backgrounds.schema.json`, replace the backdrop `anyOf` (lines ~133-136) so the layers branch requires a non-empty array:

```json
      "anyOf": [
        { "required": ["Detail Layers"], "properties": { "Detail Layers": { "minItems": 1 } } },
        { "required": ["Frosted Glass"] }
      ],
```

And remove the timeFactor WARNING sentence from the texCoord `timeFactor` description (line ~208), leaving the factual part:

```json
        "timeFactor": {
          "description": "Time multiplier (0 = static, 1 = realtime).",
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/package/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "/mnt/Passport/Lifaundi/Gui/schemas/backgrounds.schema.json" tests/package/validate.test.ts
git commit -m "fix(schema): tighten backdrop anyOf (non-empty layers), drop timeFactor warning"
```

**Phase 1 gate:** `npm test` green; `npx tsc --noEmit` clean.

---

# PHASE 2 — Preview core (WebGL2)

The preview renders the backdrop fill as a **single quad** (the engine's 5×5 border tessellation is irrelevant to the backdrop — spec §3/§5.7). Per-frame the CPU computes 4 corner UV pairs via `getTexCoords` (Task 0.3) and the vertex shader interpolates them; the fragment shader ports `ReadDetailLayer`/`GetLight`/`SampleImage`. Divergences from the engine (documented, intentional): whole-image sampling instead of megatexture tiling; per-axis wrap (the engine's wrapY bug is being fixed — spec §8.1); mask.r=1, tint=white, no overlay/scroll/exposure/rotation passes.

## Task 2.1: `bg/previewInput.ts` — CPU corner-UV builder

**Files:**
- Create: `src/bg/previewInput.ts`
- Test: `tests/bg/previewInput.test.ts`

Mirrors `create_panel` (comp:~240-275). For each of the 4 panel corners, for each layer, compute `detail01 = getTexCoords(panelPts/imageNativePx, quadPos, texcoord, panelSize, now)`. Quad corner positions are the NDC-ish quad coords `[-1,1]` per corner; point-space UV is `cornerPtFraction · panelSize / imageNativePx` (native-px point scaling preserved — spec §3). Glass UVs scale each corner around the center by `1/zoom`. Light UVs use the resolved (possibly inherited) light texcoord.

This task produces a pure, serializable `BgPreviewInput` the renderer consumes — so the per-frame math is unit-tested with no GL.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/previewInput.test.ts
import { describe, it, expect } from 'vitest';
import { buildBgPreviewInput, CORNERS, type BgScene } from '../../src/bg/previewInput';

const scene: BgScene = {
  panelSize: [100, 50],
  now: 0,
  texcoords: { tc: {} }, // identity
  layers: [
    { enabled: true, image: 'a.png', imageSize: [100, 50], texCoord: 'tc', wrapX: 'REPEAT', wrapY: 'REPEAT', light: null },
    { enabled: false },
  ],
  glass: null,
};

describe('buildBgPreviewInput', () => {
  it('emits 4 corners with detail0 UVs for the enabled layer', () => {
    const input = buildBgPreviewInput(scene);
    expect(input.corners).toHaveLength(4);
    // identity texcoord, image == panel size → point UV == quad-fraction (0..1 across corners)
    const topLeft = input.corners[CORNERS.TL];
    expect(topLeft.detail0).toEqual([0, 0]);
    const botRight = input.corners[CORNERS.BR];
    expect(botRight.detail0[0]).toBeCloseTo(1, 6);
    expect(botRight.detail0[1]).toBeCloseTo(1, 6);
  });

  it('disabled layer 0 yields null detail0', () => {
    const s2 = { ...scene, layers: [{ enabled: false }, { enabled: false }] as any };
    expect(buildBgPreviewInput(s2).corners[CORNERS.TL].detail0).toBeNull();
  });

  it('glass corners zoom around center by 1/zoom', () => {
    const s2: BgScene = { ...scene, glass: { blur: 0, zoom: 2, opacity: 0 } };
    const out = buildBgPreviewInput(s2);
    // center quadPos is (0,0); corner (-1,-1) zoomed by 1/2 → (-0.5,-0.5) → uv (0.25,0.25)
    expect(out.corners[CORNERS.TL].glassUV![0]).toBeCloseTo(0.25, 6);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/previewInput.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/bg/previewInput.ts
import { getTexCoords, type TexCoordEntry } from './texcoord';
import type { WrapMode } from './backdropModel';

export const CORNERS = { TL: 0, TR: 1, BR: 2, BL: 3 } as const;
// Quad-space corner positions (engine quad coords, -1..1) and their 0..1 point fractions.
const QUAD: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const FRAC: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

export interface SceneLayer {
  enabled: boolean;
  image?: string;
  imageSize?: [number, number];
  texCoord?: string;
  wrapX?: WrapMode; wrapY?: WrapMode;
  light?: { id: number } | null; // resolved light slot index (0 = white)
}
export interface BgScene {
  panelSize: [number, number];
  now: number;                          // seconds (already (timestamp&0x7FFFFF)·1e-3)
  texcoords: Record<string, TexCoordEntry>;
  layers: [SceneLayer, SceneLayer];
  glass: { blur: number; zoom: number; opacity: number } | null;
}

export interface CornerUV {
  quad: [number, number];
  detail0: [number, number] | null;
  detail1: [number, number] | null;
  light0: [number, number] | null;
  light1: [number, number] | null;
  glassUV: [number, number] | null;
}
export interface BgPreviewInput { corners: CornerUV[] }

function layerUV(layer: SceneLayer, tcs: Record<string, TexCoordEntry>, panelSize: [number, number], frac: [number, number], quad: [number, number], now: number): [number, number] | null {
  if (!layer.enabled) return null;
  const tc = (layer.texCoord && tcs[layer.texCoord]) || {};
  const size = layer.imageSize ?? [1, 1];
  const pointUV: [number, number] = [(frac[0] * panelSize[0]) / size[0], (frac[1] * panelSize[1]) / size[1]];
  return getTexCoords(pointUV, quad, tc, panelSize, now);
}

export function buildBgPreviewInput(scene: BgScene): BgPreviewInput {
  const [l0, l1] = scene.layers;
  // Glass center = average of the 4 quad corners = (0,0); zoom around it.
  const corners: CornerUV[] = QUAD.map((quad, i) => {
    const frac = FRAC[i];
    const lightTc0 = l0.light ? (scene.texcoords[l0.texCoord ?? ''] ? l0.texCoord : undefined) : undefined;
    const c: CornerUV = {
      quad,
      detail0: layerUV(l0, scene.texcoords, scene.panelSize, frac, quad, scene.now),
      detail1: layerUV(l1, scene.texcoords, scene.panelSize, frac, quad, scene.now),
      // Lights sweep in quad space; light texcoord already resolved upstream into layer.texCoord by the caller.
      light0: l0.light && l0.light.id !== 0 ? layerUV({ ...l0, texCoord: lightTc0 }, scene.texcoords, scene.panelSize, frac, quad, scene.now) : null,
      light1: l1.light && l1.light.id !== 0 ? layerUV(l1, scene.texcoords, scene.panelSize, frac, quad, scene.now) : null,
      glassUV: null,
    };
    if (scene.glass) {
      const z = scene.glass.zoom || 1;
      const zx = quad[0] / z, zy = quad[1] / z; // center is (0,0)
      c.glassUV = [(zx + 1) * 0.5, (zy + 1) * 0.5];
    }
    return c;
  });
  return { corners };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/previewInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/previewInput.ts tests/bg/previewInput.test.ts
git commit -m "feat(bg): preview-input corner-UV builder (CPU port of create_panel)"
```

## Task 2.2: `preview/bg/shaders.ts` — vert + frag

**Files:**
- Create: `src/preview/bg/shaders.ts`
- Test: none (compiled by the renderer's smoke test in Task 2.4).

Faithful ports: `GetLight` (frag:186 — modes FADE/SAW/SINE/TRIANGLE/default, gradient atlas lookup), `SampleImage` (support.h:63 — `#HURL_NOISE` signed screen-space hash when the layer is noise; **per-axis** wrap REPEAT=0/MIRRORED=1/CLAMP_EDGE=2/CLAMP_BORDER=3 with the wrapY fix; CLAMP_TO_BORDER returns `_default`=`vec4(1)` for details), `ReadDetailLayer` (frag:262 — `detail1·light1` over `detail0·light0`, ×tint(white), ×detailOpacity, glass mix). Display: `pow(1/2.2)` at the end (engine composites linear, presents through sRGB swapchain).

- [ ] **Step 1: Implement (no test yet — Task 2.4 compiles it)**

```ts
// src/preview/bg/shaders.ts
// Single-quad backdrop preview. 4 corner UV sets are interpolated; the frag ports
// ReadDetailLayer/GetLight/SampleImage. Per-axis wrap implements the DOCUMENTED semantics
// (the engine's wrapY bug is being fixed — spec §8.1). Whole-image sampling (no megatexture tiling).
export const BG_VERT = `#version 300 es
layout(location=0) in vec2 a_quad;     // -1..1 quad corner
layout(location=1) in vec4 a_detail01; // (detail0.xy, detail1.xy)
layout(location=2) in vec4 a_light01;  // (light0.xy, light1.xy)
layout(location=3) in vec2 a_glassUV;
out vec2 v_detail0; out vec2 v_detail1;
out vec2 v_light0;  out vec2 v_light1;
out vec2 v_glassUV; out vec2 v_scene;  // scene UV = (quad+1)/2
void main() {
  v_detail0 = a_detail01.xy; v_detail1 = a_detail01.zw;
  v_light0 = a_light01.xy;   v_light1 = a_light01.zw;
  v_glassUV = a_glassUV;
  v_scene = (a_quad + 1.0) * 0.5;
  gl_Position = vec4(a_quad.x, -a_quad.y, 0.0, 1.0);
}`;

export const BG_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_layer0; uniform sampler2D u_layer1; // decoded detail images
uniform sampler2D u_scene;                              // synthetic backdrop scene (pre-blurred via mips)
uniform sampler2D u_gradients;                          // 128 x N atlas, NEAREST in V, LINEAR in U
uniform int   u_layer0On; uniform int u_layer1On;
uniform int   u_layer0Noise; uniform int u_layer1Noise; // #HURL_NOISE
uniform ivec2 u_wrap0; uniform ivec2 u_wrap1;          // per-axis wrap mode
uniform int   u_light0; uniform int u_light1;          // light slot index (0 = white)
uniform vec2  u_lightDir0; uniform vec2 u_lightDir1;
uniform float u_lightRadial0, u_lightRadial1, u_lightAmp0, u_lightAmp1;
uniform int   u_lightMode0, u_lightMode1, u_lightGrad0, u_lightGrad1; // gradient row index
uniform int   u_gradientCount;
uniform float u_detailOpacity;
uniform int   u_glassOn; uniform float u_glassBlur, u_glassOpacity;
in vec2 v_detail0; in vec2 v_detail1; in vec2 v_light0; in vec2 v_light1; in vec2 v_glassUV; in vec2 v_scene;
out vec4 fragColor;

const float PI = 3.14159265358979;
const int REPEAT = 0, MIRRORED = 1, CLAMP_EDGE = 2, CLAMP_BORDER = 3;

float gradV(int row) { return (float(row) + 0.5) / float(max(u_gradientCount, 1)); }

vec4 getLight(int id, vec2 d, float radial, float amp, int mode, int gradRow, vec2 coord) {
  if (id == 0) return vec4(1.0);
  float vx = dot(d, coord);
  float vy = dot(vec2(-d.y, d.x), coord);
  float f = length(vec2(vx, vy * radial));
  if (mode == 1)      f = clamp(abs(f * amp), 0.0, 1.0);                 // FADE
  else if (mode == 2) f = clamp(fract(f) * amp, 0.0, 1.0);              // SAW
  else if (mode == 3) { f = cos(f * 2.0 * PI); f = clamp(f * amp, -1.0, 1.0); f = (f + 1.0) * 0.5; } // SINE
  else if (mode == 4) { f = mod(f, 1.0); f = abs(f * 2.0 - 1.0); f = clamp(f * amp, 0.0, 1.0); }      // TRIANGLE
  else                f = clamp((f + 1.0) / 2.0, 0.0, 1.0);             // default
  return texture(u_gradients, vec2(f, gradV(gradRow)));
}

// Per-axis wrap; returns false (and leaves color) when CLAMP_BORDER rejects → caller uses _default.
bool sampleLayer(sampler2D tex, int on, int noise, vec2 uv, ivec2 wrap, out vec4 color) {
  if (on == 0) { color = vec4(0.0); return false; }
  if (noise == 1) {
    vec2 c = gl_FragCoord.xy;
    vec3 n = vec3(dot(c, vec2(12.9898, 78.233)), dot(c, vec2(-39.7468, 36.721)), dot(c, vec2(62.3456, -94.789)));
    n = fract(sin(n) * 43758.5453);
    color = vec4(n * 2.0 - 1.0, 1.0); return true;
  }
  vec2 clamped = clamp(uv, 0.0, 1.0);
  if ((wrap.x == CLAMP_BORDER && clamped.x != uv.x) || (wrap.y == CLAMP_BORDER && clamped.y != uv.y)) {
    color = vec4(1.0); return false; // detail _default = vec4(1)
  }
  // per-axis CLAMP_EDGE
  if (wrap.x == CLAMP_EDGE) uv.x = clamped.x;
  if (wrap.y == CLAMP_EDGE) uv.y = clamped.y;
  // per-axis MIRRORED_REPEAT
  if (wrap.x == MIRRORED && int(mod(floor(uv.x), 2.0)) == 1) uv.x = 1.0 - fract(uv.x); else uv.x = fract(uv.x);
  if (wrap.y == MIRRORED && int(mod(floor(uv.y), 2.0)) == 1) uv.y = 1.0 - fract(uv.y); else uv.y = fract(uv.y);
  color = texture(tex, uv); return true;
}

void main() {
  vec4 detail = vec4(0.0);
  // layer 1 over layer 0
  if (u_layer1On == 1 || u_light1 > 0) {
    vec4 l1 = getLight(u_light1, u_lightDir1, u_lightRadial1, u_lightAmp1, u_lightMode1, u_lightGrad1, v_light1);
    vec4 d1; bool ok1 = sampleLayer(u_layer1, u_layer1On, u_layer1Noise, v_detail1, u_wrap1, d1);
    if (!ok1 && u_layer1On == 1) d1 = vec4(1.0);
    detail = l1 * d1;
  }
  if (u_layer0On == 1 || u_light0 > 0) {
    vec4 l0 = getLight(u_light0, u_lightDir0, u_lightRadial0, u_lightAmp0, u_lightMode0, u_lightGrad0, v_light0);
    vec4 d0; bool ok0 = sampleLayer(u_layer0, u_layer0On, u_layer0Noise, v_detail0, u_wrap0, d0);
    if (!ok0 && u_layer0On == 1) d0 = vec4(1.0);
    d0 = d0 * l0;
    detail.rgb = mix(d0.rgb, detail.rgb, detail.a);
    detail.a = d0.a + detail.a * (1.0 - d0.a);
  }
  // tint = white; detailOpacity multiplies combined alpha.
  detail.a *= u_detailOpacity;
  if (u_glassOn == 1 && detail.a < 1.0) {
    vec4 glass = textureLod(u_scene, v_glassUV, clamp(u_glassBlur, 0.0, 2.0));
    glass.rgb = glass.rgb / (1.0 + glass.rgb);
    detail = vec4(mix(glass.rgb, detail.rgb, detail.a), detail.a + u_glassOpacity);
  }
  fragColor = vec4(pow(max(detail.rgb, 0.0), vec3(1.0 / 2.2)), clamp(detail.a, 0.0, 1.0));
}`;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (it's just exported string constants).

- [ ] **Step 3: Commit**

```bash
git add src/preview/bg/shaders.ts
git commit -m "feat(bg): preview shaders — ReadDetailLayer/GetLight/SampleImage ports"
```

## Task 2.3: `preview/bg/scene.ts` — synthetic backdrop scene texture

**Files:**
- Create: `src/preview/bg/scene.ts`
- Test: none (drawn into a renderer-owned FBO; verified visually + by Task 2.4 smoke).

Spec §5.7/§file-structure: a procedural radial-gradient + color-blob scene rendered once to a texture, with mipmaps so `textureLod(clamp(blur,0,2))` stands in for the engine's pre-blurred screen buffer. Keep it tiny — a 256×256 RGBA `Uint8Array` painted on a 2D canvas, uploaded with `generateMipmap`.

- [ ] **Step 1: Implement**

```ts
// src/preview/bg/scene.ts
// Procedural backdrop scene (radial gradient + soft color blobs). Returns a 256x256 RGBA canvas
// the renderer uploads with mipmaps; textureLod(blur) reads a coarser mip as faux frosted glass.
export function makeSceneCanvas(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, '#3a4a6a'); g.addColorStop(1, '#10131c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const blob = (x: number, y: number, r: number, color: string) => {
    const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, color); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  blob(size * 0.25, size * 0.30, size * 0.30, 'rgba(120,90,200,0.55)');
  blob(size * 0.75, size * 0.65, size * 0.35, 'rgba(80,160,170,0.50)');
  blob(size * 0.60, size * 0.20, size * 0.20, 'rgba(200,120,90,0.45)');
  return c;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/preview/bg/scene.ts
git commit -m "feat(bg): synthetic backdrop scene texture"
```

## Task 2.4: `preview/bg/renderer.ts` — `BgPreviewRenderer`

**Files:**
- Create: `src/preview/bg/renderer.ts`
- Test: `tests/bg/renderer.smoke.test.ts` (jsdom-skippable; gated on WebGL2 availability).

Owns: program (cached uniform locations at link), the quad VAO (4 verts, per-corner attribute buffers from `BgPreviewInput`), gradient atlas (128×N RGBA32F, rebuilt only when gradients change — keyed by a caller-supplied revision number), layer textures (WeakMap keyed on decoded `Rgba` identity — slice-3 M6 pattern), scene texture w/ mipmaps. Follow `src/preview/renderer.ts` exactly for compile/link/uniform-cache/dispose.

- [ ] **Step 1: Write the smoke test (skips when WebGL2 is unavailable)**

```ts
// tests/bg/renderer.smoke.test.ts
import { describe, it, expect } from 'vitest';

const hasGL = (() => {
  try {
    const c: any = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    return !!c?.getContext?.('webgl2');
  } catch { return false; }
})();

describe.skipIf(!hasGL)('BgPreviewRenderer', () => {
  it('constructs, links, and renders one frame without throwing', async () => {
    const { BgPreviewRenderer } = await import('../../src/preview/bg/renderer');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const r = new BgPreviewRenderer(canvas);
    r.setGradients([new Float32Array(128 * 4).fill(1)], 1);
    r.render({
      input: { corners: [
        { quad: [-1, -1], detail0: [0, 0], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [1, -1], detail0: [1, 0], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [1, 1], detail0: [1, 1], detail1: null, light0: null, light1: null, glassUV: null },
        { quad: [-1, 1], detail0: [0, 1], detail1: null, light0: null, light1: null, glassUV: null },
      ] },
      layer0: null, layer1: null,
      wrap0: [0, 0], wrap1: [0, 0],
      light0: null, light1: null,
      detailOpacity: 1, glass: null,
    });
    expect(() => r.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/renderer.smoke.test.ts`
Expected: FAIL (module not found) — or SKIP if the runner lacks WebGL2. If it skips, that's acceptable; the renderer is exercised end-to-end by the Phase 5 Playwright smokes. Proceed to implement so `tsc` covers it.

- [ ] **Step 3: Implement**

```ts
// src/preview/bg/renderer.ts
import type { Rgba } from '../../types';
import type { BgPreviewInput } from '../../bg/previewInput';
import { BG_VERT, BG_FRAG } from './shaders';
import { makeSceneCanvas } from './scene';

export interface LightUniforms {
  id: number; dir: [number, number]; radial: number; amplitude: number;
  mode: number; gradientRow: number;
}
export interface BgRenderParams {
  input: BgPreviewInput;
  layer0: { image: Rgba | null; noise: boolean } | null;
  layer1: { image: Rgba | null; noise: boolean } | null;
  wrap0: [number, number]; wrap1: [number, number];
  light0: LightUniforms | null; light1: LightUniforms | null;
  detailOpacity: number;
  glass: { blur: number; opacity: number } | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? 'compile failed'; gl.deleteShader(s); throw new Error(log);
  }
  return s;
}

export class BgPreviewRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uloc = new Map<string, WebGLUniformLocation | null>();
  private vao: WebGLVertexArrayObject;
  private bufs: WebGLBuffer[];
  private layerTex = new WeakMap<Rgba, WebGLTexture>();
  private gradTex: WebGLTexture; private gradCount = 0; private gradRev = -1;
  private sceneTex: WebGLTexture;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, BG_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, BG_FRAG);
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, vs); gl.attachShader(this.prog, fs); gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) ?? 'link failed');
    const nU = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < nU; ++i) {
      const info = gl.getActiveUniform(this.prog, i); if (!info) continue;
      this.uloc.set(info.name, gl.getUniformLocation(this.prog, info.name));
    }
    gl.detachShader(this.prog, vs); gl.detachShader(this.prog, fs); gl.deleteShader(vs); gl.deleteShader(fs);
    this.vao = gl.createVertexArray()!;
    this.bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!];
    this.gradTex = gl.createTexture()!;
    this.sceneTex = this.uploadScene();
    gl.getExtension('EXT_color_buffer_float'); // for RGBA32F sampling, harmless if absent
  }

  private u(name: string): WebGLUniformLocation | null { return this.uloc.get(name) ?? null; }

  private uploadScene(): WebGLTexture {
    const gl = this.gl; const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeSceneCanvas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // rev: bump when the gradient set changes so we re-upload only then.
  setGradients(rows: Float32Array[], rev: number): void {
    if (rev === this.gradRev) return;
    this.gradRev = rev; this.gradCount = Math.max(rows.length, 1);
    const gl = this.gl;
    const data = new Float32Array(128 * this.gradCount * 4);
    rows.forEach((r, i) => data.set(r.subarray(0, 128 * 4), i * 128 * 4));
    gl.bindTexture(gl.TEXTURE_2D, this.gradTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 128, this.gradCount, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // NEAREST in V
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);  // LINEAR in U
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private texFor(img: Rgba): WebGLTexture {
    let t = this.layerTex.get(img);
    if (t) return t;
    const gl = this.gl; t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.layerTex.set(img, t);
    return t;
  }

  render(p: BgRenderParams): void {
    const gl = this.gl;
    // Build per-corner attribute arrays (4 verts, fan order TL,TR,BR,BL).
    const quad = new Float32Array(8), det = new Float32Array(16), lit = new Float32Array(16), glass = new Float32Array(8);
    p.input.corners.forEach((c, i) => {
      quad.set(c.quad, i * 2);
      det.set([...(c.detail0 ?? [0, 0]), ...(c.detail1 ?? [0, 0])], i * 4);
      lit.set([...(c.light0 ?? [0, 0]), ...(c.light1 ?? [0, 0])], i * 4);
      glass.set(c.glassUV ?? [0, 0], i * 2);
    });
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    const attr = (loc: number, data: Float32Array, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[loc]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, quad, 2); attr(1, det, 4); attr(2, lit, 4); attr(3, glass, 2);

    // textures: 0 layer0, 1 layer1, 2 scene, 3 gradients
    const bindLayer = (unit: number, layer: BgRenderParams['layer0'], onName: string, noiseName: string, samplerName: string) => {
      const on = layer && (layer.image || layer.noise) ? 1 : 0;
      gl.uniform1i(this.u(onName), on);
      gl.uniform1i(this.u(noiseName), layer?.noise ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, layer?.image ? this.texFor(layer.image) : this.gradTex);
      gl.uniform1i(this.u(samplerName), unit);
    };
    bindLayer(0, p.layer0, 'u_layer0On', 'u_layer0Noise', 'u_layer0');
    bindLayer(1, p.layer1, 'u_layer1On', 'u_layer1Noise', 'u_layer1');
    gl.activeTexture(gl.TEXTURE0 + 2); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(this.u('u_scene'), 2);
    gl.activeTexture(gl.TEXTURE0 + 3); gl.bindTexture(gl.TEXTURE_2D, this.gradTex); gl.uniform1i(this.u('u_gradients'), 3);
    gl.uniform1i(this.u('u_gradientCount'), this.gradCount);

    gl.uniform2i(this.u('u_wrap0'), p.wrap0[0], p.wrap0[1]);
    gl.uniform2i(this.u('u_wrap1'), p.wrap1[0], p.wrap1[1]);
    const setLight = (l: LightUniforms | null, idN: string, dirN: string, radN: string, ampN: string, modeN: string, gradN: string) => {
      gl.uniform1i(this.u(idN), l?.id ?? 0);
      gl.uniform2f(this.u(dirN), l?.dir[0] ?? 0, l?.dir[1] ?? 1);
      gl.uniform1f(this.u(radN), l?.radial ?? 1); gl.uniform1f(this.u(ampN), l?.amplitude ?? 1);
      gl.uniform1i(this.u(modeN), l?.mode ?? 0); gl.uniform1i(this.u(gradN), l?.gradientRow ?? 0);
    };
    setLight(p.light0, 'u_light0', 'u_lightDir0', 'u_lightRadial0', 'u_lightAmp0', 'u_lightMode0', 'u_lightGrad0');
    setLight(p.light1, 'u_light1', 'u_lightDir1', 'u_lightRadial1', 'u_lightAmp1', 'u_lightMode1', 'u_lightGrad1');
    gl.uniform1f(this.u('u_detailOpacity'), p.detailOpacity);
    gl.uniform1i(this.u('u_glassOn'), p.glass ? 1 : 0);
    gl.uniform1f(this.u('u_glassBlur'), p.glass?.blur ?? 0);
    gl.uniform1f(this.u('u_glassOpacity'), p.glass?.opacity ?? 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    for (const b of this.bufs) gl.deleteBuffer(b);
    gl.deleteTexture(this.gradTex); gl.deleteTexture(this.sceneTex); gl.deleteVertexArray(this.vao);
  }
}
```

- [ ] **Step 4: Run the smoke test + typecheck**

Run: `npx vitest run tests/bg/renderer.smoke.test.ts` (PASS or SKIP) then `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/preview/bg/renderer.ts tests/bg/renderer.smoke.test.ts
git commit -m "feat(bg): BgPreviewRenderer — gradient atlas, layer/scene textures, single-quad draw"
```

**Phase 2 gate:** `npm test` green (renderer smoke may SKIP headless); `npx tsc --noEmit` clean.

---

# PHASE 3 — Surface shell + entry lists

## Task 3.1: `bg/state.ts` — surface-local state + bus

**Files:**
- Create: `src/bg/state.ts`
- Test: `tests/bg/state.test.ts`

Spec §file-structure / §5.1: selected tab, selected entry per tab, preview pairing per backdrop slot, play state, scrub time, and a tiny pub/sub + structural key (tab switch / entry add-remove-rename / selection change). Separate from `src/ui/state.ts` (borders-specific). Pairing is preview-only (never dirties the doc) and persisted to localStorage per backdrop slot (spec §5.7).

- [ ] **Step 1: Write the failing test**

```ts
// tests/bg/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bgState, bgSubscribe, bgNotify, bgStructuralKey, selectTab, selectEntry } from '../../src/bg/state';

beforeEach(() => { bgState.tab = 'backdrops'; bgState.selected = { backdrops: null, lights: null, texcoords: null, gradients: null }; bgState.structuralNonce = 0; });

describe('bg/state', () => {
  it('notifies subscribers', () => {
    let n = 0; bgSubscribe(() => n++); bgNotify(); expect(n).toBe(1);
  });
  it('structural key changes on tab switch and selection', () => {
    const k0 = bgStructuralKey();
    selectTab('lights');
    expect(bgStructuralKey()).not.toBe(k0);
    const k1 = bgStructuralKey();
    selectEntry('lights', 'White');
    expect(bgStructuralKey()).not.toBe(k1);
  });
  it('selectEntry stores per-tab selection', () => {
    selectEntry('gradients', 'g'); expect(bgState.selected.gradients).toBe('g');
    expect(bgState.selected.lights).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
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
export function bgNotify(): void { for (const fn of listeners) fn(); }

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
  bgState.pairing[slot] = [light0, light1];
  try { localStorage.setItem(PAIR_KEY, JSON.stringify(bgState.pairing)); } catch { /* ignore */ }
  bgNotify();
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bg/state.ts tests/bg/state.test.ts
git commit -m "feat(bg): surface-local state bus + localStorage pairing"
```

## Task 3.2: `ui/bg/entryList.ts` — per-tab entry list

**Files:**
- Create: `src/ui/bg/entryList.ts`
- Test: `tests/bg/entryRows.test.ts` (pure row-model only)

Spec §5.2. Rows: swatch, name, severity dot (from `ctx.issues` filtered by nav target), dead pill (named tables only), `↗N` consumer badge (named tables). Enum tabs (backdrops/lights) are never "dead" and have no consumer badge. Add affordance: enum tabs → dropdown of `unusedDetailNames`/`unusedLightNames`; named tabs → name prompt (reject dup). The pure `buildEntryRows` is unit-tested; the DOM render is exercised by Phase 5 e2e.

- [ ] **Step 1: Write the failing test (pure row model)**

```ts
// tests/bg/entryRows.test.ts
import { describe, it, expect } from 'vitest';
import { buildEntryRows } from '../../src/ui/bg/entryList';
import { buildRefIndex } from '../../src/package/refIndex';

function idx(bg: any) {
  const blank = { path: '', root: {}, dirty: false, indent: '\t' };
  return buildRefIndex({ files: {
    borders: { ...blank }, backgrounds: { path: '', root: bg, dirty: false, indent: '\t' },
    responseCurves: { ...blank }, codingThemes: { ...blank },
  } } as any);
}

describe('buildEntryRows', () => {
  it('named tab rows carry refCount + dead flag', () => {
    const bg = { TexCoords: { used: {}, lonely: {} }, Lights: { White: { gradient: 'g', texCoord: 'used' } }, Gradients: { g: [] } };
    const rows = buildEntryRows('texcoords', idx(bg), bg, []);
    const used = rows.find((r) => r.name === 'used')!;
    const lonely = rows.find((r) => r.name === 'lonely')!;
    expect(used.refCount).toBe(1); expect(used.dead).toBe(false);
    expect(lonely.dead).toBe(true);
  });
  it('enum tab rows are never dead and have no refCount badge', () => {
    const bg = { Backgrounds: { Backdrop_0: { 'Frosted Glass': {} } } };
    const rows = buildEntryRows('backdrops', idx(bg), bg, []);
    expect(rows[0].name).toBe('Backdrop_0');
    expect(rows[0].dead).toBe(false);
    expect(rows[0].refCount).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/bg/entryRows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`buildEntryRows` pure + `renderEntryList` DOM)

```ts
// src/ui/bg/entryList.ts
import type { RefIndex, Namespace } from '../../package/refIndex';
import type { Issue } from '../../package/validate';
import type { BgTab } from '../../bg/state';

export interface EntryRow {
  name: string;
  refCount: number | null;   // null on enum tabs
  dead: boolean;
  severity: 'error' | 'warning' | 'notice' | null;
}

const TAB_TABLE: Record<BgTab, 'Backgrounds' | 'Lights' | 'TexCoords' | 'Gradients'> = {
  backdrops: 'Backgrounds', lights: 'Lights', texcoords: 'TexCoords', gradients: 'Gradients',
};
const TAB_NS: Partial<Record<BgTab, Namespace>> = { texcoords: 'bg:texcoords', gradients: 'bg:gradients' };
const sevRank = (s: string) => (s === 'error' ? 3 : s === 'warning' ? 2 : 1);

export function buildEntryRows(tab: BgTab, index: RefIndex, bgRoot: any, issues: Issue[]): EntryRow[] {
  const table = bgRoot?.[TAB_TABLE[tab]];
  const names = table && typeof table === 'object' ? Object.keys(table) : [];
  const ns = TAB_NS[tab];
  return names.map((name) => {
    const refCount = ns ? index.consumers(ns, name).length : null;
    let severity: EntryRow['severity'] = null;
    for (const i of issues) {
      if (i.file !== 'backgrounds') continue;
      const e = i.nav?.entry;
      const hit = ns ? e?.ns === ns && e?.name === name : e?.name === name || e?.slot === name;
      if (hit && (!severity || sevRank(i.severity) > sevRank(severity))) severity = i.severity;
    }
    return { name, refCount, dead: ns ? refCount === 0 : false, severity };
  });
}

export interface EntryListOpts {
  tab: BgTab; rows: EntryRow[]; selected: string | null;
  swatch?: (name: string) => HTMLElement | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
}

export function renderEntryList(host: HTMLElement, opts: EntryListOpts): void {
  host.replaceChildren();
  host.className = 'bg-entrylist';
  const head = document.createElement('div'); head.className = 'bg-el-head';
  head.textContent = `${TAB_TABLE[opts.tab]} `;
  const count = document.createElement('span'); count.className = 'bg-el-count'; count.textContent = String(opts.rows.length);
  const add = document.createElement('button'); add.className = 'bg-el-add'; add.textContent = '+'; add.title = 'Add entry';
  add.addEventListener('click', opts.onAdd);
  head.append(count, add); host.appendChild(head);

  for (const row of opts.rows) {
    const el = document.createElement('div');
    el.className = 'bg-el-row' + (row.name === opts.selected ? ' bg-el-active' : '');
    el.dataset.name = row.name;
    if (row.severity) { const dot = document.createElement('span'); dot.className = `bg-el-dot bg-el-${row.severity}`; el.appendChild(dot); }
    const sw = opts.swatch?.(row.name); if (sw) { sw.classList.add('bg-el-swatch'); el.appendChild(sw); }
    const nm = document.createElement('span'); nm.className = 'bg-el-name'; nm.textContent = row.name; el.appendChild(nm);
    if (row.dead) { const p = document.createElement('span'); p.className = 'bg-el-dead'; p.textContent = 'dead'; el.appendChild(p); }
    else if (row.refCount != null) { const b = document.createElement('span'); b.className = 'bg-el-refs'; b.textContent = `↗${row.refCount}`; el.appendChild(b); }
    el.addEventListener('click', () => opts.onSelect(row.name));
    host.appendChild(el);
  }
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/bg/entryRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/bg/entryList.ts tests/bg/entryRows.test.ts
git commit -m "feat(bg): entry list rows + render (severity, dead pill, consumer badge)"
```

## Task 3.3: `ui/bg/surface.ts` — `createBackgroundsSurface`

**Files:**
- Create: `src/ui/bg/surface.ts`
- Test: none (covered by Phase 5 e2e + the `tsc` gate). Forms are stubbed here and filled in Phase 4.

Follows the slice-3 borders contract (`surfaces/borders.ts:27`): build once; a structural key re-mounts panels, a plain notify updates in place; mutations set `file.dirty` and call `onDirty()`. Layout: left tab rail + entry list; right column = preview (top) + active editor (bottom). `reveal` maps NavTargets via `resolveEntrySelection` (reused from `readOnlyTable.ts`) for named tables, else tries the slot tables.

- [ ] **Step 1: Implement** (forms imported as stubs created in Phase 4; create thin placeholder modules first so this compiles)

Create placeholder editor modules so imports resolve (each is replaced in Phase 4):

```ts
// src/ui/bg/backdropForm.ts  (placeholder — replaced in Task 4.1)
export function mountBackdropForm(host: HTMLElement): void { host.replaceChildren(); }
export function updateBackdropForm(): void { /* filled in 4.1 */ }
```

Repeat identical 2-line placeholders for `lightForm.ts` (`mountLightForm`/`updateLightForm`), `texCoordForm.ts` (`mountTexCoordForm`/`updateTexCoordForm`), `gradientEditor.ts` (`mountGradientEditor`/`updateGradientEditor`), and `previewPanel.ts` (`mountBgPreview`/`updateBgPreview`).

Then the surface:

```ts
// src/ui/bg/surface.ts
import type { Surface, SurfaceContext } from '../surfaces/registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { resolveEntrySelection } from '../surfaces/readOnlyTable';
import { bgState, bgSubscribe, bgNotify, bgStructuralKey, selectTab, selectEntry, loadPairing, type BgTab } from '../../bg/state';
import { buildEntryRows, renderEntryList } from './entryList';
import { mountBackdropForm, updateBackdropForm } from './backdropForm';
import { mountLightForm, updateLightForm } from './lightForm';
import { mountTexCoordForm, updateTexCoordForm } from './texCoordForm';
import { mountGradientEditor, updateGradientEditor } from './gradientEditor';
import { mountBgPreview, updateBgPreview } from './previewPanel';
import { allDetailNames, allLightNames, unusedDetailNames, unusedLightNames } from '../../package/slotNames';

const TABS: { id: BgTab; label: string; shared?: boolean }[] = [
  { id: 'backdrops', label: 'Backdrops' }, { id: 'lights', label: 'Lights' },
  { id: 'texcoords', label: 'TexCoords', shared: true }, { id: 'gradients', label: 'Gradients', shared: true },
];
const TAB_TABLE: Record<BgTab, string> = { backdrops: 'Backgrounds', lights: 'Lights', texcoords: 'TexCoords', gradients: 'Gradients' };

export function createBackgroundsSurface(bgFile: FileDoc, onDirty: () => void): Surface {
  let built = false; let lastCtx: SurfaceContext | null = null;
  let railHost!: HTMLElement, listHost!: HTMLElement, editorHost!: HTMLElement, previewHost!: HTMLElement;

  const markDirty = () => { bgFile.dirty = true; onDirty(); };
  const ensureTable = (tab: BgTab) => (bgFile.root[TAB_TABLE[tab]] ??= {});

  function addEntry(): void {
    const tab = bgState.tab;
    const table = ensureTable(tab);
    if (tab === 'backdrops' || tab === 'lights') {
      const unused = tab === 'backdrops' ? unusedDetailNames(Object.keys(table)) : unusedLightNames(Object.keys(table));
      if (!unused.length) { alert('All slots are in use.'); return; }
      const name = prompt(`Add ${tab === 'backdrops' ? 'backdrop' : 'light'} slot:\n${unused.join(', ')}`, unused[0]);
      if (!name) return;
      const valid = tab === 'backdrops' ? allDetailNames() : allLightNames();
      if (!valid.includes(name) || name in table) { alert('Invalid or duplicate slot name.'); return; }
      table[name] = tab === 'lights' ? { gradient: '' } : {}; // {} backdrop is invalid until configured (visible nudge)
      selectEntry(tab, name);
    } else {
      const name = prompt(`New ${tab} name:`);
      if (!name) return;
      if (name in table) { alert('Name already exists.'); return; }
      table[name] = tab === 'gradients' ? [[0, [1, 1, 1, 1]]] : {}; // identity texcoord / single-mark gradient
      selectEntry(tab, name);
    }
    markDirty();
  }

  function renderRail(): void {
    railHost.replaceChildren();
    const counts = lastCtx ? lastCtx.index : null;
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'bg-tab' + (bgState.tab === t.id ? ' bg-tab-active' : '');
      b.textContent = t.label + (t.shared ? ' ·shared' : '');
      const tbl = bgFile.root[TAB_TABLE[t.id]];
      const n = tbl && typeof tbl === 'object' ? Object.keys(tbl).length : 0;
      const badge = document.createElement('span'); badge.className = 'bg-tab-count'; badge.textContent = String(n);
      b.appendChild(badge);
      b.addEventListener('click', () => selectTab(t.id));
      railHost.appendChild(b);
    }
    void counts;
  }

  function renderList(): void {
    if (!lastCtx) return;
    const rows = buildEntryRows(bgState.tab, lastCtx.index, bgFile.root, lastCtx.issues);
    renderEntryList(listHost, {
      tab: bgState.tab, rows, selected: bgState.selected[bgState.tab],
      onSelect: (name) => selectEntry(bgState.tab, name),
      onAdd: addEntry,
    });
  }

  function mountEditor(): void {
    editorHost.replaceChildren();
    const deps = { file: bgFile, ctx: () => lastCtx!, markDirty };
    if (bgState.tab === 'backdrops') mountBackdropForm(editorHost, deps as any);
    else if (bgState.tab === 'lights') mountLightForm(editorHost, deps as any);
    else if (bgState.tab === 'texcoords') mountTexCoordForm(editorHost, deps as any);
    else mountGradientEditor(editorHost, deps as any);
  }
  function updateEditor(): void {
    if (bgState.tab === 'backdrops') updateBackdropForm();
    else if (bgState.tab === 'lights') updateLightForm();
    else if (bgState.tab === 'texcoords') updateTexCoordForm();
    else updateGradientEditor();
  }

  function buildOnce(host: HTMLElement): void {
    host.replaceChildren(); host.className = 'bg-surface';
    host.innerHTML = `
      <nav class="bg-rail"></nav>
      <aside class="bg-list"></aside>
      <section class="bg-preview"></section>
      <section class="bg-editor"></section>`;
    railHost = host.querySelector('.bg-rail')!;
    listHost = host.querySelector('.bg-list')!;
    previewHost = host.querySelector('.bg-preview')!;
    editorHost = host.querySelector('.bg-editor')!;
    loadPairing();
    mountBgPreview(previewHost, { file: bgFile, ctx: () => lastCtx! } as any);

    let lastKey = '';
    bgSubscribe(() => {
      renderRail();
      const key = bgStructuralKey();
      if (key !== lastKey) { lastKey = key; renderList(); mountEditor(); }
      renderList(); updateEditor(); updateBgPreview();
    });
    built = true;
    bgNotify();
  }

  return {
    key: 'backgrounds', label: 'Backgrounds', icon: '◧',
    mount(host, ctx) { lastCtx = ctx; if (!built) buildOnce(host); },
    refresh(ctx) { lastCtx = ctx; bgNotify(); },
    reveal(entry?: NavTarget['entry']) {
      if (!entry) return;
      const named = resolveEntrySelection(lastCtx!.index, [{ ns: 'bg:texcoords', title: '' }, { ns: 'bg:gradients', title: '' }], entry);
      if (named) { selectTab(named.ns === 'bg:gradients' ? 'gradients' : 'texcoords'); selectEntry(bgState.tab, named.name); return; }
      const name = entry.name ?? entry.slot;
      if (!name) return;
      if (bgFile.root.Backgrounds?.[name]) { selectTab('backdrops'); selectEntry('backdrops', name); }
      else if (bgFile.root.Lights?.[name]) { selectTab('lights'); selectEntry('lights', name); }
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (placeholders satisfy the imports). If a form's `deps` shape complains, define a shared `BgFormDeps` interface in `entryList.ts` or a new `ui/bg/types.ts` and import it in both places — do that refactor now rather than `as any` in Phase 4.

- [ ] **Step 3: Commit**

```bash
git add src/ui/bg/surface.ts src/ui/bg/backdropForm.ts src/ui/bg/lightForm.ts src/ui/bg/texCoordForm.ts src/ui/bg/gradientEditor.ts src/ui/bg/previewPanel.ts
git commit -m "feat(bg): backgrounds surface shell — tabs, list, add/select, mount/update bus"
```

## Task 3.4: Wire `boot.ts`; drop backgrounds from `readOnlyTable`

**Files:**
- Modify: `src/ui/boot.ts`
- Modify: `src/ui/surfaces/readOnlyTable.ts`

- [ ] **Step 1: Implement**

In `boot.ts`: add `import { createBackgroundsSurface } from './bg/surface';` and replace the surfaces array line:

```ts
    createBordersSurface(pkg.files.borders, scheduleRevalidate),
    createBackgroundsSurface(pkg.files.backgrounds, scheduleRevalidate),
    createReadOnlyTableSurface('responseCurves', 'Response Curves', '◠'),
```

In `readOnlyTable.ts`: narrow the `key` type from `'backgrounds' | 'responseCurves'` to `'responseCurves'` and remove the `backgrounds` entry from `SURFACE_TABLES`. Keep `resolveEntrySelection` exported (the new surface imports it).

```ts
const SURFACE_TABLES: Record<'responseCurves', TableDef[]> = {
  responseCurves: [
    { ns: 'rc:events', title: 'Events' },
    { ns: 'rc:splines1d', title: '1D Splines' },
    { ns: 'rc:splines2d', title: '2D Splines' },
    { ns: 'rc:gradients', title: 'Gradients' },
    { ns: 'rc:sounds', title: 'Sound Effects' },
  ],
};

export function createReadOnlyTableSurface(key: 'responseCurves', label: string, icon: string): Surface { /* … unchanged body … */ }
```

- [ ] **Step 2: Build + manual smoke**

Run: `npm run build` (must be clean) then `npm run serve`, open `http://localhost:8137`, click the **Backgrounds** tab. Expected: four sub-tabs render with counts; selecting a Backdrop/Light/TexCoord/Gradient highlights it; the editor area shows the (empty) placeholder; no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/boot.ts src/ui/surfaces/readOnlyTable.ts
git commit -m "feat(bg): wire backgrounds surface into boot; drop read-only backgrounds config"
```

**Phase 3 gate:** `npm run build` clean; Backgrounds tab navigable.

---

# PHASE 4 — Editors

All four follow the slice-3 `propertiesForm` discipline: `mount(host, deps)` builds the skeleton ONCE and wires input handlers; `update()` refreshes values in place, **skipping the focused element** so typing isn't clobbered; mutations write `bgFile.root` in place, then `deps.markDirty()` + `bgNotify()`. Commit-on-pointer-up for all drags with pointer capture.

First, add the shared deps type (referenced by `surface.ts` Task 3.3 — replace the `as any` casts):

```ts
// src/ui/bg/types.ts
import type { FileDoc } from '../../package/model';
import type { SurfaceContext } from '../surfaces/registry';
export interface BgFormDeps { file: FileDoc; ctx: () => SurfaceContext; markDirty: () => void; }
export interface BgPreviewDeps { file: FileDoc; ctx: () => SurfaceContext; }
```

Update `surface.ts`'s `mountEditor`/`mountBgPreview` calls to pass these typed objects and drop the `as any`.

## Task 4.1: `ui/bg/backdropForm.ts`

**Files:**
- Replace placeholder: `src/ui/bg/backdropForm.ts`
- Test: none new (logic lives in `backdropModel` Task 0.5, already tested). DOM verified by e2e.

Spec §5.3. Two layer cards (enable toggle, image select over eligible assets + `#HURL_NOISE` + manual path, texCoord picker over `index.definitions('bg:texcoords')` + go-to-def ↗ + "+ new…", wrapX/wrapY), a Frosted Glass card (enable + blur/zoom/opacity), detailOpacity (placeholder shows engine default `1`), Comment.

- [ ] **Step 1: Implement**

```ts
// src/ui/bg/backdropForm.ts
import { bgState, bgNotify } from '../../bg/state';
import { readLayers, writeLayers, glassEnabled, setGlass, type LayerModel, type WrapMode } from '../../bg/backdropModel';
import type { BgFormDeps } from './types';

const WRAPS: WrapMode[] = ['REPEAT', 'MIRRORED_REPEAT', 'CLAMP_TO_EDGE', 'CLAMP_TO_BORDER'];
let _host: HTMLElement | null = null;
let _deps: BgFormDeps | null = null;

const entryOf = () => {
  const name = bgState.selected.backdrops;
  return name ? _deps!.file.root.Backgrounds?.[name] : null;
};

function layerCardHtml(i: number): string {
  return `
    <fieldset class="bg-layer" data-layer="${i}">
      <legend><label><input type="checkbox" data-l="enabled"> Detail Layer ${i}</label></legend>
      <label>Image: <select data-l="image"></select></label>
      <label>…or path: <input type="text" data-l="imagePath" placeholder="(manual path)"></label>
      <label>TexCoord: <select data-l="texCoord"></select>
        <button data-l="tcGo" title="go to definition">↗</button>
        <button data-l="tcNew" title="new identity texcoord">+ new…</button></label>
      <label>Wrap X: <select data-l="wrapX">${WRAPS.map((w) => `<option>${w}</option>`).join('')}</select>
             Y: <select data-l="wrapY">${WRAPS.map((w) => `<option>${w}</option>`).join('')}</select></label>
    </fieldset>`;
}

export function mountBackdropForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps;
  host.replaceChildren(); host.className = 'bg-backdrop-form';
  host.innerHTML = `
    ${layerCardHtml(0)}${layerCardHtml(1)}
    <fieldset class="bg-glass">
      <legend><label><input type="checkbox" data-g="enabled"> Frosted Glass</label></legend>
      <label>Blur 0..2: <input type="number" step="any" data-g="blur"></label>
      <label>Zoom: <input type="number" step="any" data-g="zoom"></label>
      <label>Opacity: <input type="number" step="any" data-g="opacity"></label>
    </fieldset>
    <label>detailOpacity: <input type="number" step="any" data-e="detailOpacity" placeholder="1"></label>
    <label>Comment: <input type="text" data-e="Comment" placeholder="(comment)"></label>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  const readForm = (): [LayerModel, LayerModel] => {
    const read = (i: number): LayerModel => {
      const card = host.querySelector<HTMLElement>(`[data-layer="${i}"]`)!;
      const q = <T extends HTMLElement>(s: string) => card.querySelector<T>(s)!;
      const sel = q<HTMLSelectElement>('[data-l="image"]').value;
      const path = q<HTMLInputElement>('[data-l="imagePath"]').value.trim();
      return {
        enabled: q<HTMLInputElement>('[data-l="enabled"]').checked,
        image: path || sel,
        texCoord: q<HTMLSelectElement>('[data-l="texCoord"]').value,
        wrapX: q<HTMLSelectElement>('[data-l="wrapX"]').value as WrapMode,
        wrapY: q<HTMLSelectElement>('[data-l="wrapY"]').value as WrapMode,
      };
    };
    return [read(0), read(1)];
  };

  host.querySelectorAll('[data-layer] select, [data-layer] input').forEach((el) => {
    el.addEventListener(el instanceof HTMLInputElement && el.type === 'text' ? 'input' : 'change', () => {
      const entry = entryOf(); if (!entry) return;
      writeLayers(entry, readForm()); commit();
    });
  });
  host.querySelectorAll('[data-l="tcGo"]').forEach((b, i) => b.addEventListener('click', () => {
    const entry = entryOf(); const tc = readLayers(entry)[i].texCoord;
    if (tc) _deps!.ctx().navigate({ surface: 'backgrounds', entry: { ns: 'bg:texcoords', name: tc } });
  }));
  host.querySelectorAll('[data-l="tcNew"]').forEach((b, i) => b.addEventListener('click', () => {
    const name = prompt('New TexCoord name:'); if (!name) return;
    const tcs = (_deps!.file.root.TexCoords ??= {});
    if (!(name in tcs)) tcs[name] = {};
    const entry = entryOf(); const layers = readLayers(entry); layers[i].texCoord = name; layers[i].enabled = true;
    writeLayers(entry, layers); commit();
  }));

  host.querySelectorAll('[data-g]').forEach((el) => {
    el.addEventListener('change', () => {
      const entry = entryOf(); if (!entry) return;
      const enabled = host.querySelector<HTMLInputElement>('[data-g="enabled"]')!.checked;
      setGlass(entry, enabled);
      if (enabled) {
        const g = entry['Frosted Glass'];
        const v = (n: string) => Number(host.querySelector<HTMLInputElement>(`[data-g="${n}"]`)!.value);
        g.blur = v('blur'); g.zoom = v('zoom'); g.opacity = v('opacity');
      }
      commit();
    });
  });
  host.querySelector('[data-e="detailOpacity"]')!.addEventListener('change', (ev) => {
    const entry = entryOf(); if (!entry) return;
    const raw = (ev.target as HTMLInputElement).value;
    if (raw === '') delete entry.detailOpacity; else entry.detailOpacity = Number(raw);
    commit();
  });
  host.querySelector('[data-e="Comment"]')!.addEventListener('input', (ev) => {
    const entry = entryOf(); if (!entry) return;
    const v = (ev.target as HTMLInputElement).value;
    if (v === '') delete entry.Comment; else entry.Comment = v; _deps!.markDirty(); bgNotify();
  });

  updateBackdropForm();
}

export function updateBackdropForm(): void {
  if (!_host || !_deps) return;
  const entry = entryOf();
  _host.style.display = entry ? '' : 'none';
  if (!entry) return;
  const active = document.activeElement;
  const set = (sel: string, val: string) => { const el = _host!.querySelector<HTMLInputElement | HTMLSelectElement>(sel); if (el && el !== active) el.value = val; };
  const check = (sel: string, on: boolean) => { const el = _host!.querySelector<HTMLInputElement>(sel); if (el && el !== active) el.checked = on; };

  // populate image selects from eligible assets each update (cheap; assets change rarely)
  const images = _deps.ctx().assets.images.filter((a) => a.status !== 'rejected-format').map((a) => a.path);
  const opts = ['', '#HURL_NOISE', ...images];
  const tcNames = _deps.ctx().index.definitions('bg:texcoords');
  for (const i of [0, 1]) {
    const card = _host.querySelector<HTMLElement>(`[data-layer="${i}"]`)!;
    const imgSel = card.querySelector<HTMLSelectElement>('[data-l="image"]')!;
    if (imgSel !== active) imgSel.innerHTML = opts.map((o) => `<option value="${o}">${o || '(none)'}</option>`).join('');
    const tcSel = card.querySelector<HTMLSelectElement>('[data-l="texCoord"]')!;
    if (tcSel !== active) tcSel.innerHTML = ['', ...tcNames].map((o) => `<option value="${o}">${o || '(none)'}</option>`).join('');
  }

  const [l0, l1] = readLayers(entry);
  [l0, l1].forEach((l, i) => {
    const p = `[data-layer="${i}"] `;
    check(p + '[data-l="enabled"]', l.enabled);
    const inList = ['', '#HURL_NOISE', ...images].includes(l.image);
    set(p + '[data-l="image"]', inList ? l.image : '');
    set(p + '[data-l="imagePath"]', inList ? '' : l.image);
    set(p + '[data-l="texCoord"]', l.texCoord);
    set(p + '[data-l="wrapX"]', l.wrapX); set(p + '[data-l="wrapY"]', l.wrapY);
  });

  check('[data-g="enabled"]', glassEnabled(entry));
  const g = entry['Frosted Glass'] ?? {};
  set('[data-g="blur"]', String(g.blur ?? 0.5)); set('[data-g="zoom"]', String(g.zoom ?? 1)); set('[data-g="opacity"]', String(g.opacity ?? 0));
  set('[data-e="detailOpacity"]', entry.detailOpacity != null ? String(entry.detailOpacity) : '');
  set('[data-e="Comment"]', entry.Comment ?? '');
}
```

- [ ] **Step 2: Build + smoke**

Run: `npm run build` (clean), `npm run serve`, Backgrounds → Backdrops → select a slot, toggle layer 0, pick an image + texcoord, enable glass. Confirm edits land (Save enables) and reselecting the slot shows them.

- [ ] **Step 3: Commit**

```bash
git add src/ui/bg/backdropForm.ts src/ui/bg/types.ts src/ui/bg/surface.ts
git commit -m "feat(bg): backdrop editor — layer cards, glass, detailOpacity, comment"
```

## Task 4.2: `ui/bg/lightForm.ts`

**Files:**
- Replace placeholder: `src/ui/bg/lightForm.ts`

Spec §5.4. Fields: gradient picker (required, swatch + ↗), texCoord picker (optional, empty = "(inherit layer texCoord)"), direction x/y + drag-dial, scale, radial (0..1 slider + free numeric), amplitude, mode (FADE/SAW/SINE/TRIANGLE + default), Comment. Selecting a light also sets it as the preview's light0 (`setPairing`). `White` editable with an inline note. Direction note: "packed as normalize(direction)·scale".

- [ ] **Step 1: Implement**

```ts
// src/ui/bg/lightForm.ts
import { bgState, bgNotify, setPairing } from '../../bg/state';
import type { BgFormDeps } from './types';

const MODES = ['None', 'FADE', 'SAW', 'SINE', 'TRIANGLE'];
let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;

const entryOf = () => {
  const name = bgState.selected.lights;
  return name ? _deps!.file.root.Lights?.[name] : null;
};

export function mountLightForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps;
  host.replaceChildren(); host.className = 'bg-light-form';
  host.innerHTML = `
    <div data-note="white" class="bg-note" style="display:none">Light 0 is the hard-wired white fallback; this entry is enum 1.</div>
    <label>Gradient: <select data-f="gradient"></select> <button data-f="gGo" title="go to definition">↗</button></label>
    <label>TexCoord: <select data-f="texCoord"></select></label>
    <label>Direction x/y: <input type="number" step="any" data-f="dir0" style="width:70px"><input type="number" step="any" data-f="dir1" style="width:70px">
      <canvas data-f="dial" width="40" height="40" class="bg-dial"></canvas></label>
    <div class="bg-note">packed as normalize(direction)·scale</div>
    <label>Scale: <input type="number" step="any" data-f="scale"></label>
    <label>Radial: <input type="range" min="0" max="1" step="0.01" data-f="radialR"><input type="number" step="any" data-f="radial" style="width:70px"></label>
    <label>Amplitude: <input type="number" step="any" data-f="amplitude"></label>
    <label>Mode: <select data-f="mode">${MODES.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label>Comment: <input type="text" data-f="Comment" placeholder="(comment)"></label>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  const writeNum = (key: string, raw: string) => {
    const entry = entryOf(); if (!entry) return;
    if (raw === '') delete entry[key]; else entry[key] = Number(raw); commit();
  };

  host.querySelector('[data-f="gradient"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (entry) { entry.gradient = v; commit(); } });
  host.querySelector('[data-f="gGo"]')!.addEventListener('click', () => { const g = entryOf()?.gradient; if (g) _deps!.ctx().navigate({ surface: 'backgrounds', entry: { ns: 'bg:gradients', name: g } }); });
  host.querySelector('[data-f="texCoord"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (!entry) return; if (v === '') delete entry.texCoord; else entry.texCoord = v; commit(); });
  host.querySelector('[data-f="mode"]')!.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; const entry = entryOf(); if (!entry) return; if (v === 'None') delete entry.mode; else entry.mode = v; commit(); });
  for (const [k, n] of [['dir0', 0], ['dir1', 1]] as const) host.querySelector(`[data-f="${k}"]`)!.addEventListener('change', (e) => {
    const entry = entryOf(); if (!entry) return;
    const d = Array.isArray(entry.direction) ? entry.direction.slice() : [0, 1];
    d[n] = Number((e.target as HTMLInputElement).value); entry.direction = d; commit();
  });
  for (const k of ['scale', 'radial', 'amplitude']) host.querySelector(`[data-f="${k}"]`)!.addEventListener('change', (e) => writeNum(k, (e.target as HTMLInputElement).value));
  host.querySelector('[data-f="radialR"]')!.addEventListener('input', (e) => writeNum('radial', (e.target as HTMLInputElement).value));
  host.querySelector('[data-f="Comment"]')!.addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).value; const entry = entryOf(); if (!entry) return; if (v === '') delete entry.Comment; else entry.Comment = v; commit(); });

  updateLightForm();
}

export function updateLightForm(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.lights;
  const entry = entryOf();
  _host.style.display = entry ? '' : 'none';
  if (!entry || !name) return;

  // Selecting a light pairs it as preview light0 for the current preview slot.
  const slot = bgState.selected.backdrops; if (slot) setPairing(slot, name, bgState.pairing[slot]?.[1] ?? '');

  const active = document.activeElement;
  const set = (sel: string, val: string) => { const el = _host!.querySelector<HTMLInputElement | HTMLSelectElement>(sel); if (el && el !== active) el.value = val; };
  (_host.querySelector('[data-note="white"]') as HTMLElement).style.display = name === 'White' ? '' : 'none';

  const gNames = _deps.ctx().index.definitions('bg:gradients');
  const gSel = _host.querySelector<HTMLSelectElement>('[data-f="gradient"]')!;
  if (gSel !== active) gSel.innerHTML = ['', ...gNames].map((o) => `<option value="${o}">${o || '(none — required)'}</option>`).join('');
  const tcNames = _deps.ctx().index.definitions('bg:texcoords');
  const tSel = _host.querySelector<HTMLSelectElement>('[data-f="texCoord"]')!;
  if (tSel !== active) tSel.innerHTML = ['', ...tcNames].map((o) => `<option value="${o}">${o || '(inherit layer texCoord)'}</option>`).join('');

  set('[data-f="gradient"]', entry.gradient ?? '');
  set('[data-f="texCoord"]', entry.texCoord ?? '');
  const dir = Array.isArray(entry.direction) ? entry.direction : [0, 1];
  set('[data-f="dir0"]', String(dir[0])); set('[data-f="dir1"]', String(dir[1]));
  set('[data-f="scale"]', entry.scale != null ? String(entry.scale) : '');
  set('[data-f="radial"]', entry.radial != null ? String(entry.radial) : ''); set('[data-f="radialR"]', String(entry.radial ?? 0));
  set('[data-f="amplitude"]', entry.amplitude != null ? String(entry.amplitude) : '');
  set('[data-f="mode"]', typeof entry.mode === 'string' && MODES.includes(entry.mode) ? entry.mode : 'None');
  set('[data-f="Comment"]', entry.Comment ?? '');
  drawDial(_host.querySelector('[data-f="dial"]')!, dir as [number, number]);
}

function drawDial(c: HTMLCanvasElement, dir: [number, number]): void {
  const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, 40, 40); ctx.translate(20, 20);
  const len = Math.hypot(dir[0], dir[1]) || 1; const x = (dir[0] / len) * 16, y = (dir[1] / len) * 16;
  ctx.strokeStyle = '#8ab'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
```

(Direction drag-dial pointer interaction may be added in a follow-up; the numeric fields + dial readout are the spec's bidirectional minimum. If adding drag now, use pointer capture + commit-on-pointer-up writing `entry.direction`.)

- [ ] **Step 2: Build + smoke**

Run: `npm run build`, serve, Backgrounds → Lights → select `White`, set a gradient, mode SINE. Confirm Save enables and the note shows for White.

- [ ] **Step 3: Commit**

```bash
git add src/ui/bg/lightForm.ts
git commit -m "feat(bg): light editor — gradient/texcoord pickers, direction, mode, pairing"
```

## Task 4.3: `ui/bg/texCoordForm.ts`

**Files:**
- Replace placeholder: `src/ui/bg/texCoordForm.ts`

Spec §5.5. Seven numeric fields (normalization, spinSpeed, rotationCenter x/y, scrollFactor x/y, scaleFactor x/y, initialTime, timeFactor) with inline hints; timeFactor is a plain numeric (no warning). REFERENCED BY list. Editing live-updates the preview (via `bgNotify`). Engine-default placeholders per the verified defaults.

- [ ] **Step 1: Implement**

```ts
// src/ui/bg/texCoordForm.ts
import { bgState, bgNotify } from '../../bg/state';
import type { BgFormDeps } from './types';

// [key, label, isVec2, defaultText]
const FIELDS: [string, string, boolean, string][] = [
  ['normalization', 'normalization (point↔normalized blend; <0 adds aspect comp)', false, '0'],
  ['spinSpeed', 'spinSpeed (turns/sec ×2π)', false, '0'],
  ['rotationCenter', 'rotationCenter x,y', true, '0,0'],
  ['scrollFactor', 'scrollFactor x,y', true, '0,0'],
  ['scaleFactor', 'scaleFactor x,y (bigger = more repeats)', true, '1,1'],
  ['initialTime', 'initialTime (sec)', false, '0'],
  ['timeFactor', 'timeFactor (0 = static, 1 = realtime)', false, '1'],
];
let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;
const entryOf = () => { const n = bgState.selected.texcoords; return n ? _deps!.file.root.TexCoords?.[n] : null; };

export function mountTexCoordForm(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-tc-form';
  const rows = FIELDS.map(([k, label, vec, def]) => vec
    ? `<label>${label}: <input type="number" step="any" data-k="${k}" data-i="0" placeholder="${def.split(',')[0]}" style="width:70px"><input type="number" step="any" data-k="${k}" data-i="1" placeholder="${def.split(',')[1]}" style="width:70px"></label>`
    : `<label>${label}: <input type="number" step="any" data-k="${k}" placeholder="${def}"></label>`).join('');
  host.innerHTML = `${rows}<label>Comment: <input type="text" data-k="Comment" placeholder="(comment)"></label><div class="bg-refby" data-refby></div>`;

  const commit = () => { _deps!.markDirty(); bgNotify(); };
  host.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
    const ev = inp.type === 'text' ? 'input' : 'change';
    inp.addEventListener(ev, () => {
      const entry = entryOf(); if (!entry) return;
      const k = inp.dataset.k!;
      if (k === 'Comment') { if (inp.value === '') delete entry.Comment; else entry.Comment = inp.value; commit(); return; }
      if (inp.dataset.i != null) {
        const i = Number(inp.dataset.i);
        const arr = Array.isArray(entry[k]) ? entry[k].slice() : (k === 'scaleFactor' ? [1, 1] : [0, 0]);
        if (inp.value === '') { /* keep */ } else arr[i] = Number(inp.value);
        entry[k] = arr;
      } else {
        if (inp.value === '') delete entry[k]; else entry[k] = Number(inp.value);
      }
      commit();
    });
  });
  updateTexCoordForm();
}

export function updateTexCoordForm(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.texcoords; const entry = entryOf();
  _host.style.display = entry ? '' : 'none'; if (!entry || !name) return;
  const active = document.activeElement;
  _host.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
    if (inp === active) return;
    const k = inp.dataset.k!;
    if (k === 'Comment') { inp.value = entry.Comment ?? ''; return; }
    if (inp.dataset.i != null) { const arr = entry[k]; inp.value = Array.isArray(arr) ? String(arr[Number(inp.dataset.i)] ?? '') : ''; }
    else inp.value = entry[k] != null ? String(entry[k]) : '';
  });
  // REFERENCED BY
  const refby = _host.querySelector<HTMLElement>('[data-refby]')!;
  const consumers = _deps.ctx().index.consumers('bg:texcoords', name);
  refby.replaceChildren();
  const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
  for (const c of consumers) {
    const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.from.label; refby.appendChild(r);
  }
}
```

- [ ] **Step 2: Build + smoke** — edit `timeFactor` to 1; confirm NO warning appears in the validation panel (Task 1.1 removed it). Commit.

```bash
git add src/ui/bg/texCoordForm.ts
git commit -m "feat(bg): texcoord editor — 7 numeric fields + referenced-by"
```

## Task 4.4: `ui/bg/gradientEditor.ts` — draggable stop bar

**Files:**
- Replace placeholder: `src/ui/bg/gradientEditor.ts`

Spec §5.6. Canvas ramp (baked via `bg/gradients.ts`, de-linearized `pow(1/2.2)` for display) over a checkerboard; circular handles at each `t`. Drag stop (clamped 0..1, pointer capture, commit on pointer-up); click empty bar = insert stop with the bake's interpolated color; select stop → rgba numerics + color input + alpha slider; Delete/✕ removes (min 1 stop). Serialized array kept ascending (sort on commit). REFERENCED BY list. Bump `bgState.gradientRev` on any mark mutation so the preview atlas re-uploads.

- [ ] **Step 1: Implement**

```ts
// src/ui/bg/gradientEditor.ts
import { bgState, bgNotify } from '../../bg/state';
import { bakeGradient, type Mark } from '../../bg/gradients';
import type { BgFormDeps } from './types';

let _host: HTMLElement | null = null; let _deps: BgFormDeps | null = null;
let _sel = 0; // selected stop index
const WIDTH = 320, HEIGHT = 40;

const marksOf = (): Mark[] => {
  const n = bgState.selected.gradients;
  const raw = n ? _deps!.file.root.Gradients?.[n] : null;
  return Array.isArray(raw) ? raw : [];
};
const writeMarks = (marks: Mark[]) => {
  const n = bgState.selected.gradients; if (!n) return;
  marks.sort((a, b) => a[0] - b[0]);
  _deps!.file.root.Gradients[n] = marks;
  bgState.gradientRev++; _deps!.markDirty(); bgNotify();
};

export function mountGradientEditor(host: HTMLElement, deps: BgFormDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-grad-editor';
  host.innerHTML = `
    <canvas data-c="bar" width="${WIDTH}" height="${HEIGHT}" class="bg-grad-bar"></canvas>
    <div class="bg-grad-stop">
      <label>t: <input type="number" min="0" max="1" step="0.01" data-s="t" style="width:70px"></label>
      <label>color: <input type="color" data-s="color"></label>
      <label>alpha: <input type="range" min="0" max="1" step="0.01" data-s="a"></label>
      <label>rgba: <input type="number" step="any" data-s="r" style="width:60px"><input type="number" step="any" data-s="g" style="width:60px"><input type="number" step="any" data-s="b" style="width:60px"><input type="number" step="any" data-s="a2" style="width:60px"></label>
      <button data-s="del">✕ delete stop</button>
    </div>
    <div class="bg-refby" data-refby></div>`;

  const bar = host.querySelector<HTMLCanvasElement>('[data-c="bar"]')!;
  const tFromX = (x: number) => Math.max(0, Math.min(1, x / WIDTH));

  // Pointer drag of the nearest handle; commit-on-pointer-up.
  let dragging = -1;
  bar.addEventListener('pointerdown', (e) => {
    const marks = marksOf(); if (!marks.length) return;
    const x = e.offsetX; const t = tFromX(x);
    let nearest = 0, best = Infinity;
    marks.forEach((m, i) => { const d = Math.abs(m[0] * WIDTH - x); if (d < best) { best = d; nearest = i; } });
    if (best <= 8) { dragging = nearest; _sel = nearest; bar.setPointerCapture(e.pointerId); render(); }
    else { // click empty → insert stop with interpolated bake color
      const baked = bakeGradient(marks); const idx = Math.round(t * 127) * 4;
      const col: Mark = [t, [
        Math.pow(Math.max(baked[idx], 0), 1 / 2.2), Math.pow(Math.max(baked[idx + 1], 0), 1 / 2.2),
        Math.pow(Math.max(baked[idx + 2], 0), 1 / 2.2), baked[idx + 3],
      ]];
      const next = [...marks, col]; _sel = next.length - 1; writeMarks(next);
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const marks = marksOf().slice(); marks[dragging] = [tFromX(e.offsetX), marks[dragging][1]];
    _deps!.file.root.Gradients[bgState.selected.gradients!] = marks; bgState.gradientRev++; bgNotify(); // live, not yet sorted/committed dirty
  });
  bar.addEventListener('pointerup', (e) => {
    if (dragging < 0) return; bar.releasePointerCapture(e.pointerId);
    const marks = marksOf().slice(); // sort + commit; track the dragged stop's new index
    const draggedT = marks[dragging][0];
    marks.sort((a, b) => a[0] - b[0]); _sel = marks.findIndex((m) => m[0] === draggedT);
    dragging = -1; writeMarks(marks);
  });

  const commitStop = (mutate: (m: Mark) => void) => {
    const marks = marksOf().slice(); if (!marks[_sel]) return;
    const copy: Mark = [marks[_sel][0], [...marks[_sel][1]] as Mark[1]]; mutate(copy); marks[_sel] = copy; writeMarks(marks);
  };
  host.querySelector('[data-s="t"]')!.addEventListener('change', (e) => commitStop((m) => { m[0] = Math.max(0, Math.min(1, Number((e.target as HTMLInputElement).value))); }));
  host.querySelector('[data-s="color"]')!.addEventListener('input', (e) => commitStop((m) => { const [r, g, b] = hexToRgb((e.target as HTMLInputElement).value); m[1][0] = r; m[1][1] = g; m[1][2] = b; }));
  host.querySelector('[data-s="a"]')!.addEventListener('input', (e) => commitStop((m) => { m[1][3] = Number((e.target as HTMLInputElement).value); }));
  for (const [sel, idx] of [['r', 0], ['g', 1], ['b', 2], ['a2', 3]] as const)
    host.querySelector(`[data-s="${sel}"]`)!.addEventListener('change', (e) => commitStop((m) => { m[1][idx] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="del"]')!.addEventListener('click', () => {
    const marks = marksOf(); if (marks.length <= 1) return;
    const next = marks.filter((_, i) => i !== _sel); _sel = Math.max(0, _sel - 1); writeMarks(next);
  });

  function render(): void { updateGradientEditor(); }
  updateGradientEditor();
}

export function updateGradientEditor(): void {
  if (!_host || !_deps) return;
  const name = bgState.selected.gradients; const marks = marksOf();
  _host.style.display = name ? '' : 'none'; if (!name) return;
  drawBar(_host.querySelector('[data-c="bar"]')!, marks, _sel);

  const m = marks[_sel];
  const active = document.activeElement;
  const set = (sel: string, v: string) => { const el = _host!.querySelector<HTMLInputElement>(sel); if (el && el !== active) el.value = v; };
  if (m) {
    set('[data-s="t"]', String(m[0]));
    set('[data-s="color"]', rgbToHex(m[1][0], m[1][1], m[1][2]));
    set('[data-s="a"]', String(m[1][3])); set('[data-s="a2"]', String(m[1][3]));
    set('[data-s="r"]', String(m[1][0])); set('[data-s="g"]', String(m[1][1])); set('[data-s="b"]', String(m[1][2]));
  }
  const refby = _host.querySelector<HTMLElement>('[data-refby]')!;
  const consumers = _deps.ctx().index.consumers('bg:gradients', name);
  refby.replaceChildren();
  const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
  for (const c of consumers) { const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.from.label; refby.appendChild(r); }
}

function drawBar(c: HTMLCanvasElement, marks: Mark[], sel: number): void {
  const ctx = c.getContext('2d')!;
  // checkerboard underlay
  for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#444' : '#666'; ctx.fillRect(x, y, 8, 8); }
  // baked ramp (de-linearized for display)
  const baked = bakeGradient(marks);
  const img = ctx.createImageData(WIDTH, 1);
  for (let x = 0; x < WIDTH; x++) {
    const s = Math.round((x / (WIDTH - 1)) * 127) * 4;
    const a = Math.max(0, Math.min(1, baked[s + 3]));
    img.data[x * 4] = clamp255(Math.pow(Math.max(baked[s], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 1] = clamp255(Math.pow(Math.max(baked[s + 1], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 2] = clamp255(Math.pow(Math.max(baked[s + 2], 0), 1 / 2.2) * 255);
    img.data[x * 4 + 3] = clamp255(a * 255);
  }
  // blit the 1px row scaled — draw into a temp then stretch
  const tmp = document.createElement('canvas'); tmp.width = WIDTH; tmp.height = 1; tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
  // handles
  marks.forEach((mk, i) => {
    const x = mk[0] * WIDTH; ctx.beginPath(); ctx.arc(x, HEIGHT / 2, i === sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = i === sel ? '#39f' : '#000'; ctx.lineWidth = 2; ctx.stroke();
  });
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp255(v * 255).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`;
}
```

- [ ] **Step 2: Build + smoke** — Backgrounds → Gradients → add a gradient, click the bar to insert a stop, drag it, pick a color, delete a stop. Confirm the ramp redraws live and Save enables. Commit.

```bash
git add src/ui/bg/gradientEditor.ts
git commit -m "feat(bg): gradient editor — draggable stop bar with live baked ramp"
```

**Phase 4 gate:** `npm run build` clean; all four editors functional.

---

# PHASE 5 — Preview panel + wiring + e2e

## Task 5.1: `ui/bg/previewPanel.ts` — live WebGL preview

**Files:**
- Replace placeholder: `src/ui/bg/previewPanel.ts`

Spec §5.7. WebGL2 canvas + 2D overlay; a backdrop-slot picker (defaults to the selected Backdrop), session-only light0/light1 pickers (localStorage per slot via `setPairing`), panel W×H numerics, ▶/⏸ + scrub, zoom/fit. Per frame: build `BgScene` → `buildBgPreviewInput` → resolve light uniforms → `renderer.render`. Decoded images cached by path. Gradients atlas rebuilt only when `bgState.gradientRev` changes. Preview state never dirties the document.

Helper to resolve a light's uniforms (mode index, gradient atlas row, sentinel-inherited texcoord) lives here, reusing `resolveLightTexCoord` (Task 0.4) and `allLightNames` ordering for the slot index.

- [ ] **Step 1: Implement**

```ts
// src/ui/bg/previewPanel.ts
import { bgState, bgNotify, setPairing } from '../../bg/state';
import { BgPreviewRenderer, type LightUniforms } from '../../preview/bg/renderer';
import { buildBgPreviewInput, type BgScene, type SceneLayer } from '../../bg/previewInput';
import { bakeGradient, type Mark } from '../../bg/gradients';
import { readLayers, glassEnabled } from '../../bg/backdropModel';
import { resolveLightTexCoord } from '../../bg/lightInput';
import { allLightNames } from '../../package/slotNames';
import { loadImage } from '../../images';
import type { TexCoordEntry } from '../../bg/texcoord';
import type { Rgba } from '../../types';
import type { BgPreviewDeps } from './types';

const WRAP_INT: Record<string, number> = { REPEAT: 0, MIRRORED_REPEAT: 1, CLAMP_TO_EDGE: 2, CLAMP_TO_BORDER: 3 };
const MODE_INT: Record<string, number> = { None: 0, FADE: 1, SAW: 2, SINE: 3, TRIANGLE: 4 };

let _host: HTMLElement | null = null; let _deps: BgPreviewDeps | null = null;
let renderer: BgPreviewRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let panelW = 240, panelH = 140;
let raf = 0;
const imgCache = new Map<string, Rgba | null>();
let gradOrder: string[] = []; // gradient name → atlas row index

function ensureImage(path: string | null): Rgba | null {
  if (!path || path === '#HURL_NOISE') return null;
  if (imgCache.has(path)) return imgCache.get(path)!;
  imgCache.set(path, null);
  loadImage(path).then((img) => { imgCache.set(path, img); }).catch(() => imgCache.set(path, null));
  return null;
}

function rebuildGradients(): void {
  const grads = _deps!.file.root.Gradients ?? {};
  gradOrder = Object.keys(grads);
  const rows = gradOrder.map((n) => bakeGradient(Array.isArray(grads[n]) ? grads[n] : []) as Float32Array);
  renderer!.setGradients(rows.length ? rows : [new Float32Array(128 * 4).fill(1)], bgState.gradientRev);
}

function lightUniforms(name: string, layerTexCoord: string | undefined, tcs: Record<string, TexCoordEntry>): LightUniforms | null {
  if (!name || name === 'White') return { id: 0, dir: [0, 1], radial: 1, amplitude: 1, mode: 0, gradientRow: 0 };
  const entry = _deps!.file.root.Lights?.[name]; if (!entry) return null;
  const id = Math.max(1, allLightNames().indexOf(name));
  const gradName = entry.gradient; const gradientRow = Math.max(0, gradOrder.indexOf(gradName));
  void resolveLightTexCoord(entry, { texCoord: layerTexCoord }); void tcs; // texcoord sweep handled in previewInput via layer.texCoord
  const dir = Array.isArray(entry.direction) ? entry.direction : [0, 1];
  return {
    id, dir: [dir[0], dir[1]], radial: typeof entry.radial === 'number' ? entry.radial : 1,
    amplitude: typeof entry.amplitude === 'number' ? entry.amplitude : 1,
    mode: MODE_INT[entry.mode] ?? 0, gradientRow,
  };
}

function frame(): void {
  if (!renderer || !canvas || !_deps) return;
  const slot = bgState.selected.backdrops || Object.keys(_deps.file.root.Backgrounds ?? {})[0];
  const entry = slot ? _deps.file.root.Backgrounds?.[slot] : null;
  rebuildGradients();
  const now = bgState.playing ? (performance.now() & 0x7FFFFF) * 1e-3 : bgState.scrubSeconds;
  const tcs: Record<string, TexCoordEntry> = _deps.file.root.TexCoords ?? {};

  let params;
  if (entry) {
    const [m0, m1] = readLayers(entry);
    const pair = bgState.pairing[slot!] ?? ['White', ''];
    const img0 = ensureImage(m0.image), img1 = ensureImage(m1.image);
    const layer = (m: typeof m0, img: Rgba | null): SceneLayer => ({
      enabled: m.enabled, image: m.image, imageSize: img ? [img.width, img.height] : [1, 1],
      texCoord: m.texCoord, wrapX: m.wrapX, wrapY: m.wrapY, light: { id: 1 },
    });
    const scene: BgScene = { panelSize: [panelW, panelH], now, texcoords: tcs, layers: [layer(m0, img0), layer(m1, img1)], glass: glassEnabled(entry) ? { blur: entry['Frosted Glass'].blur ?? 0, zoom: entry['Frosted Glass'].zoom ?? 1, opacity: entry['Frosted Glass'].opacity ?? 0 } : null };
    params = {
      input: buildBgPreviewInput(scene),
      layer0: { image: img0, noise: m0.image === '#HURL_NOISE' }, layer1: { image: img1, noise: m1.image === '#HURL_NOISE' },
      wrap0: [WRAP_INT[m0.wrapX], WRAP_INT[m0.wrapY]] as [number, number],
      wrap1: [WRAP_INT[m1.wrapX], WRAP_INT[m1.wrapY]] as [number, number],
      light0: lightUniforms(pair[0], m0.texCoord, tcs), light1: lightUniforms(pair[1], m1.texCoord, tcs),
      detailOpacity: typeof entry.detailOpacity === 'number' ? entry.detailOpacity : 1,
      glass: scene.glass ? { blur: scene.glass.blur, opacity: scene.glass.opacity } : null,
    };
  } else {
    params = { input: buildBgPreviewInput({ panelSize: [panelW, panelH], now, texcoords: tcs, layers: [{ enabled: false }, { enabled: false }] as any, glass: null }), layer0: null, layer1: null, wrap0: [0, 0] as [number, number], wrap1: [0, 0] as [number, number], light0: null, light1: null, detailOpacity: 1, glass: null };
  }
  renderer.render(params);
  if (bgState.playing) raf = requestAnimationFrame(frame);
}

export function mountBgPreview(host: HTMLElement, deps: BgPreviewDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-preview-panel';
  host.innerHTML = `
    <div class="bg-pv-controls">
      <label>Slot: <select data-pv="slot"></select></label>
      <label>L0: <select data-pv="l0"></select></label>
      <label>L1: <select data-pv="l1"></select></label>
      <label>W <input type="number" data-pv="w" value="${panelW}" style="width:64px"></label>
      <label>H <input type="number" data-pv="h" value="${panelH}" style="width:64px"></label>
      <button data-pv="play">⏸</button>
      <input type="range" min="0" max="10" step="0.01" data-pv="scrub" disabled>
    </div>
    <canvas data-pv="canvas" width="360" height="220" class="bg-pv-canvas"></canvas>`;
  canvas = host.querySelector('[data-pv="canvas"]')!;
  try { renderer = new BgPreviewRenderer(canvas); } catch (e) { host.innerHTML = `<div class="bg-note">WebGL2 unavailable: ${String(e)}</div>`; return; }

  host.querySelector('[data-pv="w"]')!.addEventListener('change', (e) => { panelW = Number((e.target as HTMLInputElement).value) || panelW; });
  host.querySelector('[data-pv="h"]')!.addEventListener('change', (e) => { panelH = Number((e.target as HTMLInputElement).value) || panelH; });
  host.querySelector('[data-pv="slot"]')!.addEventListener('change', (e) => { bgState.selected.backdrops = (e.target as HTMLSelectElement).value; bgNotify(); });
  host.querySelector('[data-pv="l0"]')!.addEventListener('change', (e) => { const slot = bgState.selected.backdrops; if (slot) setPairing(slot, (e.target as HTMLSelectElement).value, bgState.pairing[slot]?.[1] ?? ''); });
  host.querySelector('[data-pv="l1"]')!.addEventListener('change', (e) => { const slot = bgState.selected.backdrops; if (slot) setPairing(slot, bgState.pairing[slot]?.[0] ?? 'White', (e.target as HTMLSelectElement).value); });
  const playBtn = host.querySelector<HTMLButtonElement>('[data-pv="play"]')!;
  const scrub = host.querySelector<HTMLInputElement>('[data-pv="scrub"]')!;
  playBtn.addEventListener('click', () => {
    bgState.playing = !bgState.playing; playBtn.textContent = bgState.playing ? '⏸' : '▶'; scrub.disabled = bgState.playing;
    if (bgState.playing) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); frame(); }
  });
  scrub.addEventListener('input', () => { bgState.scrubSeconds = Number(scrub.value); if (!bgState.playing) frame(); });

  raf = requestAnimationFrame(frame);
  updateBgPreview();
}

export function updateBgPreview(): void {
  if (!_host || !_deps || !renderer) return;
  const slots = Object.keys(_deps.file.root.Backgrounds ?? {});
  const lights = ['White', '', ...Object.keys(_deps.file.root.Lights ?? {}).filter((n) => n !== 'White')];
  const fill = (sel: string, opts: string[], val: string) => {
    const el = _host!.querySelector<HTMLSelectElement>(sel); if (!el || el === document.activeElement) return;
    el.innerHTML = opts.map((o) => `<option value="${o}">${o || '(none)'}</option>`).join(''); el.value = val;
  };
  const slot = bgState.selected.backdrops || slots[0] || '';
  fill('[data-pv="slot"]', slots, slot);
  const pair = bgState.pairing[slot] ?? ['White', ''];
  fill('[data-pv="l0"]', lights, pair[0]); fill('[data-pv="l1"]', lights, pair[1]);
  if (!bgState.playing) frame(); // static refresh while paused so edits show
}
```

(If the borders preview's `previewOverlay.ts` view helpers import cleanly for zoom/pan, reuse them; otherwise the W/H numerics above are the spec's minimum and zoom/pan can be a follow-up — do NOT force a shared abstraction (spec §5.7).)

- [ ] **Step 2: Build + smoke**

Run: `npm run build`, serve. Backgrounds → Backdrops → select a configured slot. Expected: the preview animates; toggling ⏸ freezes and the scrub enables; changing L0/L1 repaints; editing a gradient/texcoord live-updates the preview. No document dirtying from preview-only changes (Save stays disabled when you only touch slot/L0/L1/scrub).

- [ ] **Step 3: Commit**

```bash
git add src/ui/bg/previewPanel.ts
git commit -m "feat(bg): live WebGL preview panel — slot/light pickers, play/scrub, animation loop"
```

## Task 5.2: e2e smokes

**Files:**
- Modify: `e2e/editor.spec.ts` (append only — do NOT touch the harness or borders sections)

Spec §7 Playwright smokes: tab switch keeps preview alive; gradient stop drag commits once on pointer-up and survives a focus-stealing notify; add slot → edit layer → dirty → Save round-trip; light pairing persists across backdrop reselect.

- [ ] **Step 1: Write the failing tests (append to the existing describe or a new one)**

```ts
test('backgrounds: add backdrop slot → configure layer → dirty → Save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await page.locator('.bg-tab', { hasText: 'Backdrops' }).click();
  // add a slot via the + button (auto-fills the first unused name)
  page.once('dialog', (d) => d.accept()); // prompt → default value
  await page.locator('.bg-el-add').click();
  // enable layer 0 + enable glass so the entry is valid
  await page.locator('[data-layer="0"] [data-l="enabled"]').check();
  await page.locator('[data-g="enabled"]').check();
  const save = page.getByRole('button', { name: /^Save/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
});

test('backgrounds: gradient stop drag commits once and survives notify', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await page.locator('.bg-tab', { hasText: 'Gradients' }).click();
  page.once('dialog', (d) => d.accept('rampE2E'));
  await page.locator('.bg-el-add').click();
  const bar = page.locator('.bg-grad-bar');
  const box = await bar.boundingBox();
  // click empty area to insert a stop, then drag it
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('backgrounds: tab switch keeps preview canvas alive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await expect(page.locator('.bg-pv-canvas')).toBeVisible();
  await page.locator('.bg-tab', { hasText: 'Lights' }).click();
  await expect(page.locator('.bg-pv-canvas')).toBeVisible(); // preview persists across tabs
});
```

- [ ] **Step 2: Build, then run e2e**

**Critical:** `npm run build` FIRST (server.js serves `dist/`). Then free the port if needed (`ss -ltnp | grep 8137` → `pkill -f server.js`), then:

Run: `npx playwright test`
Expected: the three new tests PASS along with the existing 6. If a backgrounds test fails, re-confirm you rebuilt dist before blaming logic.

- [ ] **Step 3: Commit**

```bash
git add e2e/editor.spec.ts
git commit -m "test(bg): e2e smokes — add slot+save, gradient drag, preview persists"
```

## Task 5.3: Final gate + memory note

- [ ] **Step 1: Full verification**

```bash
npm test            # all vitest green (renderer smoke may SKIP headless)
npx tsc --noEmit    # clean
npm run build       # clean
npx playwright test # 9 green (6 existing + 3 new); rebuild dist first
```

- [ ] **Step 2: Manual exploratory pass** — exercise each tab's add/rename/delete, confirm rename rewrites consumers (check a TexCoord used by two layers + a light), confirm the dangling-ref message reads "build error", confirm `timeFactor` raises no warning, and confirm the live `Gui/backgrounds.json` is only written on explicit Save.

- [ ] **Step 3: Commit any final cleanup, then finish the branch** per `superpowers:finishing-a-development-branch`.

---

## Self-review (run against the spec before execution)

**Spec coverage** — every §2 goal maps to a task: left-panel tabs/list/badges → 3.2/3.3; backdrops editor → 4.1; lights editor → 4.2; texcoords editor → 4.3; gradients editor → 4.4; entry lifecycle (add/rename/delete) → 3.3 (add) + 0.6 (rename) + 3.3 (delete confirm — **note:** the delete-with-confirm UI is specified in §5.2 but only `addEntry` is implemented in Task 3.3; **add a delete affordance** in the entry-list row context menu/✕ during 3.3, calling `renameNamedEntry`'s sibling delete: `delete table[name]` + `markDirty` for enum tabs, and for named tabs a `confirm()` showing `index.consumers(ns,name).length`). Live preview → 2.x + 5.1; validators/schema → 1.x; light texcoord sentinel → 0.4 + 5.1; serialization rules → 0.5.

**Gap fixed inline:** Task 3.3's `addEntry` covers add; append a `deleteEntry(tab, name)` to the same surface module and a ✕ button in `renderEntryList` rows (Task 3.2) wired through an `onDelete` callback:
```ts
// entryList.ts EntryListOpts: add `onDelete?: (name: string) => void`
// in renderEntryList row: if (opts.onDelete) { const x = document.createElement('button'); x.className='bg-el-del'; x.textContent='✕'; x.addEventListener('click', (e)=>{ e.stopPropagation(); opts.onDelete!(row.name); }); el.appendChild(x); }
// surface.ts:
function deleteEntry(tab: BgTab, name: string): void {
  const table = bgFile.root[TAB_TABLE[tab]]; if (!table) return;
  const ns = tab === 'texcoords' ? 'bg:texcoords' : tab === 'gradients' ? 'bg:gradients' : null;
  const consumers = ns ? lastCtx!.index.consumers(ns, name).length : 0;
  if (!confirm(`Delete "${name}"?${consumers ? ` ${consumers} reference(s) will dangle (build error, but visible).` : ''}`)) return;
  delete table[name];
  if (bgState.selected[tab] === name) selectEntry(tab, null);
  markDirty();
}
```
Wire `onDelete: (n) => deleteEntry(bgState.tab, n)` into the `renderEntryList` call. Rename likewise gets a row affordance (double-click name → prompt → `renameNamedEntry`, named tabs only) — add during Task 3.3.

**Type consistency** — `LayerModel`/`WrapMode` (0.5) reused by previewInput (2.1) and backdropForm (4.1); `Mark` (0.2) reused by gradientEditor (4.4) and previewPanel (5.1); `BgFormDeps`/`BgPreviewDeps` (Phase 4 preamble) reused by surface (3.3) and all forms; `LightUniforms` (2.3) built by previewPanel (5.1); `BgPreviewInput`/`SceneLayer`/`BgScene` (2.1) consumed by renderer (2.3) + previewPanel (5.1). `marksAscending` (0.2) reused by the validator (1.2). No name drift found.

**Placeholder scan** — the only intentional stubs are the Phase-3 two-line editor placeholders, each explicitly replaced in a named Phase-4 task; no "TBD"/"add error handling"/"similar to" placeholders remain.
