# GUI Package Editor — Slice 3: Borders Surface Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only-ish v1 borders surface into a directly-manipulable, engine-faithful editor: expansion-aware preview, draggable box-model/tessellation overlays, live cut-line cells editing, a slot list with add/delete, `#OVERLAY` mask mode, `Comment`, `Editor` read-back, and a render architecture that updates in place instead of rebuilding the DOM on every gesture.

**Architecture:** The pure slicing math (`bands.ts`, `cells.ts`, `preview/shaders.ts`) is engine-faithful and stays. New pure-logic modules (`preview/geometry.ts`, `gridModes.ts`, mask/editor/slot helpers) carry all testable behavior; the UI is refactored from a subscribe→full-rebuild bus into a `mount()`/`update()` split with pointer capture and commit-on-pointer-up. Six dependency-ordered phases: (0) pure logic, (1) renderer fixes, (2) render-arch refactor, (3) preview redesign, (4) cells redesign, (5) slot list + fill/mask/comment/Editor.

**Tech Stack:** Vite 5 + vanilla TypeScript (strict), Vitest (node env, no DOM), Playwright (e2e), WebGL2, ajv 8 (draft-07). Spec: `/mnt/Passport/Engine/Kreatures/docs/superpowers/specs/2026-06-11-gui-package-editor-slice3-borders-redesign-design.md`.

**Conventions (carry into every task):**
- TDD red→green, bite-sized commits, DRY/YAGNI.
- **Never `npm install` in the project dir** — `node_modules` is a symlink to the ext4 cache. Use `npm test`, `npm run build`, `npx vitest run <file>`, `npx tsc --noEmit`, `npx playwright test` only.
- Pure logic lives under `src/` with no DOM; UI under `src/ui/`; tests under `tests/`.
- The schema (`/mnt/Passport/Lifaundi/Gui/schemas/borders.schema.json`) **already** permits `Comment` (border-level and layer-level) and `Editor` (object) — verified during planning. No validator whitelist change is needed for `Comment`.
- Test/serialize invariant: the editor always emits the **lossless 25-rect pixel form** (`serializeCells`). Unknown keys round-trip untouched (slice-1 invariant).
- Run the app: `npm run build && npm run serve` (= `node server.js /mnt/Passport/Lifaundi/Gui`), open `http://localhost:8137`; console must print `root=/mnt/Passport/Lifaundi/Gui`.

---

## File Structure

**New files:**
- `src/preview/geometry.ts` — expansion-aware geometry: expanded drawn-quad size, layout-rect inset, pt↔fraction tessellation conversion. Pure.
- `src/gridModes.ts` — grid-mode detection (`3x3` / `5x5lines` / `free`), line extraction, line-drag rewrite. Pure.
- `src/maskMode.ts` — `MaskMode` read/write helpers over a border entry's `Mask` field. Pure.
- `src/editorReadback.ts` — read `Editor` metadata back into a source `CellGrid`; `unflattenCells`. Pure.
- `src/ui/sharedSheets.ts` — count borders sharing an `Image` path, from the slice-1 `RefIndex`. Pure-ish (takes an index).
- `tests/preview/geometry.test.ts`, `tests/gridModes.test.ts`, `tests/maskMode.test.ts`, `tests/editorReadback.test.ts`, `tests/ui/sharedSheets.test.ts`, `tests/borderNames.test.ts` (new).
- `src/ui/previewOverlay.ts` — 2D overlay-canvas drawing + hit-testing for the preview box-model handles (Phase 3).
- `src/ui/cellMap.ts` — 5×5 minimap widget (Phase 4).
- `src/ui/slotList.ts` — replaces `borderList.ts` rendering (Phase 5).

**Modified files:**
- `src/borderNames.ts` — add `allBorderNames()`, `unusedBorderNames()`.
- `src/package/validate.ts` — add `bordersTessellationUnitsValidator`.
- `src/types.ts` — no change expected (FillMode already defined); confirm `FillMode` export.
- `src/preview/shaders.ts` — replace `u_hasMask` bool with `u_maskMode` int.
- `src/preview/renderer.ts` — cache uniform locations at construction (M5/M7); upload textures keyed on `Rgba` identity (M6); `PreviewInput` gains `expansion` + `maskMode`; compute bands on the expanded size; `PreviewLayer` fill types already `[FillMode,FillMode]`.
- `src/ui/state.ts` — tighten `LayerState.edgeFill/centerFill` to `[FillMode, FillMode]`; add view-only preview state fields; keep the bus but change subscriber semantics (Phase 2).
- `src/ui/surfaces/borders.ts` — `mount()`/`update()` split; three-column layout; commit-on-pointer-up.
- `src/ui/previewPanel.ts` — expansion-aware, resizable viewport, overlays, geometry fields docked under preview.
- `src/ui/rectEditor.ts` — grid modes + cell map + mirrored-corner action; pointer capture; commit-on-pointer-up.
- `src/ui/propertiesForm.ts` → folds into the docked geometry fields + fill/mask bars (Phase 5); `update()`-driven, focus-preserving.
- `src/ui/main.ts` — `selectBorder` honors `Editor` read-back (Phase 5).
- `index.html` — CSS for the three-column borders layout, overlay chips, slot list, fill/mask bars.
- `e2e/editor.spec.ts` — new borders interactions (Phase 3/4 verification).

---

# PHASE 0 — Pure logic (no DOM, fully TDD)

Everything testable per spec §8. These land first because Phases 2–5 wire them into the UI. All six tasks are independent of each other.

## Task 0.1: `allBorderNames()` / `unusedBorderNames()` — close the orphan

**Files:**
- Modify: `src/borderNames.ts`
- Test: `tests/borderNames.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/borderNames.test.ts
import { describe, it, expect } from 'vitest';
import { allBorderNames, unusedBorderNames, isValidBorderName } from '../src/borderNames';

describe('allBorderNames', () => {
  it('lists exactly 102 slots (40 family + 6 backing/decoration + 16 panel + 8 decgroupbox + 32 flatgroupbox)', () => {
    const all = allBorderNames();
    expect(all).toHaveLength(102);
    expect(new Set(all).size).toBe(102); // no dupes
  });

  it('every generated name passes isValidBorderName', () => {
    for (const n of allBorderNames()) expect(isValidBorderName(n)).toBe(true);
  });

  it('includes representative names from each family', () => {
    const all = new Set(allBorderNames());
    expect(all.has('Header_0')).toBe(true);
    expect(all.has('RaisedGroupBox_3')).toBe(true);
    expect(all.has('Backing_2')).toBe(true);
    expect(all.has('Panel_0_3')).toBe(true);
    expect(all.has('DecorativeGroupBox_3_1')).toBe(true);
    expect(all.has('FlatGroupBox_3_7')).toBe(true);
  });

  it('unusedBorderNames subtracts the used set', () => {
    const used = ['Header_0', 'Panel_0_0'];
    const unused = unusedBorderNames(used);
    expect(unused).toHaveLength(100);
    expect(unused).not.toContain('Header_0');
    expect(unused).not.toContain('Panel_0_0');
    expect(unused).toContain('Header_1');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/borderNames.test.ts`
Expected: FAIL — `allBorderNames` / `unusedBorderNames` are not exported.

- [ ] **Step 3: Implement**

Append to `src/borderNames.ts`:

```ts
// Generate the full Gui::Border enum slot list, matching the PATTERNS above exactly.
export function allBorderNames(): string[] {
  const out: string[] = [];
  const families = ['Header', 'Footer', 'Slider', 'Button', 'GridItem', 'ListItem', 'Tab', 'Window', 'IndentGroupBox', 'RaisedGroupBox'];
  for (const f of families) for (let i = 0; i <= 3; ++i) out.push(`${f}_${i}`);
  for (const f of ['Backing', 'Decoration']) for (let i = 0; i <= 2; ++i) out.push(`${f}_${i}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 3; ++b) out.push(`Panel_${a}_${b}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 1; ++b) out.push(`DecorativeGroupBox_${a}_${b}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 7; ++b) out.push(`FlatGroupBox_${a}_${b}`);
  return out;
}

export function unusedBorderNames(used: readonly string[]): string[] {
  const usedSet = new Set(used);
  return allBorderNames().filter((n) => !usedSet.has(n));
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/borderNames.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/borderNames.ts tests/borderNames.test.ts
git commit -m "feat(borders): allBorderNames/unusedBorderNames — close isValidBorderName orphan"
```

## Task 0.2: Expansion-aware preview geometry

**Engine truth** (`gui_panelbuilder.comp:228-238`, `gui_panel.tese:100`): the drawn quad is the layout rect grown per-side by `Expansion`; band math runs on the **expanded** size; the layout rect sits inset by Expansion (top above / bottom below, JSON `[l,t,r,b]` y-down). `computeBands` is unchanged — the caller passes the expanded size.

**Files:**
- Create: `src/preview/geometry.ts`
- Test: `tests/preview/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/preview/geometry.test.ts
import { describe, it, expect } from 'vitest';
import { expandedSize, layoutRectFraction, tessPtToFraction, tessFractionToPt } from '../../src/preview/geometry';
import { computeBands } from '../../src/bands';

describe('expandedSize', () => {
  it('grows the panel by expansion on each side', () => {
    expect(expandedSize([200, 100], [10, 20, 30, 40])).toEqual([240, 160]); // [200+10+30, 100+20+40]
  });
  it('is identity for zero expansion', () => {
    expect(expandedSize([200, 100], [0, 0, 0, 0])).toEqual([200, 100]);
  });
});

describe('layoutRectFraction', () => {
  it('returns the layout rect as 0..1 fractions of the drawn (expanded) quad', () => {
    // drawn = [240,160]; layout left frac = 10/240, top = 20/160, right edge = 1-30/240, bottom = 1-40/160
    const r = layoutRectFraction([200, 100], [10, 20, 30, 40]);
    expect(r.x0).toBeCloseTo(10 / 240, 6);
    expect(r.y0).toBeCloseTo(20 / 160, 6);
    expect(r.x1).toBeCloseTo(1 - 30 / 240, 6);
    expect(r.y1).toBeCloseTo(1 - 40 / 160, 6);
  });
  it('asymmetric expansion shifts the layout center off the drawn center', () => {
    const r = layoutRectFraction([100, 100], [40, 0, 0, 0]); // drawn = [140,100]
    const cx = (r.x0 + r.x1) / 2;
    expect(cx).toBeGreaterThan(0.5); // layout center is right of drawn center
  });
});

describe('tess pt <-> fraction conversion (per-axis size)', () => {
  it('round-trips a pt value through the expanded-axis size', () => {
    const axisPt = 240;
    expect(tessFractionToPt(tessPtToFraction(32, axisPt), axisPt)).toBeCloseTo(32, 6);
  });
  it('fraction values (<=1) are preserved as-is by ptToFraction when already a fraction-intent', () => {
    // helper is a pure ratio; 0.25 * 240 = 60 pt; back = 0.25
    expect(tessPtToFraction(60, 240)).toBeCloseTo(0.25, 6);
    expect(tessFractionToPt(0.25, 240)).toBeCloseTo(60, 6);
  });
});

describe('computeBands on the expanded quad (fidelity)', () => {
  it('fractional tessellation resolves against the expanded size, not the layout size', () => {
    // tessellation right=0.25 (fraction); on a layout [100,100] with expansion [40,0,0,0] drawn=[140,100]
    // computeBands divides nothing further for fraction inputs (values <=1 stay as fractions of the size passed),
    // so positionsX[1] (left band) == 0.25 of the drawn width regardless of layout width.
    const drawn = expandedSize([100, 100], [40, 0, 0, 0]); // [140,100]
    const b = computeBands([0.25, 0.25, 0.25, 0.25], [1, 1, -1, -1], drawn);
    expect(b.positionsX[1]).toBeCloseTo(0.25, 6);
    expect(b.positionsX[4]).toBeCloseTo(0.75, 6);
  });
  it('pixel tessellation (>1) divides by the expanded width', () => {
    const drawn = expandedSize([200, 100], [20, 0, 20, 0]); // [240,100]
    // right=24 px -> fraction 24/240 = 0.1 -> positionsX[4] = 1-0.1 = 0.9
    const b = computeBands([24, 0.5, 24, 0.5], [1, 1, -1, -1], drawn);
    expect(b.positionsX[4]).toBeCloseTo(0.9, 6);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/preview/geometry.test.ts`
Expected: FAIL — module `src/preview/geometry.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/preview/geometry.ts
// Expansion-aware preview geometry. The engine draws the quad grown per-side by Expansion
// (gui_panelbuilder.comp:228-238) and runs band math on the expanded size (gui_panel.tese:100).
// JSON works in y-down [l,t,r,b] throughout; the caller (previewPanel) draws top above / bottom below.
import type { Vec2, Vec4 } from '../types';

// Panel size grown by Expansion [l,t,r,b] -> the drawn-quad size in pt.
export function expandedSize(panelSize: Vec2, expansion: Vec4): Vec2 {
  return [panelSize[0] + expansion[0] + expansion[2], panelSize[1] + expansion[1] + expansion[3]];
}

export interface RectFrac { x0: number; y0: number; x1: number; y1: number }

// The layout rect expressed as 0..1 fractions of the drawn (expanded) quad.
export function layoutRectFraction(panelSize: Vec2, expansion: Vec4): RectFrac {
  const [w, h] = expandedSize(panelSize, expansion);
  return {
    x0: expansion[0] / w,
    y0: expansion[1] / h,
    x1: 1 - expansion[2] / w,
    y1: 1 - expansion[3] / h,
  };
}

// A tessellation point value as a fraction of its axis size, and back. Used when a drag writes
// pt deltas but the axis is currently authored in fraction units (deciding component <= 1).
export function tessPtToFraction(valuePt: number, axisSizePt: number): number {
  return axisSizePt > 0 ? valuePt / axisSizePt : 0;
}
export function tessFractionToPt(fraction: number, axisSizePt: number): number {
  return fraction * axisSizePt;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/preview/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preview/geometry.ts tests/preview/geometry.test.ts
git commit -m "feat(borders): expansion-aware preview geometry (drawn-quad size, layout-rect inset, tess unit conv)"
```

## Task 0.3: Grid-mode detection + line extraction + line-drag rewrite

**Spec §5.3.** A 5×5 `CellGrid` can encode a `3x3` (engine 4-cut expansion: columns 2/3/4 identical, rows 2/3/4 identical, pure grid), a `5x5lines` (partition: `cell[y][x] = [L[x],T[y],L[x+1],T[y+1]]` from 6 lines/axis), or neither (`free`). Mirror flags do **not** affect detection (compare `rect` magnitudes); aliased corner rects (mirrored-corner art whose rect ≠ the implied grid cell) force `free`. Entering a mode never converts data — it exposes the implied lines. Dragging rewrites affected rects, **preserving** each cell's mirror flags.

**Files:**
- Create: `src/gridModes.ts`
- Test: `tests/gridModes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gridModes.test.ts
import { describe, it, expect } from 'vitest';
import { detectGridMode, extractLines3x3, extractLines5x5, rewrite3x3, rewrite5x5Line } from '../src/gridModes';
import { ninePatchGrid, toEditorGrid, parseCellsJson, resolveInfinity } from '../src/cells';
import type { CellGrid } from '../src/types';

const IMG: [number, number] = [120, 90];

// A clean 3x3 grid built the way the editor builds it.
function grid3x3(): CellGrid {
  return ninePatchGrid([40, 80], [30, 60], IMG); // xCuts, yCuts
}
// A 5x5 partition grid from explicit lines.
function grid5x5(xLines: number[], yLines: number[]): CellGrid {
  const parsed = parseCellsJson([xLines, yLines]); // [xLines[], yLines[]] form
  if (parsed.kind !== 'grid') throw new Error('expected grid');
  return toEditorGrid(resolveInfinity(parsed.grid, IMG));
}

describe('detectGridMode', () => {
  it('detects a 4-cut 3x3 grid', () => {
    expect(detectGridMode(grid3x3())).toBe('3x3');
  });

  it('mirror flags do not change 3x3 detection', () => {
    const g = grid3x3();
    g[0][0].mirrorX = true; g[0][0].mirrorY = true; // mirrored corner art, rect unchanged
    expect(detectGridMode(g)).toBe('3x3');
  });

  it('detects a 6-line 5x5 partition that is NOT a 3x3', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    expect(detectGridMode(g)).toBe('5x5lines');
  });

  it('an aliased corner rect (rect != implied grid cell) forces free mode', () => {
    const g = grid3x3();
    g[0][0].rect = [5, 5, 35, 25]; // corner art pulled from elsewhere — breaks the grid
    expect(detectGridMode(g)).toBe('free');
  });
});

describe('extractLines3x3', () => {
  it('recovers the two interior cut lines per axis', () => {
    const { xCuts, yCuts } = extractLines3x3(grid3x3());
    expect(xCuts).toEqual([40, 80]);
    expect(yCuts).toEqual([30, 60]);
  });
});

describe('rewrite3x3', () => {
  it('dragging a cut line produces exactly the engine 4-cut rects', () => {
    const before = grid3x3();
    const after = rewrite3x3(before, [50, 80], [30, 60], IMG); // moved xCut0 40 -> 50
    const expected = ninePatchGrid([50, 80], [30, 60], IMG);
    expect(after.map((r) => r.map((c) => c.rect))).toEqual(expected.map((r) => r.map((c) => c.rect)));
  });

  it('preserves mirror flags through a rewrite', () => {
    const before = grid3x3();
    before[0][0].mirrorX = true;
    const after = rewrite3x3(before, [50, 80], [30, 60], IMG);
    expect(after[0][0].mirrorX).toBe(true);
  });
});

describe('extractLines5x5 + rewrite5x5Line', () => {
  it('recovers the 6 lines per axis', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    const { xLines, yLines } = extractLines5x5(g);
    expect(xLines).toEqual([0, 10, 25, 60, 95, 120]);
    expect(yLines).toEqual([0, 8, 20, 50, 75, 90]);
  });

  it('dragging a 5x5 line clamps between its neighbors and rewrites rects', () => {
    const g = grid5x5([0, 10, 25, 60, 95, 120], [0, 8, 20, 50, 75, 90]);
    const moved = rewrite5x5Line(g, 'x', 2, 200, IMG); // try to push line 2 past line 3 (60)
    const { xLines } = extractLines5x5(moved);
    expect(xLines[2]).toBe(60); // clamped to neighbor (line 3)
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/gridModes.test.ts`
Expected: FAIL — `src/gridModes.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/gridModes.ts
// Detect which higher-level editing mode a 25-rect CellGrid is already in, and rewrite rects when
// a cut/partition line is dragged. Detection compares rect MAGNITUDES (mirror flags ignored);
// rewrites PRESERVE existing mirror flags. Entering a mode never mutates data.
import type { CellGrid, Vec4 } from './types';
import { ninePatchGrid } from './cells';

export type GridMode = '3x3' | '5x5lines' | 'free';

const EPS = 1e-3;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const lo = (c: { rect: Vec4 }, i: 0 | 1) => Math.min(Math.abs(c.rect[i]), Math.abs(c.rect[i + 2]));
const hi = (c: { rect: Vec4 }, i: 0 | 1) => Math.max(Math.abs(c.rect[i]), Math.abs(c.rect[i + 2]));

// Read the partition lines a grid implies: xLines[i] = left edge of column i (+ right edge of last col).
function lines(cells: CellGrid): { xLines: number[]; yLines: number[] } {
  const xLines: number[] = [];
  const yLines: number[] = [];
  for (let x = 0; x < 5; ++x) xLines.push(lo(cells[0][x], 0));
  xLines.push(hi(cells[0][4], 0));
  for (let y = 0; y < 5; ++y) yLines.push(lo(cells[y][0], 1));
  yLines.push(hi(cells[4][0], 1));
  return { xLines, yLines };
}

// Does the grid equal the pure partition cell[y][x] = [xLines[x], yLines[y], xLines[x+1], yLines[y+1]]?
function isPartition(cells: CellGrid, xLines: number[], yLines: number[]): boolean {
  for (let y = 0; y < 5; ++y)
    for (let x = 0; x < 5; ++x) {
      const c = cells[y][x];
      if (!eq(lo(c, 0), xLines[x]) || !eq(hi(c, 0), xLines[x + 1])) return false;
      if (!eq(lo(c, 1), yLines[y]) || !eq(hi(c, 1), yLines[y + 1])) return false;
    }
  return true;
}

export function detectGridMode(cells: CellGrid): GridMode {
  const { xLines, yLines } = lines(cells);
  if (!isPartition(cells, xLines, yLines)) return 'free';
  // 3x3 (4-cut expansion) iff columns 2,3,4 are zero-width-collapsed onto the same edges:
  // the engine's clamp min(x,2) means xLines[3]==xLines[4]==xLines[5] and yLines[3]==yLines[4]==yLines[5].
  const collapsedX = eq(xLines[3], xLines[4]) && eq(xLines[4], xLines[5]);
  const collapsedY = eq(yLines[3], yLines[4]) && eq(yLines[4], yLines[5]);
  if (collapsedX && collapsedY) return '3x3';
  return '5x5lines';
}

export function extractLines3x3(cells: CellGrid): { xCuts: [number, number]; yCuts: [number, number] } {
  const { xLines, yLines } = lines(cells);
  return { xCuts: [xLines[1], xLines[2]], yCuts: [yLines[1], yLines[2]] };
}

export function extractLines5x5(cells: CellGrid): { xLines: number[]; yLines: number[] } {
  return lines(cells);
}

// Rewrite from new 3x3 cut lines, preserving each cell's mirror flags.
export function rewrite3x3(
  prev: CellGrid,
  xCuts: [number, number],
  yCuts: [number, number],
  imageSize: [number, number],
): CellGrid {
  const fresh = ninePatchGrid(xCuts, yCuts, imageSize);
  return fresh.map((row, y) => row.map((c, x) => ({ rect: c.rect, mirrorX: prev[y][x].mirrorX, mirrorY: prev[y][x].mirrorY })));
}

// Move one partition line (axis 'x' lineIndex 0..5) to newValue, clamped between neighbors, and rebuild.
export function rewrite5x5Line(
  prev: CellGrid,
  axis: 'x' | 'y',
  lineIndex: number,
  newValue: number,
  imageSize: [number, number],
): CellGrid {
  const { xLines, yLines } = lines(prev);
  const arr = axis === 'x' ? xLines.slice() : yLines.slice();
  const max = axis === 'x' ? imageSize[0] : imageSize[1];
  const lower = lineIndex > 0 ? arr[lineIndex - 1] : 0;
  const upper = lineIndex < 5 ? arr[lineIndex + 1] : max;
  arr[lineIndex] = Math.max(lower, Math.min(upper, newValue));
  const nx = axis === 'x' ? arr : xLines;
  const ny = axis === 'y' ? arr : yLines;
  return prev.map((row, y) => row.map((c, x) => ({
    rect: [nx[x], ny[y], nx[x + 1], ny[y + 1]] as Vec4,
    mirrorX: c.mirrorX,
    mirrorY: c.mirrorY,
  })));
}
```

> **Implementer note:** `rewrite5x5Line`'s clamp is exclusive-of-crossing (`lineIndex+1` neighbor). The test pushes line 2 to 200 and expects clamp to line 3's value (60). If your `lines()` ordering differs, fix `lines()` not the test — detection and the engine parse forms must agree byte-for-byte.

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/gridModes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gridModes.ts tests/gridModes.test.ts
git commit -m "feat(borders): grid-mode detection + line extraction + line-drag rewrite (pure)"
```

## Task 0.4: Mask-mode read/write helpers

**Spec §5.5.** `Mask` JSON forms: absent → `none`; string `"#OVERLAY"` → `#OVERLAY`; object with `Cells: "#COPY"` → `#COPY`; object with own `Image`+cells → `image`.

**Files:**
- Create: `src/maskMode.ts`
- Test: `tests/maskMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/maskMode.test.ts
import { describe, it, expect } from 'vitest';
import { readMaskMode, setMaskMode, type MaskMode } from '../src/maskMode';

describe('readMaskMode', () => {
  it('absent Mask -> none', () => {
    expect(readMaskMode({ Overlay: { Cells: '#COPY' } })).toBe('none');
  });
  it('string "#OVERLAY" -> overlay', () => {
    expect(readMaskMode({ Mask: '#OVERLAY' })).toBe('#OVERLAY');
  });
  it('object with Cells "#COPY" -> copy', () => {
    expect(readMaskMode({ Mask: { Image: 'm.png', Cells: '#COPY' } })).toBe('#COPY');
  });
  it('object with own cells -> image', () => {
    expect(readMaskMode({ Mask: { Image: 'm.png', Cells: [[0, 1], [0, 1]] } })).toBe('image');
  });
});

describe('setMaskMode round-trips through JSON forms', () => {
  const modes: MaskMode[] = ['none', '#OVERLAY', '#COPY', 'image'];
  for (const m of modes) {
    it(`set then read returns ${m}`, () => {
      const entry: any = { Overlay: { Image: 'o.png', Cells: [[0, 1], [0, 1]] } };
      setMaskMode(entry, m);
      expect(readMaskMode(entry)).toBe(m);
    });
  }
  it('none deletes the Mask key entirely', () => {
    const entry: any = { Mask: '#OVERLAY', Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, 'none');
    expect('Mask' in entry).toBe(false);
  });
  it('switching to #OVERLAY writes the string form', () => {
    const entry: any = { Mask: { Image: 'm.png', Cells: '#COPY' }, Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, '#OVERLAY');
    expect(entry.Mask).toBe('#OVERLAY');
  });
  it('switching to #COPY from a string preserves/creates an object with Cells "#COPY"', () => {
    const entry: any = { Mask: '#OVERLAY', Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, '#COPY');
    expect(typeof entry.Mask).toBe('object');
    expect(entry.Mask.Cells).toBe('#COPY');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run tests/maskMode.test.ts` — FAIL (no module).

- [ ] **Step 3: Implement**

```ts
// src/maskMode.ts
// Read/write the Mask field of a border entry as one of four authoring modes.
export type MaskMode = 'none' | 'image' | '#COPY' | '#OVERLAY';

export function readMaskMode(entry: any): MaskMode {
  const m = entry?.Mask;
  if (m == null) return 'none';
  if (typeof m === 'string') return m === '#OVERLAY' ? '#OVERLAY' : '#COPY'; // any other string is a copy ref
  if (typeof m === 'object') return typeof m.Cells === 'string' ? '#COPY' : 'image';
  return 'none';
}

// Mutate entry.Mask to the chosen mode, keeping existing Image/Cells where it makes sense.
export function setMaskMode(entry: any, mode: MaskMode): void {
  switch (mode) {
    case 'none':
      delete entry.Mask;
      return;
    case '#OVERLAY':
      entry.Mask = '#OVERLAY';
      return;
    case '#COPY': {
      const prev = typeof entry.Mask === 'object' ? entry.Mask : {};
      entry.Mask = { ...prev, Cells: '#COPY' };
      return;
    }
    case 'image': {
      const prev = typeof entry.Mask === 'object' ? entry.Mask : {};
      entry.Mask = {
        Image: prev.Image ?? '',
        EdgeFill: prev.EdgeFill ?? ['STRETCH', 'STRETCH'],
        CenterFill: prev.CenterFill ?? ['STRETCH', 'STRETCH'],
        Cells: Array.isArray(prev.Cells) ? prev.Cells : [[0, 1], [0, 1]],
      };
      return;
    }
  }
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/maskMode.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/maskMode.ts tests/maskMode.test.ts
git commit -m "feat(borders): MaskMode read/write helpers (none/image/#COPY/#OVERLAY round-trip)"
```

## Task 0.5: Editor metadata read-back

**Spec §5.6.** `applyPackResult` writes `entry.Editor = { version, source, sourceCells: EditorCell[25 flat], pack }`. Read-back un-flattens `sourceCells` to a 5×5 `CellGrid`. Missing/invalid → `null` (caller falls back to packed cells).

**Files:**
- Create: `src/editorReadback.ts`
- Test: `tests/editorReadback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/editorReadback.test.ts
import { describe, it, expect } from 'vitest';
import { editorSourceCells, unflattenCells } from '../src/editorReadback';
import { ninePatchGrid } from '../src/cells';

describe('unflattenCells', () => {
  it('rebuilds a 5x5 grid from 25 flat cells, row-major', () => {
    const grid = ninePatchGrid([40, 80], [30, 60], [120, 90]);
    const flat = grid.flat();
    const back = unflattenCells(flat);
    expect(back).toHaveLength(5);
    expect(back[0]).toHaveLength(5);
    expect(back[2][3].rect).toEqual(grid[2][3].rect);
  });
  it('throws on the wrong count', () => {
    expect(() => unflattenCells([] as any)).toThrow();
  });
});

describe('editorSourceCells', () => {
  it('returns source grid + source descriptor when Editor metadata is present and valid', () => {
    const grid = ninePatchGrid([10, 20], [10, 20], [40, 40]);
    const entry = { Editor: { version: 1, source: { overlay: 'src/o.png', linked: true }, sourceCells: grid.flat(), pack: { gutter: 2, align: 4 } } };
    const res = editorSourceCells(entry);
    expect(res).not.toBeNull();
    expect(res!.sourceCells[1][1].rect).toEqual(grid[1][1].rect);
    expect(res!.source.overlay).toBe('src/o.png');
  });
  it('returns null when there is no Editor metadata', () => {
    expect(editorSourceCells({ Overlay: { Cells: '#COPY' } })).toBeNull();
  });
  it('returns null when sourceCells is malformed (falls back to packed)', () => {
    expect(editorSourceCells({ Editor: { version: 1, sourceCells: [1, 2, 3] } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/editorReadback.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/editorReadback.ts
import type { CellGrid, EditorCell, Vec4 } from './types';
import { getEditorMeta } from './document';

export function unflattenCells(flat: readonly EditorCell[]): CellGrid {
  if (!Array.isArray(flat) || flat.length !== 25) throw new Error(`unflattenCells: expected 25 cells, got ${(flat as any)?.length}`);
  const grid: CellGrid = [];
  for (let y = 0; y < 5; ++y) {
    const row: EditorCell[] = [];
    for (let x = 0; x < 5; ++x) {
      const c = flat[y * 5 + x];
      row.push({ rect: [...c.rect] as Vec4, mirrorX: !!c.mirrorX, mirrorY: !!c.mirrorY });
    }
    grid.push(row);
  }
  return grid;
}

export interface EditorSource { source: any; pack: any; sourceCells: CellGrid }

// Read packed-border source state back from Editor metadata; null if absent/invalid.
export function editorSourceCells(entry: any): EditorSource | null {
  const meta = getEditorMeta(entry);
  if (!meta || !Array.isArray(meta.sourceCells)) return null;
  try {
    const valid = meta.sourceCells.every((c: any) => Array.isArray(c?.rect) && c.rect.length === 4);
    if (!valid) return null;
    return { source: meta.source, pack: meta.pack, sourceCells: unflattenCells(meta.sourceCells) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/editorReadback.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/editorReadback.ts tests/editorReadback.test.ts
git commit -m "feat(borders): Editor metadata read-back (unflatten source cells, invalid->null)"
```

## Task 0.6: `borders-tessellation-units` validator

**Spec §7.** The engine decides pt-vs-fraction per axis from one component: X from `right` (`tessellation[2]`), Y from `top` (`tessellation[1]`) — `gui_panel.tese:108`. Warn when an axis mixes intent: the deciding component ≤ 1 (fraction) while the paired component > 1 (silently becomes a nonsense fraction). X pair = `left` (`[0]`); Y pair = `bottom` (`[3]`).

**Files:**
- Modify: `src/package/validate.ts`
- Test: `tests/package/validate.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append a `describe` to `tests/package/validate.test.ts`; reuse its existing harness for building a `pkg`/`index`/`assets`/`schemas` — copy the pattern already in that file)

```ts
// tests/package/validate.test.ts  (new describe block)
import { runValidators } from '../../src/package/validate';
// ...reuse the file's existing buildPkg(...) / makeSchemas() helpers...

describe('borders-tessellation-units', () => {
  function issuesFor(tessellation: number[]) {
    const pkg = buildPkg({ borders: { Header_0: { Overlay: { Cells: '#COPY' }, Tessellation: tessellation } } });
    return runValidators(pkg, buildIndex(pkg), emptyAssets(), schemas)
      .filter((i) => i.category === 'borders-tessellation-units');
  }

  it('warns when X mixes: right<=1 (fraction) but left>1 (px)', () => {
    const is = issuesFor([32, 0.5, 0.25, 0.5]); // left=32(px), top=0.5(frac), right=0.25(frac decides X), bottom=0.5
    expect(is).toHaveLength(1);
    expect(is[0].severity).toBe('warning');
    expect(is[0].message).toMatch(/X/);
    expect(is[0].message).toContain('32');
    expect(is[0].message).toContain('0.25');
  });

  it('warns when Y mixes: top<=1 but bottom>1', () => {
    const is = issuesFor([0.25, 0.25, 0.25, 64]); // top=0.25 decides Y as fraction, bottom=64 px
    expect(is).toHaveLength(1);
    expect(is[0].message).toMatch(/Y/);
  });

  it('no warning when an axis is consistently pixels', () => {
    expect(issuesFor([32, 64, 32, 64])).toHaveLength(0);
  });

  it('no warning when an axis is consistently fractions', () => {
    expect(issuesFor([0.1, 0.2, 0.1, 0.2])).toHaveLength(0);
  });

  it('navigates to the borders surface / the entry', () => {
    const is = issuesFor([32, 0.5, 0.25, 0.5]);
    expect(is[0].nav?.surface).toBe('borders');
    expect(is[0].nav?.entry?.name).toBe('Header_0');
  });
});
```

> **Implementer note:** Read the existing `tests/package/validate.test.ts` top matter first and reuse whatever `buildPkg`/`buildIndex`/`emptyAssets`/`schemas` helpers it already defines (the slice-1/2 tests have them). If a borders helper doesn't exist, add a minimal one mirroring the existing backgrounds-based ones.

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/package/validate.test.ts` — FAIL (no such category).

- [ ] **Step 3: Implement** — add to `src/package/validate.ts`:

```ts
// 6. borders-tessellation-units — per-axis the engine decides pt-vs-fraction from one component
// (X: right>1, Y: top>1; gui_panel.tese:108). Warn when the deciding component is a fraction (<=1)
// but its paired component is in pixels (>1) — the pair silently becomes a nonsense fraction.
const bordersTessUnitsValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const root = pkg.files.borders.root;
  if (pkg.files.borders.loadError || pkg.files.borders.missing || !root) return out;
  for (const name of Object.keys(root)) {
    const entry = root[name];
    const t = entry?.Tessellation;
    if (!Array.isArray(t) || t.length !== 4) continue;
    const [left, top, right, bottom] = t as number[];
    const check = (axis: 'X' | 'Y', deciding: number, pair: number, dName: string, pName: string) => {
      if (deciding <= 1 && pair > 1) {
        out.push({
          severity: 'warning', category: 'borders-tessellation-units',
          message: `Border "${name}" ${axis} tessellation mixes units: ${dName}=${deciding} is a fraction (decides the axis) but ${pName}=${pair} is in pixels — the pixel value becomes a nonsense fraction.`,
          file: 'borders', jsonPath: [name, 'Tessellation'],
          nav: { surface: 'borders', entry: { name } },
        });
      }
    };
    check('X', right, left, 'right', 'left');
    check('Y', top, bottom, 'top', 'bottom');
  }
  return out;
};
```

Then add `bordersTessUnitsValidator` to the `REGISTRY` array.

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/package/validate.test.ts`

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/package/validate.ts tests/package/validate.test.ts
git commit -m "feat(borders): borders-tessellation-units validator (warn on mixed per-axis units)"
```

## Task 0.7: Shared-sheet counting helper

**Spec §5.4 / §8.** Count borders that reference a given `Image` path, from the slice-1 `RefIndex`. Badge shows when count ≥ 2.

**Files:**
- Create: `src/ui/sharedSheets.ts`
- Test: `tests/ui/sharedSheets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/sharedSheets.test.ts
import { describe, it, expect } from 'vitest';
import { countBordersSharingImage } from '../../src/ui/sharedSheets';
// Reuse the refIndex test harness used by tests/package/refIndex.test.ts to build an index
// from a fixture package whose borders share an image path.

describe('countBordersSharingImage', () => {
  it('counts distinct borders that reference the same Image path', () => {
    // Build an index from a package where Window_0 and Window_1 both use Images/shared.png,
    // and Header_0 uses Images/solo.png.
    const index = buildIndexFromBorders({
      Window_0: { Overlay: { Image: 'Images/shared.png', Cells: '#COPY' } },
      Window_1: { Overlay: { Image: 'Images/shared.png', Cells: '#COPY' } },
      Header_0: { Overlay: { Image: 'Images/solo.png', Cells: '#COPY' } },
    });
    expect(countBordersSharingImage(index, 'Images/shared.png')).toBe(2);
    expect(countBordersSharingImage(index, 'Images/solo.png')).toBe(1);
    expect(countBordersSharingImage(index, 'Images/none.png')).toBe(0);
  });
});
```

> **Implementer note:** Look at `tests/package/refIndex.test.ts` for how it constructs a `RefIndex` from a package; factor a small `buildIndexFromBorders` local helper. The `RefIndex.consumers('asset:image', path)` API returns edges with `e.from.file` and `e.from.jsonPath` (border name at `jsonPath[0]`), per `src/package/validate.ts` usage.

- [ ] **Step 2: Run, verify it fails** — FAIL (no module).

- [ ] **Step 3: Implement**

```ts
// src/ui/sharedSheets.ts
import type { RefIndex } from '../package/refIndex';

// How many distinct borders reference this Image path (for the ⛓N shared-sheet badge).
export function countBordersSharingImage(index: RefIndex, imagePath: string): number {
  const consumers = index.consumers('asset:image', imagePath);
  const borders = new Set<string>();
  for (const e of consumers) {
    if (e.from.file !== 'borders') continue;
    const name = e.from.jsonPath?.[0];
    if (typeof name === 'string') borders.add(name);
  }
  return borders.size;
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/ui/sharedSheets.ts tests/ui/sharedSheets.test.ts
git commit -m "feat(borders): countBordersSharingImage helper for shared-sheet badge"
```

**Phase 0 gate:** `npm test` and `npx tsc --noEmit` both green. All new pure modules exist and are wired by nothing yet — that's expected.

---

# PHASE 1 — Renderer fixes (M5/M6/M7, `u_maskMode`, expansion plumbing)

**Spec §6 renderer + §5.1 + §5.5.** These change the GL renderer's internals and its `PreviewInput` shape; the UI still calls it through `previewPanel.ts`. After this phase the preview is *capable of* expansion + `#OVERLAY` even though the UI doesn't expose the controls until Phase 3/5.

## Task 1.1: Cache uniform locations; texture upload keyed on `Rgba` identity

**Files:**
- Modify: `src/preview/renderer.ts`
- Test: `tests/preview/renderer-uniforms.test.ts` (create — light, see note)

> **Why mostly manual:** the renderer needs a real WebGL2 context. Vitest runs in node (no GL). Verify the *structure* (a `loc(name)` cache populated at construction; a `WeakMap<Rgba, true>`-style upload guard) by code review + the existing `tests/mesh.test.ts`/`tests/parity.test.ts` staying green, plus a manual GL smoke in the browser.

- [ ] **Step 1: Cache uniform locations at construction**

In the `PreviewRenderer` constructor, after a successful link, build `private uloc = new Map<string, WebGLUniformLocation | null>()` by enumerating active uniforms:

```ts
// after link success, before detaching shaders:
const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS) as number;
for (let i = 0; i < n; ++i) {
  const info = gl.getActiveUniform(this.prog, i);
  if (!info) continue;
  const base = info.name.replace(/\[0\]$/, '');
  const baseLoc = gl.getUniformLocation(this.prog, info.name);
  this.uloc.set(info.name, baseLoc);
  if (base !== info.name) this.uloc.set(`${base}[0]`, baseLoc);
}
```

Replace the per-draw `const u = (n) => gl.getUniformLocation(this.prog, n)` with:

```ts
const u = (name: string): WebGLUniformLocation | null => {
  if (this.uloc.has(name)) return this.uloc.get(name) ?? null;
  const loc = gl.getUniformLocation(this.prog, name); // tolerate names not enumerated (array elems)
  this.uloc.set(name, loc);
  // M5+M7: a clean link should expose every uniform we set; warn in dev when one is missing.
  console.assert(loc !== null, `preview: uniform "${name}" not found after clean link`);
  return loc;
};
```

- [ ] **Step 2: Upload textures only when the `Rgba` object changes (M6)**

Add `private uploaded = new WeakMap<Rgba, true>()` and a `private texFor = { mask: null as Rgba | null, overlay: null as Rgba | null }`. In `setLayer`, only call `this.upload(tex, layer.image)` when `this.texFor[prefix] !== layer.image`; then set `this.texFor[prefix] = layer.image`. (Geometry-only edits keep the same `Rgba` object, so no `texImage2D`.) Always re-bind the texture to its unit each draw.

> **Important:** `selectBorder` currently creates a *new* `Rgba` on load, so identity changes exactly when the image truly changes — correct. Confirm no code mutates an `Rgba` in place; if it does, bump identity by assigning a fresh object.

- [ ] **Step 3: Typecheck + existing GL-adjacent tests**

Run: `npx tsc --noEmit && npx vitest run tests/mesh.test.ts tests/parity.test.ts`
Expected: green (these don't need GL).

- [ ] **Step 4: Manual GL smoke**

Run `npm run build && npm run serve`; open the app, select a border; the preview renders; editing a Tessellation field re-renders without flicker; the console shows no `uniform ... not found` assertions.

- [ ] **Step 5: Commit**

```bash
git add src/preview/renderer.ts
git commit -m "perf(borders): cache uniform locations (M5/M7) + upload textures on Rgba identity (M6)"
```

## Task 1.2: `u_maskMode` int replaces `u_hasMask` bool

**Files:**
- Modify: `src/preview/shaders.ts`, `src/preview/renderer.ts`
- Test: parity/mesh tests stay green; manual GL.

- [ ] **Step 1: Shader change**

In `FRAG`, replace `uniform bool u_hasMask;` with `uniform int u_maskMode; // 0 none, 1 texture, 2 overlay`. Replace the SampleBorder block:

```glsl
  // SampleBorder defaults; u_maskMode: 0 none -> mask=(1,0); 1 texture; 2 overlay -> mask=(0,1)
  vec2 mask = vec2(1.0, 0.0);
  if (u_maskMode == 1) {
    vec2 mc = layerCoords(u_maskCells[idx], u_maskMirror[idx], u_maskFill, u_maskTexSize, coords, centerX, centerY, cellPt);
    vec2 mg = texture(u_maskTex, mc).rg;
    mask = vec2(smoothstep(0.48, 0.52, mg.r), 1.0 - mg.g);
  } else if (u_maskMode == 2) {
    mask = vec2(0.0, 1.0); // overlay masks itself: border art shows only via the G/overlay path
  }
```

(Keep `u_hasOverlay` as-is.) Update the shader header comment noting the `.sdf` divergence (spec §9.1) and the `u_maskMode` mapping.

- [ ] **Step 2: Renderer change**

`PreviewInput` gains `maskMode: 0 | 1 | 2`. In `render()`, replace the `setLayer('mask', ...)`'s `u_hasMask` write with `gl.uniform1i(u('u_maskMode'), input.maskMode)`, and only upload/bind the mask texture + cells when `input.maskMode === 1` (mode 2 needs no mask texture). `setLayer` for overlay is unchanged. `previewPanel.ts` passes `maskMode` derived from `readMaskMode(entry)` (Task 0.4): `none`/`#OVERLAY` → 0/2; `image`/`#COPY` → 1 (the `#COPY` case resolves the overlay's cells into the mask layer exactly as today).

- [ ] **Step 3: Plumb `expansion` into `PreviewInput` and the band call**

`PreviewInput` gains `expansion: Vec4`. In `render()`:

```ts
import { expandedSize } from './geometry';
// ...
const drawn = expandedSize(input.panelSize, input.expansion);
const bands = computeBands(input.tessellation, input.centerTile, drawn);
// ...
gl.uniform2f(u('u_panelSize'), drawn[0], drawn[1]); // fill-mode point sizing is relative to the drawn quad
```

`previewPanel.ts` passes `expansion: (entry.Expansion ?? [0,0,0,0])`. (The dashed layout-rect overlay is drawn by the 2D overlay canvas in Phase 3, not here.)

- [ ] **Step 4: Typecheck + parity tests + manual GL**

Run: `npx tsc --noEmit && npx vitest run tests/parity.test.ts tests/mesh.test.ts`
Then manual: a border with `Mask: "#OVERLAY"` (hand-edit a fixture copy) renders as overlay-only; expansion in the JSON visibly grows the drawn quad.

- [ ] **Step 5: Commit**

```bash
git add src/preview/shaders.ts src/preview/renderer.ts src/ui/previewPanel.ts
git commit -m "feat(borders): u_maskMode (none/texture/overlay) + expansion-aware band sizing in preview"
```

## Task 1.3: Tighten `LayerState` fill types

**Files:**
- Modify: `src/ui/state.ts`, `src/ui/surfaces/borders.ts`, `src/ui/previewPanel.ts`, `src/ui/propertiesForm.ts`
- Test: `npx tsc --noEmit`

- [ ] **Step 1:** In `src/ui/state.ts`, change `edgeFill: [string, string]` / `centerFill: [string, string]` to `[FillMode, FillMode]` (import `FillMode` from `../types`).

- [ ] **Step 2:** Remove the `as any` casts in `borders.ts` `flushLayers` (`edgeFill: lyr.edgeFill`, `centerFill: lyr.centerFill`) and in `previewPanel.ts` `layerInput`. In `propertiesForm.ts`, the fill `<select>` `onchange` assigns `s.value as FillMode` (values come from the fixed `FILLS` list, all valid).

- [ ] **Step 3:** Fix any resulting type errors where layer fills are read from JSON (in `main.ts` `selectBorder` — cast the JSON string to `FillMode` once at the parse boundary, since the schema guarantees membership).

- [ ] **Step 4:** Run `npx tsc --noEmit && npm test` — green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/state.ts src/ui/surfaces/borders.ts src/ui/previewPanel.ts src/ui/propertiesForm.ts src/ui/main.ts
git commit -m "refactor(borders): tighten LayerState fills to [FillMode,FillMode], drop as-any casts"
```

**Phase 1 gate:** `npm test`, `npx tsc --noEmit` green; manual GL smoke shows expansion + `#OVERLAY`.

---

# PHASE 2 — Render architecture: `mount()`/`update()` split, commit-on-pointer-up, focus preservation

**Spec §6.** This is the structural backbone Phases 3–5 build on. It is a refactor of existing behavior — no new user-facing features — so its acceptance is "everything still works, and gestures no longer rebuild the DOM or lose focus." Land it behind the existing UI before adding new widgets.

**Design:** Keep the borders-internal `state` + `subscribe`/`notify` bus (slice-1 isolation decision), but change what subscribers do and when `notify()` fires:

- Each panel exposes `mount(host)` (build DOM + bind listeners once per **structural identity** = selected border + which layers exist + active layer) and `update()` (cheap in-place refresh: redraw canvases, set input `.value`s skipping the focused element, update badges/readouts). No panel ever does `host.innerHTML = ...` on a plain value change.
- A `notify()` (document mutation) calls every panel's `update()`. A new `remount()` (structural change — border switch, layer add/remove) calls every panel's `mount()` then `update()`.
- Canvas gestures use `setPointerCapture`; mid-gesture motion calls only that panel's local `draw()`/GL `render()`. The **document mutation + `dirty` + `notify()`** happen once on **pointer-up**. View-only changes (pan, zoom, resize-preview) never set `dirty` and never `notify()` — they call local `draw()` only.
- `imageCanvas` cache keys off the `Rgba` object identity via a `WeakMap<Rgba, HTMLCanvasElement>` (kills I2).

## Task 2.1: Introduce the panel interface + remount/update split in the surface shell

**Files:**
- Modify: `src/ui/surfaces/borders.ts`, `src/ui/state.ts`

- [ ] **Step 1:** In `state.ts` add a structural-version counter and helpers:

```ts
export interface Panel { mount(host: HTMLElement): void; update(): void }
let structuralVersion = 0;
export function structuralKey(): string {
  return [state.selected, state.activeLayer, state.layers ? Object.keys(state.layers).filter((k) => (state.layers as any)[k]).join(',') : '', state.linked].join('|');
}
```

Keep `subscribe`/`notify` but add `notifyStructural()` that bumps a flag so the surface re-mounts panels. (Simplest: the surface tracks `lastStructuralKey`; on each `notify()` it compares `structuralKey()` and calls `mount()` when it changed, else `update()`.)

- [ ] **Step 2:** Rewrite `createBordersSurface.buildOnce` to lay out the new three-column grid hosts (slot list / cells / preview + the bottom fill/mask bars + docked geometry fields) and to register **panels** (objects with `mount`/`update`) instead of bare render closures. For this task, wrap the *existing* render functions as panels (`mount = render, update = render`) so behavior is unchanged; later tasks split them properly. The surface's single bus subscriber becomes:

```ts
let lastKey = '';
subscribe(() => {
  const key = structuralKey();
  if (key !== lastKey) { lastKey = key; for (const p of panels) p.mount(p.host); }
  for (const p of panels) p.update();
  flushLayers();
  if (bordersFile.dirty !== state.dirty) { bordersFile.dirty = state.dirty; onDirty(); }
});
```

- [ ] **Step 3:** Update the three-column container markup + add the matching CSS skeleton in `index.html` (`.borders-surface` becomes a CSS grid: `230px 1fr 1fr` columns with a bottom bar row, per spec §4). Keep it visually rough — Phases 3–5 refine.

- [ ] **Step 4:** Manual: `npm run build && npm run serve`; the borders surface still loads, switching borders works, editing still saves. (No regression; layout is the new grid.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/surfaces/borders.ts src/ui/state.ts index.html
git commit -m "refactor(borders): panel mount/update split + three-column grid shell (no behavior change)"
```

## Task 2.2: Cells panel — pointer capture, commit-on-pointer-up, WeakMap image cache

**Files:**
- Modify: `src/ui/rectEditor.ts`

- [ ] **Step 1:** Split `renderRectEditor` into `mountCellsPanel(host)` (build the toolbar + canvas + bind listeners once) and `updateCellsPanel()` (resize canvas if needed, refresh toolbar checkbox `.value`s without rebuilding, `draw()`). Move the `host.innerHTML = ...` into `mount` only.

- [ ] **Step 2:** Replace `canvas.onmousedown/onmousemove/onmouseup` with pointer events using `canvas.setPointerCapture(e.pointerId)` on down and `releasePointerCapture` on up. During move, mutate only the in-memory `state.layers[...].cells` rects **and call `draw(canvas)` directly** — do **not** set `state.dirty` and do **not** `notify()` mid-drag. On pointer-up: set `state.dirty = true` once and `notify()` once (commits the mutation to the doc via `flushLayers`). Pan/zoom (wheel, middle/shift-drag) call only `draw()` — never dirty/notify.

- [ ] **Step 3:** Replace the `imageCanvas`/`imageFor` string-keyed cache with `const imageCanvasCache = new WeakMap<Rgba, HTMLCanvasElement>()`; `ensureImageCanvas` looks up by `layer.image` identity.

- [ ] **Step 4:** Verify focus/no-rebuild manually + add the Playwright check in Phase 4 (cut-line drag). For now: dragging a cell handle no longer flickers the whole pane; the readout updates live.

- [ ] **Step 5: Commit**

```bash
git add src/ui/rectEditor.ts
git commit -m "refactor(borders): cells panel pointer-capture + commit-on-up + WeakMap image cache (I2)"
```

## Task 2.3: Geometry/properties fields — `update()` that skips the focused input

**Files:**
- Modify: `src/ui/propertiesForm.ts` (becomes the docked geometry fields)

- [ ] **Step 1:** Split into `mountGeometryFields(host)` (build the inputs once) and `updateGeometryFields()` which, for each `input[data-edge]`/`select[data-fill]`, sets `.value` from state **only when `document.activeElement !== input`** (preserves focus + in-progress typing). This kills the properties-form focus loss (debt) directly.

- [ ] **Step 2:** Input `onchange`/`oninput` handlers mutate the entry/layer and `notify()` (these are document mutations, so dirty+notify is correct). A field edit must flow into the preview's `update()` (re-render) — which it does, since `notify()` calls every panel's `update()`.

- [ ] **Step 3:** Manual: focus a Tessellation field, trigger an unrelated mutation (e.g. select another cell) → the field keeps focus and caret.

- [ ] **Step 4: Commit**

```bash
git add src/ui/propertiesForm.ts
git commit -m "refactor(borders): geometry fields update-in-place, skip focused input (focus preservation)"
```

## Task 2.4: Preview panel — `mount()`/`update()`, view-only resize/zoom not dirty

**Files:**
- Modify: `src/ui/previewPanel.ts`

- [ ] **Step 1:** Split `renderPreviewPanel` into `mountPreview(host)` (build canvas(es) + controls + the `PreviewRenderer` once) and `updatePreview()` (rebuild the `PreviewInput` and call `renderer.render`). Construct the renderer once in `mount`, dispose in a surface teardown. The W/H/zoom/pan are **preview state** (module-level), not document state — changing them calls `updatePreview()` only, never `notify()`/`dirty`.

- [ ] **Step 2:** Manual: resizing/zooming the preview does not enable Save; editing geometry does.

- [ ] **Step 3:** Run `npm test && npx tsc --noEmit`, then `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/previewPanel.ts
git commit -m "refactor(borders): preview mount/update split; view-only zoom/resize never dirties"
```

**Phase 2 gate:** Full `npm test` green; `npx tsc --noEmit` green; `npm run build` green. Manual: no DOM-rebuild flicker on gestures; focus retained while typing; Save enables only on document mutations; existing e2e (`npx playwright test`) still passes.

---

# PHASE 3 — Preview redesign: expansion overlay, resizable viewport, box-model handles

**Spec §5.1 + §5.2.** Build on the Phase-1 expansion plumbing and Phase-2 preview split. Two stacked canvases in a checkerboard container: the WebGL canvas (already there) + a 2D overlay canvas (handles/boxes/labels) sharing one zoom/pan view transform.

## Task 3.1: Overlay canvas + shared view transform + auto-fit

**Files:**
- Create: `src/ui/previewOverlay.ts`
- Modify: `src/ui/previewPanel.ts`, `index.html` (checkerboard container CSS)

- [ ] **Step 1:** Stack a transparent `<canvas class="pv-overlay">` over `#preview-canvas` in `mountPreview`. Add a shared `view = { zoom, panX, panY }` mapping panel-space pt → screen px. The GL draw maps the **drawn quad** through `view` via `gl.viewport`/`gl.scissor` into its canvas region; the overlay draws in screen space using the same transform.

- [ ] **Step 2:** `previewOverlay.ts` exports `drawOverlay(ctx, view, model, toggles)` where `model` carries drawn-quad rect, layout-rect (from `layoutRectFraction`, Task 0.2), band positions, centerTile box, margin/padding/minsize. Draw: drawn-quad outline (solid), layout rect (dashed), and whichever toggles are on.

- [ ] **Step 3:** Auto-fit on border switch: in `mountPreview`/on remount, compute `view` so the drawn quad fits the canvas with padding (closes the deferred view-fit debt).

- [ ] **Step 4:** Wheel-zoom about cursor + middle/shift-drag pan (mirror the cells canvas gestures); both are view-only (`updatePreview()` + overlay redraw, never dirty).

- [ ] **Step 5:** Manual: the layout rect shows dashed, inset by Expansion; asymmetric expansion visibly offsets it; zoom/pan work and don't dirty.

- [ ] **Step 6: Commit**

```bash
git add src/ui/previewOverlay.ts src/ui/previewPanel.ts index.html
git commit -m "feat(borders): preview overlay canvas, shared zoom/pan view, auto-fit, dashed layout rect"
```

## Task 3.2: Toggleable overlay chips + draggable box-model edges

**Files:**
- Modify: `src/ui/previewPanel.ts`, `src/ui/previewOverlay.ts`, `index.html`

Each overlay independently on/off via toolbar chips (spec §5.2). Drag handles use pointer capture; commit on pointer-up (mutate the entry, `dirty`, `notify()`); the docked numeric fields stay in sync (bidirectional).

- [ ] **Step 1: Chrome/Expansion** — tinted ring between drawn quad and layout rect; ring edges draggable → `Expansion[l,t,r,b]` (pt). Top edge above / bottom below (y-down JSON). On pointer-up write `entry.Expansion`.

- [ ] **Step 2: Cuts/Tessellation** — band-edge lines at `positions[1]`/`positions[4]` per axis with draggable handles → `Tessellation`. Dragging writes pt; if the axis is currently in fraction units (deciding component ≤ 1, per §7/Task 0.6), convert via `tessFractionToPt`/`tessPtToFraction` (Task 0.2) so the axis keeps its unit. Collapsed band edges (Fix() merged) render as one line with a "drag apart to un-collapse" affordance.

- [ ] **Step 3: CenterTile** — when non-collapsed, the band-2 box with draggable edges → `CenterTile[x0,y0,x1,y1]` (pt offsets from the drawn-quad center). When collapsed (`[1,1,-1,-1]`), a center crosshair + "enable center tile" affordance that seeds a small symmetric box; a "collapse" action restores `[1,1,-1,-1]`.

- [ ] **Step 4: Margin/Padding/MinSize** — devtools-style nested boxes (margin outside the layout rect, padding inside, MinSize a dotted floor box). Margin/padding edges draggable → `Style.Margin`/`Style.Padding`; MinSize is display-only on canvas (edited numerically).

- [ ] **Step 5:** Each chip toggles a boolean in preview state; `drawOverlay` reads the toggle set. Hit-testing lives in `previewOverlay.ts` (`hitOverlay(view, model, sx, sy) -> handle | null`).

- [ ] **Step 6: Playwright** (add to `e2e/editor.spec.ts`): toggle the Expansion chip, drag its right ring edge, assert the Expansion `[2]` numeric field changed and Save enabled; resize the preview panel by its handle and assert W/H inputs update with **no** dirty flag.

- [ ] **Step 7:** `npm run build && npx playwright test` green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/previewPanel.ts src/ui/previewOverlay.ts index.html e2e/editor.spec.ts
git commit -m "feat(borders): toggleable box-model overlays with draggable edges, bidirectional numeric sync"
```

## Task 3.3: Resizable preview viewport + docked geometry fields + fill-mode descriptions

**Files:**
- Modify: `src/ui/previewPanel.ts`, `src/ui/propertiesForm.ts` (docked under preview), `index.html`

- [ ] **Step 1:** The layout rect's right edge / bottom edge / corner are resize handles (`ew/ns/nwse-resize`) updating the previewed panel size in pt; W/H numeric inputs stay synced. Size is **preview state**, not document state (no dirty).

- [ ] **Step 2:** Dock the geometry fields (Tessellation/Expansion/CenterTile/Style — from the Phase-2 split) under the preview as synced readouts; canvas drags flow into them and typing flows back into the canvas via `update()`.

- [ ] **Step 3:** Add a one-line description per selected fill mode (STRETCH/TILE/FLEXIBLE/CENTER from the package doc; SNAP labeled "reserved — renders as stretch") — replaces the mockup's animated strip diagram (spec non-goal).

- [ ] **Step 4:** Manual + the Phase-3.2 Playwright covers resize-no-dirty.

- [ ] **Step 5: Commit**

```bash
git add src/ui/previewPanel.ts src/ui/propertiesForm.ts index.html
git commit -m "feat(borders): resizable preview viewport + docked geometry fields + fill-mode descriptions"
```

**Phase 3 gate:** `npm test`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` all green.

---

# PHASE 4 — Cells editor redesign: cell-map widget + grid modes + mirrored-corner action

**Spec §5.3.** Build on Phase-0 `gridModes.ts` and the Phase-2 cells panel. The v1 free-mode canvas stays; new widgets wrap it.

## Task 4.1: 5×5 cell-map minimap

**Files:**
- Create: `src/ui/cellMap.ts`
- Modify: `src/ui/rectEditor.ts` (mount the map beside the canvas), `index.html`

- [ ] **Step 1:** `cellMap.ts` renders a 5×5 grid of tiles beside the canvas: selection highlight (click → `state.selectedCell`, then `notify()`); per-tile glyphs — mirror orientation, rotation `↻` (when stored coord order is reversed, `dp<0` in the shader: detect `(rect[2]-rect[0])*(rect[3]-rect[1]) < 0` after sign), degenerate (zero-area source rect).

- [ ] **Step 2:** Dim tiles whose **panel band is collapsed** under the current preview geometry: call `computeBands` on the preview's panel size (expanded), and mark band index `i` collapsed when `positionsX[i] === positionsX[i+1]` (and same for Y); a cell `[y][x]` is dimmed when its column or row band is collapsed. This is the cells↔tessellation feedback loop.

- [ ] **Step 3:** Wire `cellMap` as a panel (`mount`/`update`): `update()` re-derives glyphs/dimming without rebuilding the tile DOM (toggle classes).

- [ ] **Step 4:** Manual: selecting a tile selects the cell on the canvas and vice-versa; collapsing a band (via tessellation) dims the right tiles.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cellMap.ts src/ui/rectEditor.ts index.html
git commit -m "feat(borders): 5x5 cell-map widget — selection, mirror/rotation/degenerate glyphs, collapsed-band dimming"
```

## Task 4.2: Grid modes (3×3 / 5×5-lines) with live line dragging

**Files:**
- Modify: `src/ui/rectEditor.ts`, `index.html`

Replaces v1's staged 9-patch apply/cancel with live line dragging, driven by `gridModes.ts`.

- [ ] **Step 1:** Mode bar with three buttons: **Free**, **3×3**, **5×5 lines**. Availability from `detectGridMode(currentCells)` (Task 0.3): enable 3×3 when detection returns `'3x3'`; enable 5×5-lines when `'5x5lines'` (or `'3x3'`, which is a special case of a partition); disable with a tooltip naming why when `'free'` (e.g. "aliased corner art — free mode only"). Entering a mode never converts data; it exposes the implied lines via `extractLines3x3`/`extractLines5x5`.

- [ ] **Step 2:** In 3×3 mode, draw 2 draggable cut lines per axis on the image; drag (pointer capture) updates a local `{xCuts,yCuts}`, redraws via `draw()`, and on pointer-up calls `rewrite3x3(cells, xCuts, yCuts, imageSize)` → assigns to the layer(s) (respecting `linked`), sets `dirty`, `notify()`. This replaces `enterNinePatch`/`applyNinePatch`/`cancelNinePatch` (remove them).

- [ ] **Step 3:** In 5×5-lines mode, draw 6 draggable lines per axis; drag a line → `rewrite5x5Line(cells, axis, index, value, imageSize)` (clamped to neighbors) on pointer-up.

- [ ] **Step 4:** Free mode keeps the existing per-cell rect/handle drag from Phase 2.

- [ ] **Step 5: Playwright** (`e2e/editor.spec.ts`): switch to 3×3 mode, drag a cut line, assert the cells readout changes, Save, and that a reload round-trips the new cells (the serialized 25-rect form).

- [ ] **Step 6: Commit**

```bash
git add src/ui/rectEditor.ts index.html e2e/editor.spec.ts
git commit -m "feat(borders): live 3x3 / 5x5-lines grid modes via gridModes, replacing staged 9-patch"
```

## Task 4.3: Mirrored-corner convenience action

**Files:**
- Modify: `src/ui/rectEditor.ts`

- [ ] **Step 1:** With a cell selected in free mode, a "mirror from opposite cell" action copies the opposite corner/edge cell's `rect` and sets the mirror flag(s) for the crossed axes (one-shot copy; the data model has no persistent links). UI copy must say "copies; doesn't stay linked." On click: mutate, `dirty`, `notify()`.

- [ ] **Step 2:** Manual verification (one-shot copy; editing the source later does not change the target).

- [ ] **Step 3: Commit**

```bash
git add src/ui/rectEditor.ts
git commit -m "feat(borders): mirror-from-opposite-cell one-shot convenience (free mode)"
```

**Phase 4 gate:** `npm test`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` green.

---

# PHASE 5 — Slot list, fill/mask bars, Comment, Editor read-back

**Spec §5.4 + §5.5 + §5.6.** Wires Phase-0 `allBorderNames`/`unusedBorderNames`, `countBordersSharingImage`, `maskMode`, `editorReadback`.

## Task 5.1: Slot list with thumbnails, shared-sheet badge, severity dots, add/delete

**Files:**
- Create: `src/ui/slotList.ts` (replaces `borderList.ts` rendering)
- Modify: `src/ui/surfaces/borders.ts` (mount slotList in the left column), `index.html`

- [ ] **Step 1:** Rows: 32px thumbnail (overlay image, cached per `Rgba` identity, invalidated on image change — spec §9.3), monospace slot name, shared-sheet badge **⛓N** when `countBordersSharingImage(index, overlayImagePath) >= 2`, and a worst-severity dot computed from `ctx.index`/the issue list whose `nav.entry.name === border`. (The surface receives issues via the slice-1 `SurfaceContext`/`refresh`; thread the current `Issue[]` into the slot list `update()`.)

- [ ] **Step 2:** "＋ Add slot": a dropdown of `unusedBorderNames(state.doc.names)`; selecting inserts a minimal entry `{"Overlay": {"Image": "", "Cells": "#COPY"}}` guarded by `isValidBorderName`, selects it, marks dirty, **structural** remount. (Note: schema requires `Cells` on a layer, so seed `Cells`; `#COPY` is invalid alone without a Mask — seed a default single-cell instead: `{"Overlay":{"Image":"","Cells":[[0,1],[0,1]]}}`. Verify against the schema during implementation and adjust the seed to whatever validates clean.)

- [ ] **Step 3:** Per-row delete action (with confirm) removing the key; structural remount; dirty.

- [ ] **Step 4:** Wire as a panel; `update()` refreshes badges/dots/thumbs without rebuilding rows unless the name set changed.

- [ ] **Step 5: Playwright/manual:** add a slot → it appears selected and Save enables; delete it → gone; a shared image shows ⛓2.

- [ ] **Step 6: Commit**

```bash
git add src/ui/slotList.ts src/ui/surfaces/borders.ts index.html
git commit -m "feat(borders): slot list — thumbnails, shared-sheet badge, severity dots, add/delete slot"
```

## Task 5.2: Fill bar + mask-mode bar + Comment field

**Files:**
- Modify: `src/ui/propertiesForm.ts` (or a new `src/ui/fillMaskBar.ts`), `index.html`

- [ ] **Step 1: OVERLAY zone** — EdgeFill x/y + CenterFill x/y dropdowns (existing behavior, moved to the bottom bar) plus the one-line mode description (Task 3.3 strings).

- [ ] **Step 2: MASK zone** — a mode `<select>` (`image` / `#COPY` / `#OVERLAY` / `none`) backed by `readMaskMode`/`setMaskMode` (Task 0.4). On change: mutate `entry`, `dirty`, structural remount (layer presence changes → mount), and pass the right `maskMode` to the preview (Task 1.2).

- [ ] **Step 3: Comment** — a free-text field per layer writing the `Comment` key (schema already allows it at layer level; the border-level `Comment` too). Verify the slice-1 unknown-key→notice validator does **not** flag it (it won't — schema permits `Comment`). `oninput` mutates + dirty + `notify()` (focus-preserving update applies).

- [ ] **Step 4: Manual:** switch mask mode through all four forms and confirm JSON round-trips (re-select the border, the control reflects the saved value); a Comment saves and does not raise a notice.

- [ ] **Step 5: Commit**

```bash
git add src/ui/propertiesForm.ts index.html
git commit -m "feat(borders): fill bar + mask-mode select (#OVERLAY) + Comment field"
```

## Task 5.3: Editor read-back on select

**Files:**
- Modify: `src/ui/main.ts` (`selectBorder`), `src/ui/slotList.ts` or the cells panel (the "packed — editing source" badge), `index.html`

- [ ] **Step 1:** In `selectBorder`, after loading the entry, call `editorSourceCells(entry)` (Task 0.5). When present **and** the source image loads (via the existing image loader / `src/images.ts`), build the layer state from `Editor.source` + `Editor.sourceCells` instead of the packed-sheet cells, and show a "packed — editing source" badge. If the source image fails to load, fall back to packed cells + a warning (reuse the existing `state.saveStatus`/toast channel).

- [ ] **Step 2:** Confirm `getEditorMeta`/`setEditorMeta` are no longer orphans (read by `editorReadback`, written by `applyPackResult`). The export panel's pack still writes `Editor`; re-selecting reopens from source → pack → re-edit → re-pack is now a real loop.

- [ ] **Step 3: Manual:** pack a border (export panel), re-select it → it reopens in source space with the badge; corrupt the `Editor.source` path in a fixture copy → it falls back to packed with a warning.

- [ ] **Step 4: Commit**

```bash
git add src/ui/main.ts src/ui/slotList.ts index.html
git commit -m "feat(borders): Editor metadata read-back — packed borders reopen from source"
```

**Phase 5 gate (final):** `npm test`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` all green. Manual end-to-end pass against a **fixture copy** of `borders.json` (never the live file by default): add a slot, drag a 3×3 cut, toggle overlays and drag an Expansion edge, switch mask to `#OVERLAY`, add a Comment, Save → reload → everything round-trips; the validation panel shows the new tessellation-units warning where applicable.

---

## Self-Review (planning)

- **Spec coverage:** §5.1 preview expansion → Tasks 0.2/1.2/3.1; §5.2 viewport+overlays → 3.1/3.2/3.3; §5.3 cells redesign → 0.3/4.1/4.2/4.3; §5.4 slot list → 0.1/0.7/5.1; §5.5 fill/mask/comment → 0.4/1.2/5.2; §5.6 Editor read-back → 0.5/5.3; §6 render arch → Phase 2 + 1.1; §6 renderer M5/M6/M7 → 1.1; `u_maskMode` → 1.2; type-tightening → 1.3; §7 validator → 0.6. All covered.
- **Open questions resolved:** (Q2) schema already allows `Comment` + `Editor` — verified, no whitelist change. (Q1) `.sdf` divergence documented in the shader header (Task 1.2 step 1). (Q3) thumbnails cached per `Rgba` identity (Task 5.1 step 1).
- **Type consistency:** `CellGrid`/`EditorCell`/`Vec4`/`FillMode` used consistently with `src/types.ts`; `computeBands(tessellation, centerTile, sizePt)` signature unchanged (callers pass expanded size); `rewrite3x3`/`rewrite5x5Line` return `CellGrid`; `MaskMode`/`GridMode` string unions match their tests.
- **Known seed caveat flagged:** Task 5.2/5.1 — a layer requires `Cells` per schema; the add-slot seed must validate clean (use a real single-cell, not bare `#COPY`). Called out inline for the implementer to verify against the schema.
- **Honesty about granularity:** Phases 0–1 are full line-level TDD. Phases 2–5 are structural specs (exact files, signatures, integration points, Playwright/manual gates) because they are canvas/WebGL interaction code where line-by-line invented GL in a plan would be guesswork; each task still has a concrete verification gate.
