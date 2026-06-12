# Response Curves Editor Implementation Plan (Slice 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only `responseCurves` table surface with a full authoring surface for `response curves.json` — six tabs, engine-faithful cubic-spline editors, and an animated 2D-canvas widget preview.

**Architecture:** A 4-panel `Surface` (rail tabs │ entry list │ editor │ preview) over a small pub/sub bus ported from `src/bg/state.ts` (re-entrancy-guarded notify + idempotent setters). Pure logic (`src/rc/*`) is unit-tested in Vitest; UI (`src/ui/rc/*`) is `tsc`-checked and e2e-smoked. The preview ports the engine's **cubic Catmull-Rom spline verbatim** and folds channels with the engine's per-channel add/multiply rules. Edits mutate `file.root` in place, set `file.dirty`, call `onDirty()`; transport/preview state never dirties the document.

**Tech Stack:** Vite 5 · vanilla TypeScript (strict) · Vitest (node env, no DOM) · Playwright (port 8137) · 2D canvas. Schema is **out-of-repo** at `/mnt/Passport/Lifaundi/Gui/schemas/response-curves.schema.json` (no schema change this slice).

---

## Ground rules (carried from prior slices — do not violate)

- **Branch:** work on `slice-5-response-curves` only. No new branches, no force-push, never `npm install` (`node_modules` is a symlink to an ext4 cache).
- **In-place root mutation:** never reassign `file.root`. Reassigning a sub-table (`root['Events'] = {...}` during rename) is allowed.
- **Preview/transport never dirties the document** (no `markDirty()` from play/pause/scrub/loop/trigger).
- **Forms skip `document.activeElement` in their `update()`** so typing isn't clobbered (see `gradientEditor.ts:93-94` for the pattern).
- **`tsc --noEmit` after every task** (`npm run build` runs `tsc --noEmit && vite build`). **`npm run build` before any e2e run** — `server.js` serves `dist/`.
- Live data files (`response curves.json`, `backgrounds.json`) are read-only working data, written only via the user-invoked Save path. Tests must not write them.
- Commit messages end with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Port 8137 zombie cleanup** before e2e: `ss -ltnp | grep 8137` then `pkill -f server.js` if held.

## Engine source of truth

`/mnt/Passport/Engine/Kreatures/Engine/src/Gui/Themes/gui_themepackage.cpp`:
- `Spline::compute` (lines 434–511) — the cubic + 4-index/local-`t` selection (ported verbatim in Task 1).
- `ComputeState`/`ComputeEvent` (lines 798–918) — per-channel combine rules (Task 2).
- `Response::matrix()` (line 920) — scale → rotate → translate (Task 13 preview).

## File structure

```
src/rc/
  spline.ts      Task 1  Verbatim cubic port; fromMarks/durationOf/sampleSpline. PURE.
  channels.ts    Task 2  CHANNELS table + fold(). PURE.
  state.ts       Task 3  rc pub/sub bus (guarded notify, idempotent setters). PURE.
  rename.ts      Task 4  renameRcEntry over rc:* namespaces. PURE.
src/ui/bg/
  gradientBar.ts Task 5  NEW extracted createGradientBar(opts).
  gradientEditor.ts Task 5 MODIFIED → thin adapter (linear-srgb mode).
src/ui/rc/
  types.ts       Task 6  RcFormDeps / RcPreviewDeps.
  entryList.ts   Task 6  rc entry rows + add/delete/rename.
  splinePlot.ts  Task 7  Shared 1D/2D canvas plot (engine cubic).
  curveForm.ts   Task 8  Response Curves slots editor.
  eventForm.ts   Task 9  Events channel-binding editor.
  soundForm.ts   Task 10 Sound Effects editor.
  gradientForm.ts Task 11 createGradientBar adapter (engine-cubic-raw).
  previewPanel.ts Task 12 Animated widget preview + transport.
  surface.ts     Task 13 createResponseCurvesSurface.
src/ui/boot.ts   Task 14 MODIFIED swap; index.html CSS.
e2e/editor.spec.ts Task 15 append-only smokes.
tests/rc/        Tasks 1–4 unit tests.
tests/bg/gradients.test.ts Task 5 byte-parity regression.
```

---

## Task 1: Spline cubic port (`src/rc/spline.ts`)

**Files:**
- Create: `src/rc/spline.ts`
- Test: `tests/rc/spline.test.ts`

This is the highest-fidelity task. The cubic must match the engine. The engine evaluates a `glm::vec` cubic; because the cubic is affine in the four control points, evaluating it **per component** is numerically identical, so we sample component-wise for dims 1/2/4.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rc/spline.test.ts
import { describe, it, expect } from 'vitest';
import { fromMarks, durationOf, sampleSpline, type Mark1, type Mark2 } from '../../src/rc/spline';

// Hand-evaluate the engine cubic for cross-checks.
function cubicRef(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m1 = (p1 - p0) - (p2 - p0) / 2 + (p2 - p1);
  const m2 = (p2 - p1) - (p3 - p1) / 2 + (p3 - p2);
  const a = 2 * (p1 - p2) + m1 + m2;
  const b = -3 * (p1 - p2) - m1 - m1 - m2;
  const c = m1, d = p1;
  return a * t * t * t + b * t * t + c * t + d;
}

describe('rc/spline', () => {
  it('single mark is a constant', () => {
    const m: Mark1[] = [[0, 7]];
    expect(sampleSpline(m, 1, 0, false)).toEqual([7]);
    expect(sampleSpline(m, 1, 99, false)).toEqual([7]);
    expect(durationOf(m)).toBe(0);
  });

  it('clamps before the first knot and after the last (one-shot)', () => {
    const m: Mark1[] = [[1, 10], [2, 20], [3, 30]];
    expect(sampleSpline(m, 1, 0, false)).toEqual([10]); // t < input[0] → output[0]
    expect(sampleSpline(m, 1, 5, false)).toEqual([30]); // past end → output[last]
  });

  it('matches the engine cubic in the t<input[1] segment (one-shot)', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5]]; // input[0]=0,input[1]=1
    // one-shot: loopBegin=false → indices (0,0,1, min(2,2)=2); local t = (t-0)/(1-0)
    const got = sampleSpline(m, 1, 0.5, false)[0];
    const want = cubicRef(0, 0, 10, 5, 0.5);
    expect(got).toBeCloseTo(want, 10);
  });

  it('matches the engine cubic in a general interior segment', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5], [3, 8]];
    // t in [input[2],input[3]) → i=3: indices (1,2,3, min(4,3)=3); local t=(t-input[2])/(input[3]-input[2])
    const got = sampleSpline(m, 1, 2.25, false)[0];
    const want = cubicRef(10, 5, 8, 8, 0.25);
    expect(got).toBeCloseTo(want, 10);
  });

  it('loop wraps neighbours before the first knot', () => {
    const m: Mark1[] = [[1, 10], [2, 20], [3, 30]]; // elements=3, input[0]=1
    // t<input[0] & loop → compute(elements-2,elements-1,0,1, t/input[0]) = (1,2,0,1, 0.5/1)
    const got = sampleSpline(m, 1, 0.5, true)[0];
    const want = cubicRef(20, 30, 10, 20, 0.5);
    expect(got).toBeCloseTo(want, 10);
  });

  it('loop applies modulo on the duration', () => {
    const m: Mark1[] = [[0, 0], [1, 10], [2, 5]];
    expect(sampleSpline(m, 1, 2, true)).toEqual(sampleSpline(m, 1, 0, true)); // dur=2 → t=2 wraps to 0
  });

  it('samples 2D component-wise', () => {
    const m: Mark2[] = [[0, [0, 0]], [1, [10, -4]], [2, [5, 2]]];
    const got = sampleSpline(m, 2, 0.5, false);
    expect(got[0]).toBeCloseTo(cubicRef(0, 0, 10, 5, 0.5), 10);
    expect(got[1]).toBeCloseTo(cubicRef(0, 0, -4, 2, 0.5), 10);
  });

  it('durationOf is the last knot time', () => {
    expect(durationOf([[0, 0], [1.5, 9]] as Mark1[])).toBe(1.5);
  });

  it('fromMarks splits input/output', () => {
    const s = fromMarks([[0, [1, 2]], [1, [3, 4]]] as Mark2[]);
    expect(s.input).toEqual([0, 1]);
    expect(s.output).toEqual([[1, 2], [3, 4]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rc/spline.test.ts`
Expected: FAIL ("Cannot find module '../../src/rc/spline'").

- [ ] **Step 3: Implement `src/rc/spline.ts`**

```ts
// src/rc/spline.ts
// Verbatim port of Gui::ThemePackage::Spline::compute (gui_themepackage.cpp:434-511).
// The engine evaluates a glm::vec Catmull-Rom cubic; it is affine in the control points,
// so we evaluate component-wise (identical result) for dims 1/2/4.

export type Dim = 1 | 2 | 4;
export type Mark1 = [number, number];           // [t, v]
export type Mark2 = [number, [number, number]]; // [t, [x, y]]
export type Mark4 = [number, [number, number, number, number]]; // [t, [r,g,b,a]]
export type AnyMark = [number, number | number[]];

export interface SplineData { input: number[]; output: number[][]; }

// Normalize JSON marks (value may be a scalar or a vector) into flat strided output rows.
export function fromMarks(marks: ReadonlyArray<AnyMark>): SplineData {
  const input: number[] = [];
  const output: number[][] = [];
  for (const [t, v] of marks) {
    input.push(t);
    output.push(Array.isArray(v) ? v.slice() : [v]);
  }
  return { input, output };
}

export function durationOf(marks: ReadonlyArray<AnyMark>): number {
  return marks.length ? marks[marks.length - 1][0] : 0;
}

// Engine cubic for one scalar component (compute<T>(n0,n1,n2,n3,t), kept un-simplified).
function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m1 = (p1 - p0) - (p2 - p0) / 2 + (p2 - p1);
  const m2 = (p2 - p1) - (p3 - p1) / 2 + (p3 - p2);
  const a = 2 * (p1 - p2) + m1 + m2;
  const b = -3 * (p1 - p2) - m1 - m1 - m2;
  const c = m1;
  const d = p1;
  return a * (t * t * t) + b * (t * t) + c * t + d;
}

function computeVec(out: number[][], n0: number, n1: number, n2: number, n3: number, t: number, dim: Dim): number[] {
  const r: number[] = [];
  for (let k = 0; k < dim; ++k) r.push(cubic(out[n0][k], out[n1][k], out[n2][k], out[n3][k], t));
  return r;
}

// Port of compute<T>(timestamp, loop_begin, loop_end) — index + local-t selection. t in seconds.
function computeSelect(s: SplineData, dim: Dim, t: number, loopBegin: boolean, loopEnd: boolean): number[] {
  const input = s.input, output = s.output, elements = input.length;
  if (elements === 1) return output[0].slice();

  if (t < input[0]) {
    if (loopBegin && elements >= 2) {
      return computeVec(output, elements - 2, elements - 1, 0, 1, t / input[0], dim);
    }
    return output[0].slice();
  }

  if (t < input[1]) {
    const afterTheEnd = loopEnd ? (2 % elements) : Math.min(2, elements - 1);
    return computeVec(output, loopBegin ? elements - 1 : 0, 0, 1, afterTheEnd,
      (t - input[0]) / (input[1] - input[0]), dim);
  }

  for (let i = 2; i < elements; ++i) {
    if (t < input[i]) {
      return computeVec(output, i - 2, i - 1, i,
        loopEnd ? (i + 1) % elements : Math.min(i + 1, elements - 1),
        (t - input[i - 1]) / (input[i] - input[i - 1]), dim);
    }
  }

  return output[elements - 1].slice();
}

// Sample at time `tSeconds`. Looping wraps on the duration (engine: timestamp % totalDurationMS)
// with neighbour wrap (loopBegin=loopEnd=true). One-shots clamp at the ends.
export function sampleSpline(marks: ReadonlyArray<AnyMark>, dim: Dim, tSeconds: number, loop: boolean): number[] {
  const s = fromMarks(marks);
  let t = tSeconds;
  if (loop) {
    const dur = durationOf(marks);
    if (dur > 0) t = ((tSeconds % dur) + dur) % dur;
  }
  return computeSelect(s, dim, t, loop, loop);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rc/spline.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/rc/spline.ts tests/rc/spline.test.ts
git commit -m "feat(rc): verbatim cubic Catmull-Rom spline sampler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Channels table + fold (`src/rc/channels.ts`)

**Files:**
- Create: `src/rc/channels.ts`
- Test: `tests/rc/channels.test.ts`

Single source of truth for the seven event channels, shared by the event form and the preview. Combine rules come from `ComputeState`/`ComputeEvent`: Translation `+=`, Scaling `*=`, Rotation `+=`, Style `+=`, Tint `*=`, Font Color `+=`, Sound plays.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rc/channels.test.ts
import { describe, it, expect } from 'vitest';
import { CHANNELS, CHANNEL_KEYS, fold } from '../../src/rc/channels';

describe('rc/channels', () => {
  it('has the seven engine channels with exact JSON keys', () => {
    expect(CHANNEL_KEYS).toEqual(['Translation', 'Rotation', 'Style', 'Scaling', 'Tint', 'Sound Effect', 'Font Color']);
  });
  it('maps each channel to its table/dim/combine/identity', () => {
    expect(CHANNELS.Translation).toMatchObject({ kind: 'spline2d', dim: 2, combine: 'add', table: '2D Splines', ns: 'rc:splines2d', ident: [0, 0] });
    expect(CHANNELS.Scaling).toMatchObject({ combine: 'multiply', ident: [1, 1] });
    expect(CHANNELS.Rotation).toMatchObject({ kind: 'spline1d', dim: 1, combine: 'add', ident: [0] });
    expect(CHANNELS.Style).toMatchObject({ kind: 'spline1d', combine: 'add' });
    expect(CHANNELS.Tint).toMatchObject({ kind: 'gradient', dim: 4, combine: 'multiply', table: 'Gradients', ns: 'rc:gradients', ident: [1, 1, 1, 1] });
    expect(CHANNELS['Font Color']).toMatchObject({ combine: 'add', ident: [0, 0, 0, 0] });
    expect(CHANNELS['Sound Effect']).toMatchObject({ kind: 'sound', combine: 'sound', table: 'Sound Effects', ns: 'rc:sounds' });
  });
  it('folds add and multiply component-wise', () => {
    expect(fold('add', [1, 2], [3, 4])).toEqual([4, 6]);
    expect(fold('multiply', [2, 3], [4, 5])).toEqual([8, 15]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rc/channels.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/rc/channels.ts`**

```ts
// src/rc/channels.ts
import type { Namespace } from '../package/refIndex';
import type { Dim } from './spline';

export type ChannelKey = 'Translation' | 'Rotation' | 'Style' | 'Scaling' | 'Tint' | 'Sound Effect' | 'Font Color';
export type Combine = 'add' | 'multiply' | 'sound';

export interface ChannelSpec {
  kind: 'spline1d' | 'spline2d' | 'gradient' | 'sound';
  dim: Dim;            // 1/2/4 for splines; ignored for sound (use 1 as a filler)
  combine: Combine;
  ident: number[];     // identity base the channel folds onto
  table: string;       // JSON table the ref points into
  ns: Namespace;       // refIndex namespace
}

// Order matches the engine's apply order (matrix channels, then tint, then style, then font color).
export const CHANNEL_KEYS: ChannelKey[] = ['Translation', 'Rotation', 'Style', 'Scaling', 'Tint', 'Sound Effect', 'Font Color'];

export const CHANNELS: Record<ChannelKey, ChannelSpec> = {
  'Translation': { kind: 'spline2d', dim: 2, combine: 'add', ident: [0, 0], table: '2D Splines', ns: 'rc:splines2d' },
  'Scaling': { kind: 'spline2d', dim: 2, combine: 'multiply', ident: [1, 1], table: '2D Splines', ns: 'rc:splines2d' },
  'Rotation': { kind: 'spline1d', dim: 1, combine: 'add', ident: [0], table: '1D Splines', ns: 'rc:splines1d' },
  'Style': { kind: 'spline1d', dim: 1, combine: 'add', ident: [0], table: '1D Splines', ns: 'rc:splines1d' },
  'Tint': { kind: 'gradient', dim: 4, combine: 'multiply', ident: [1, 1, 1, 1], table: 'Gradients', ns: 'rc:gradients' },
  'Font Color': { kind: 'gradient', dim: 4, combine: 'add', ident: [0, 0, 0, 0], table: 'Gradients', ns: 'rc:gradients' },
  'Sound Effect': { kind: 'sound', dim: 1, combine: 'sound', ident: [], table: 'Sound Effects', ns: 'rc:sounds' },
};

export function fold(combine: Combine, base: number[], v: number[]): number[] {
  if (combine === 'multiply') return base.map((b, i) => b * v[i]);
  if (combine === 'add') return base.map((b, i) => b + v[i]);
  return base; // sound: no transform contribution
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rc/channels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/rc/channels.ts tests/rc/channels.test.ts
git commit -m "feat(rc): channel combine table (add/multiply identities)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: rc state bus (`src/rc/state.ts`)

**Files:**
- Create: `src/rc/state.ts`
- Test: `tests/rc/state.test.ts`

Ports `src/bg/state.ts` shape and its slice-4 fixes (re-entrancy-guarded `rcNotify`, idempotent setters) baked in from the start. Transport (`playing`/`scrubSeconds`/`loop`) and `trigger` are preview-only — they notify but never dirty the document.

- [ ] **Step 1: Write the failing tests** (ported from `tests/bg/state.test.ts`, adapted)

```ts
// tests/rc/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rcState, rcSubscribe, rcNotify, rcStructuralKey,
  selectRcTab, selectRcEntry, setTrigger, setTransport,
} from '../../src/rc/state';

beforeEach(() => {
  rcState.tab = 'curves';
  rcState.selected = { curves: null, events: null, splines1d: null, splines2d: null, gradients: null, sounds: null };
  rcState.playing = false; rcState.scrubSeconds = 0; rcState.loop = true;
  rcState.trigger = null; rcState.structuralNonce = 0; rcState.rev = 0;
});

describe('rc/state', () => {
  it('notifies subscribers', () => {
    let n = 0; rcSubscribe(() => n++); rcNotify(); expect(n).toBe(1);
  });

  it('structural key changes on tab switch and selection', () => {
    const k0 = rcStructuralKey();
    selectRcTab('events');
    expect(rcStructuralKey()).not.toBe(k0);
    const k1 = rcStructuralKey();
    selectRcEntry('events', 'Hover');
    expect(rcStructuralKey()).not.toBe(k1);
  });

  it('selectRcEntry stores per-tab selection', () => {
    selectRcEntry('splines1d', 'wobble');
    expect(rcState.selected.splines1d).toBe('wobble');
    expect(rcState.selected.events).toBeNull();
  });

  it('setTransport on unchanged values does not notify', () => {
    setTransport({ playing: false });
    let n = 0; rcSubscribe(() => n++);
    setTransport({ playing: false }); // identical → suppressed
    expect(n).toBe(0);
    setTransport({ playing: true });  // changed → notifies
    expect(n).toBe(1);
  });

  it('setTrigger is idempotent on an identical trigger', () => {
    setTrigger({ kind: 'event', name: 'Hover' });
    let n = 0; rcSubscribe(() => n++);
    setTrigger({ kind: 'event', name: 'Hover' });
    expect(n).toBe(0);
    setTrigger({ kind: 'event', name: 'Click' });
    expect(n).toBe(1);
  });

  it('a subscriber that calls setTransport does not recurse infinitely', () => {
    let runs = 0;
    rcSubscribe(() => { runs++; setTransport({ scrubSeconds: 1 }); });
    expect(() => rcNotify()).not.toThrow();
    expect(runs).toBeLessThan(5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rc/state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/rc/state.ts`**

```ts
// src/rc/state.ts
export type RcTab = 'curves' | 'events' | 'splines1d' | 'splines2d' | 'gradients' | 'sounds';
export type TriggerKind = 'event' | 'spline1d' | 'spline2d' | 'gradient';
export interface Trigger { kind: TriggerKind; name: string; }

export interface RcState {
  tab: RcTab;
  selected: Record<RcTab, string | null>;
  // preview transport — NEVER dirties the document
  playing: boolean;
  scrubSeconds: number;
  loop: boolean;
  trigger: Trigger | null;
  structuralNonce: number;
  rev: number; // bump to force plot/preview redraw without a re-mount
}

export const rcState: RcState = {
  tab: 'curves',
  selected: { curves: null, events: null, splines1d: null, splines2d: null, gradients: null, sounds: null },
  playing: false, scrubSeconds: 0, loop: true, trigger: null, structuralNonce: 0, rev: 0,
};

type Listener = () => void;
const listeners: Listener[] = [];
export function rcSubscribe(fn: Listener): void { listeners.push(fn); }

// Re-entrancy guard (slice-4 fix): a notify raised during notification is coalesced into one more pass.
let notifying = false, pending = false;
export function rcNotify(): void {
  if (notifying) { pending = true; return; }
  notifying = true;
  try { do { pending = false; for (const fn of listeners) fn(); } while (pending); }
  finally { notifying = false; }
}

export function rcStructuralKey(): string {
  return [rcState.tab, rcState.selected[rcState.tab] ?? '', String(rcState.structuralNonce)].join('|');
}
export function bumpRcStructural(): void { rcState.structuralNonce++; }
export function bumpRcRev(): void { rcState.rev++; rcNotify(); }

export function selectRcTab(tab: RcTab): void { if (rcState.tab === tab) return; rcState.tab = tab; rcNotify(); }
export function selectRcEntry(tab: RcTab, name: string | null): void {
  if (rcState.selected[tab] === name) return;
  rcState.selected[tab] = name; rcNotify();
}

export function setTrigger(t: Trigger | null): void {
  const cur = rcState.trigger;
  if (cur === t || (cur && t && cur.kind === t.kind && cur.name === t.name) || (!cur && !t)) return;
  rcState.trigger = t; rcNotify();
}

export function setTransport(p: Partial<Pick<RcState, 'playing' | 'scrubSeconds' | 'loop'>>): void {
  let changed = false;
  if (p.playing !== undefined && p.playing !== rcState.playing) { rcState.playing = p.playing; changed = true; }
  if (p.scrubSeconds !== undefined && p.scrubSeconds !== rcState.scrubSeconds) { rcState.scrubSeconds = p.scrubSeconds; changed = true; }
  if (p.loop !== undefined && p.loop !== rcState.loop) { rcState.loop = p.loop; changed = true; }
  if (changed) rcNotify();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rc/state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/rc/state.ts tests/rc/state.test.ts
git commit -m "feat(rc): pub/sub state bus with guarded notify + idempotent setters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: rc rename (`src/rc/rename.ts`)

**Files:**
- Create: `src/rc/rename.ts`
- Test: `tests/rc/rename.test.ts`

> **Note / deviation from spec:** the spec said "thin wrappers over the existing `renameNamedEntry`." That function (`src/bg/rename.ts`) is hardcoded to `pkg.files.backgrounds.root` and only the bg namespaces, so it can't be reused directly. We write a parallel `renameRcEntry` for `rc:*` namespaces. The consumer-rewrite loop mirrors the proven bg one.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rc/rename.test.ts
import { describe, it, expect } from 'vitest';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc } from '../../src/package/model';
import { renameRcEntry } from '../../src/rc/rename';

function pkgWith(rcRoot: any): PackageDoc {
  const mk = (root: any) => ({ path: 'x', root, dirty: false, indent: '\t' });
  return { files: { borders: mk({}), backgrounds: mk({}), responseCurves: mk(rcRoot), codingThemes: mk({}) } } as PackageDoc;
}

describe('rc/rename', () => {
  it('renames a 1D spline and rewrites the event that references it', () => {
    const pkg = pkgWith({
      '1D Splines': { wobble: [[0, 0], [1, 1]] },
      'Events': { Hover: { Rotation: 'wobble' } },
    });
    const index = buildRefIndex(pkg);
    renameRcEntry(pkg, index, 'rc:splines1d', 'wobble', 'spin');
    const root = pkg.files.responseCurves.root;
    expect(root['1D Splines'].spin).toBeDefined();
    expect(root['1D Splines'].wobble).toBeUndefined();
    expect(root['Events'].Hover.Rotation).toBe('spin');
  });

  it('preserves insertion order of the renamed table', () => {
    const pkg = pkgWith({ 'Events': { a: {}, b: {}, c: {} } });
    const index = buildRefIndex(pkg);
    renameRcEntry(pkg, index, 'rc:events', 'b', 'bb');
    expect(Object.keys(pkg.files.responseCurves.root['Events'])).toEqual(['a', 'bb', 'c']);
  });

  it('throws on duplicate target name', () => {
    const pkg = pkgWith({ 'Gradients': { g1: [[0, [1, 1, 1, 1]]], g2: [[0, [1, 1, 1, 1]]] } });
    const index = buildRefIndex(pkg);
    expect(() => renameRcEntry(pkg, index, 'rc:gradients', 'g1', 'g2')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rc/rename.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/rc/rename.ts`**

```ts
// src/rc/rename.ts
import type { PackageDoc } from '../package/model';
import type { RefIndex, Namespace } from '../package/refIndex';

const NS_TABLE: Partial<Record<Namespace, string>> = {
  'rc:events': 'Events',
  'rc:splines1d': '1D Splines',
  'rc:splines2d': '2D Splines',
  'rc:gradients': 'Gradients',
  'rc:sounds': 'Sound Effects',
};

// Rename a named responseCurves entry and rewrite every consumer ref. Mutates pkg in place.
export function renameRcEntry(pkg: PackageDoc, index: RefIndex, ns: Namespace, oldName: string, newName: string): void {
  const tableKey = NS_TABLE[ns];
  if (!tableKey) throw new Error(`renameRcEntry: unsupported namespace ${ns}`);
  if (newName === oldName) return;
  const root = pkg.files.responseCurves.root;
  const table = root?.[tableKey];
  if (!table || !(oldName in table)) throw new Error(`renameRcEntry: "${oldName}" not in ${tableKey}`);
  if (newName in table) throw new Error(`renameRcEntry: "${newName}" already exists in ${tableKey}`);

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rc/rename.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/rc/rename.ts tests/rc/rename.test.ts
git commit -m "feat(rc): renameRcEntry rewrites referrers for rc:* namespaces

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract `createGradientBar` (regression-guarded refactor)

**Files:**
- Create: `src/ui/bg/gradientBar.ts`
- Modify: `src/ui/bg/gradientEditor.ts` (becomes a thin adapter)
- Test: `tests/bg/gradients.test.ts` (add a byte-parity assertion); existing `tests/bg/*` must stay green

The goal is a **behaviour-preserving** extraction: `gradientBar.ts` owns the canvas/handles/stop-form; `gradientEditor.ts` becomes a ~20-line adapter binding bg globals with `interp: 'linear-srgb'`. The rc gradient form (Task 11) reuses the bar with `interp: 'engine-cubic-raw'`.

- [ ] **Step 1: Add the byte-parity regression test FIRST (captures current bake)**

Append to `tests/bg/gradients.test.ts`:

```ts
import { bakeGradient, type Mark } from '../../src/bg/gradients';

it('byte-parity: a fixed gradient bakes to stable bytes (guards the gradientBar extraction)', () => {
  const marks: Mark[] = [[0, [0.1, 0.2, 0.3, 1]], [0.5, [0.9, 0.1, 0.4, 0.8]], [1, [1, 1, 1, 1]]];
  const baked = Array.from(bakeGradient(marks));
  // Snapshot the first 12 floats (3 ramp samples) — the bake math must not drift across the refactor.
  expect(baked.slice(0, 4)).toEqual([Math.pow(0.1, 2.2), Math.pow(0.2, 2.2), Math.pow(0.3, 2.2), 1]);
  expect(baked.length).toBe(128 * 4);
  expect(baked).toMatchSnapshot();
});
```

- [ ] **Step 2: Run it to capture the baseline snapshot**

Run: `npx vitest run tests/bg/gradients.test.ts`
Expected: PASS (writes a new snapshot). Commit the snapshot in this task's commit.

- [ ] **Step 3: Create `src/ui/bg/gradientBar.ts`**

Move the canvas + stop-form logic out of `gradientEditor.ts` into a self-contained factory. The bar reads/writes through callbacks (so bg and rc supply their own storage) and draws per an `interp` mode.

```ts
// src/ui/bg/gradientBar.ts
import { bakeGradient, type Mark } from '../../bg/gradients';
import { sampleSpline } from '../../rc/spline';

export type GradientInterp = 'linear-srgb' | 'engine-cubic-raw';

export interface GradientBarOpts {
  getMarks(): Mark[];
  // live=true while dragging (store unsorted, do not commit dirty); live=false commits + sorts.
  setMarks(marks: Mark[], opts: { live: boolean }): void;
  consumers(): { label: string }[];
  interp: GradientInterp;
}

const WIDTH = 320, HEIGHT = 40;
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp255(v * 255).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`;
}

// Sample an RGBA at parametric x∈[0,1] for display, honouring the interp mode.
function sampleRow(marks: Mark[], interp: GradientInterp): (x: number) => [number, number, number, number] {
  if (interp === 'linear-srgb') {
    const baked = bakeGradient(marks);
    return (x) => {
      const s = Math.round(clamp01(x) * 127) * 4;
      return [
        Math.pow(Math.max(baked[s], 0), 1 / 2.2),
        Math.pow(Math.max(baked[s + 1], 0), 1 / 2.2),
        Math.pow(Math.max(baked[s + 2], 0), 1 / 2.2),
        baked[s + 3],
      ];
    };
  }
  // engine-cubic-raw: marks are [t_seconds, rgba]; sample the dim-4 cubic over [0,maxT], values raw HDR.
  const maxT = marks.length ? marks[marks.length - 1][0] : 1;
  return (x) => {
    const t = (maxT > 0 ? x * maxT : 0);
    const v = sampleSpline(marks as any, 4, t, false);
    return [v[0], v[1], v[2], v[3]];
  };
}

export function createGradientBar(host: HTMLElement, opts: GradientBarOpts): { update(): void } {
  host.replaceChildren(); host.className = 'bg-grad-editor';
  host.innerHTML = `
    <canvas data-c="bar" width="${WIDTH}" height="${HEIGHT}" class="bg-grad-bar"></canvas>
    <div class="bg-grad-stop">
      <label>t: <input type="number" step="any" data-s="t" style="width:70px"></label>
      <label>color: <input type="color" data-s="color"></label>
      <label>alpha: <input type="range" min="0" max="1" step="0.01" data-s="a"></label>
      <label>rgba: <input type="number" step="any" data-s="r" style="width:60px"><input type="number" step="any" data-s="g" style="width:60px"><input type="number" step="any" data-s="b" style="width:60px"><input type="number" step="any" data-s="a2" style="width:60px"></label>
      <button data-s="del">✕ delete stop</button>
    </div>
    <div class="bg-refby" data-refby></div>`;

  const bar = host.querySelector<HTMLCanvasElement>('[data-c="bar"]')!;
  let sel = 0;
  const marksOf = () => opts.getMarks();
  // Map handle position to parametric x∈[0,1] of the bar; for raw mode the mark's stored t scales by maxT.
  const xOfMark = (m: Mark, maxT: number) => (opts.interp === 'engine-cubic-raw' ? (maxT > 0 ? m[0] / maxT : 0) : m[0]) * WIDTH;
  const tFromX = (x: number, maxT: number) => {
    const u = clamp01(x / WIDTH);
    return opts.interp === 'engine-cubic-raw' ? u * (maxT > 0 ? maxT : 1) : u;
  };
  const maxTOf = (marks: Mark[]) => (marks.length ? Math.max(...marks.map((m) => m[0]), 1) : 1);

  let dragging = -1;
  bar.addEventListener('pointerdown', (e) => {
    const marks = marksOf(); if (!marks.length) return;
    const maxT = maxTOf(marks); const x = e.offsetX;
    let nearest = 0, best = Infinity;
    marks.forEach((m, i) => { const d = Math.abs(xOfMark(m, maxT) - x); if (d < best) { best = d; nearest = i; } });
    if (best <= 8) { dragging = nearest; sel = nearest; bar.setPointerCapture(e.pointerId); update(); }
    else {
      const t = tFromX(x, maxT);
      const row = sampleRow(marks, opts.interp)(opts.interp === 'engine-cubic-raw' ? (maxT > 0 ? t / maxT : 0) : t);
      const col: Mark = [t, [row[0], row[1], row[2], row[3]]];
      const next = [...marks, col]; sel = next.length - 1;
      opts.setMarks(next, { live: false });
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const marks = marksOf().slice(); const maxT = maxTOf(marks);
    marks[dragging] = [tFromX(e.offsetX, maxT), marks[dragging][1]];
    opts.setMarks(marks, { live: true });
  });
  bar.addEventListener('pointerup', (e) => {
    if (dragging < 0) return; bar.releasePointerCapture(e.pointerId);
    const marks = marksOf().slice();
    const draggedT = marks[dragging][0];
    marks.sort((a, b) => a[0] - b[0]); sel = marks.findIndex((m) => m[0] === draggedT);
    dragging = -1; opts.setMarks(marks, { live: false });
  });

  const commitStop = (mutate: (m: Mark) => void) => {
    const marks = marksOf().slice(); if (!marks[sel]) return;
    const copy: Mark = [marks[sel][0], [...marks[sel][1]] as Mark[1]]; mutate(copy); marks[sel] = copy;
    marks.sort((a, b) => a[0] - b[0]); sel = marks.findIndex((m) => m === copy);
    opts.setMarks(marks, { live: false });
  };
  host.querySelector('[data-s="t"]')!.addEventListener('change', (e) => commitStop((m) => { m[0] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="color"]')!.addEventListener('input', (e) => commitStop((m) => { const [r, g, b] = hexToRgb((e.target as HTMLInputElement).value); m[1][0] = r; m[1][1] = g; m[1][2] = b; }));
  host.querySelector('[data-s="a"]')!.addEventListener('input', (e) => commitStop((m) => { m[1][3] = Number((e.target as HTMLInputElement).value); }));
  for (const [s, idx] of [['r', 0], ['g', 1], ['b', 2], ['a2', 3]] as const)
    host.querySelector(`[data-s="${s}"]`)!.addEventListener('change', (e) => commitStop((m) => { m[1][idx] = Number((e.target as HTMLInputElement).value); }));
  host.querySelector('[data-s="del"]')!.addEventListener('click', () => {
    const marks = marksOf(); if (marks.length <= 1) return; // schema minItems:1
    const next = marks.filter((_, i) => i !== sel); sel = Math.max(0, sel - 1); opts.setMarks(next, { live: false });
  });

  function drawBar(): void {
    const ctx = bar.getContext('2d')!; const marks = marksOf();
    for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#444' : '#666'; ctx.fillRect(x, y, 8, 8); }
    const sampler = sampleRow(marks, opts.interp);
    const img = ctx.createImageData(WIDTH, 1);
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b, a] = sampler(x / (WIDTH - 1));
      img.data[x * 4] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(r) : r) * 255);
      img.data[x * 4 + 1] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(g) : g) * 255);
      img.data[x * 4 + 2] = clamp255((opts.interp === 'engine-cubic-raw' ? clamp01(b) : b) * 255);
      img.data[x * 4 + 3] = clamp255(clamp01(a) * 255);
    }
    const tmp = document.createElement('canvas'); tmp.width = WIDTH; tmp.height = 1; tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
    const maxT = maxTOf(marks);
    marks.forEach((mk, i) => {
      const x = xOfMark(mk, maxT); ctx.beginPath(); ctx.arc(x, HEIGHT / 2, i === sel ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = i === sel ? '#39f' : '#000'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  function update(): void {
    const marks = marksOf();
    host.style.display = marks ? '' : 'none';
    drawBar();
    const m = marks[sel];
    const active = document.activeElement;
    const set = (s: string, v: string) => { const el = host.querySelector<HTMLInputElement>(s); if (el && el !== active) el.value = v; };
    if (m) {
      set('[data-s="t"]', String(m[0]));
      set('[data-s="color"]', rgbToHex(clamp01(m[1][0]), clamp01(m[1][1]), clamp01(m[1][2])));
      set('[data-s="a"]', String(clamp01(m[1][3]))); set('[data-s="a2"]', String(m[1][3]));
      set('[data-s="r"]', String(m[1][0])); set('[data-s="g"]', String(m[1][1])); set('[data-s="b"]', String(m[1][2]));
    }
    const refby = host.querySelector<HTMLElement>('[data-refby]')!;
    const consumers = opts.consumers();
    refby.replaceChildren();
    const head = document.createElement('div'); head.className = 'bg-refby-head'; head.textContent = `REFERENCED BY · ${consumers.length}`; refby.appendChild(head);
    for (const c of consumers) { const r = document.createElement('div'); r.className = 'bg-refby-row'; r.textContent = c.label; refby.appendChild(r); }
  }

  update();
  return { update };
}
```

- [ ] **Step 4: Rewrite `src/ui/bg/gradientEditor.ts` as a thin adapter**

Replace the whole file with:

```ts
// src/ui/bg/gradientEditor.ts
import { bgState, bgNotify } from '../../bg/state';
import type { Mark } from '../../bg/gradients';
import type { BgFormDeps } from './types';
import { createGradientBar } from './gradientBar';

let bar: { update(): void } | null = null;

export function mountGradientEditor(host: HTMLElement, deps: BgFormDeps): void {
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
}

export function updateGradientEditor(): void {
  if (!bar) return;
  bar.update();
}
```

> Behaviour note: bg previously committed dirty on every `writeMarks`; here the live drag path (`live:true`) does NOT set dirty, but `pointerup`/`pointerdown-insert`/stop-edits all call with `live:false` → dirty, matching the net user-visible behaviour (a committed change dirties; a transient drag frame does not). The slice-4 e2e "gradient stop drag commits once and survives notify" guards this.

- [ ] **Step 5: Run bg tests + typecheck**

Run: `npx vitest run tests/bg/ && npx tsc --noEmit`
Expected: PASS (all bg tests green, including the new byte-parity snapshot).

- [ ] **Step 6: Build + bg e2e smoke**

```bash
npm run build
ss -ltnp | grep 8137 && pkill -f server.js || true
npx playwright test e2e/editor.spec.ts -g "backgrounds: gradient stop drag"
```
Expected: PASS (existing bg gradient drag smoke still green).

- [ ] **Step 7: Commit**

```bash
git add src/ui/bg/gradientBar.ts src/ui/bg/gradientEditor.ts tests/bg/gradients.test.ts tests/bg/__snapshots__
git commit -m "refactor(bg): extract parameterized createGradientBar (linear-srgb + engine-cubic-raw)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: rc UI types + entry list (`src/ui/rc/types.ts`, `src/ui/rc/entryList.ts`)

**Files:**
- Create: `src/ui/rc/types.ts`
- Create: `src/ui/rc/entryList.ts`

No DOM unit tests (Vitest is node-env); these are `tsc`-checked and exercised by the Task 15 e2e smokes.

- [ ] **Step 1: Create `src/ui/rc/types.ts`**

```ts
// src/ui/rc/types.ts
import type { FileDoc } from '../../package/model';
import type { SurfaceContext } from '../surfaces/registry';
export interface RcFormDeps { file: FileDoc; ctx: () => SurfaceContext; markDirty: () => void; }
export interface RcPreviewDeps { file: FileDoc; ctx: () => SurfaceContext; }
```

- [ ] **Step 2: Create `src/ui/rc/entryList.ts`**

A generic entry list reused by all six tabs. Mirrors `bg/entryList.ts` but parameterized by the rc tab→table/namespace maps. The `curves` tab has no namespace (Response Curve keys aren't referenced by anything) and is not renamable.

```ts
// src/ui/rc/entryList.ts
import type { RefIndex, Namespace } from '../../package/refIndex';
import type { RcTab } from '../../rc/state';

export const RC_TAB_TABLE: Record<RcTab, string> = {
  curves: 'Response Curves', events: 'Events', splines1d: '1D Splines',
  splines2d: '2D Splines', gradients: 'Gradients', sounds: 'Sound Effects',
};
export const RC_TAB_NS: Partial<Record<RcTab, Namespace>> = {
  events: 'rc:events', splines1d: 'rc:splines1d', splines2d: 'rc:splines2d',
  gradients: 'rc:gradients', sounds: 'rc:sounds',
};
export const RC_TAB_LABEL: Record<RcTab, string> = {
  curves: 'Response Curves', events: 'Events', splines1d: '1D Splines',
  splines2d: '2D Splines', gradients: 'Gradients', sounds: 'Sound Effects',
};

export interface RcEntryRow { name: string; refCount: number | null; dead: boolean; }

export function buildRcRows(tab: RcTab, index: RefIndex, rcRoot: any): RcEntryRow[] {
  const table = rcRoot?.[RC_TAB_TABLE[tab]];
  const names = table && typeof table === 'object' ? Object.keys(table) : [];
  const ns = RC_TAB_NS[tab];
  return names.map((name) => {
    const refCount = ns ? index.consumers(ns, name).length : null;
    return { name, refCount, dead: ns ? refCount === 0 : false };
  });
}

export interface RcEntryListOpts {
  tab: RcTab; rows: RcEntryRow[]; selected: string | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDelete: (name: string) => void;
  onRename?: (name: string) => void; // omitted for the curves tab (constrained keys)
}

export function renderRcEntryList(host: HTMLElement, opts: RcEntryListOpts): void {
  host.replaceChildren(); host.className = 'bg-entrylist';
  const head = document.createElement('div'); head.className = 'bg-el-head';
  head.textContent = `${RC_TAB_LABEL[opts.tab]} `;
  const count = document.createElement('span'); count.className = 'bg-el-count'; count.textContent = String(opts.rows.length);
  const add = document.createElement('button'); add.className = 'bg-el-add'; add.textContent = '+'; add.title = 'Add entry';
  add.addEventListener('click', opts.onAdd);
  head.append(count, add); host.appendChild(head);

  for (const row of opts.rows) {
    const el = document.createElement('div');
    el.className = 'bg-el-row' + (row.name === opts.selected ? ' bg-el-active' : '');
    el.dataset.name = row.name;
    const nm = document.createElement('span'); nm.className = 'bg-el-name'; nm.textContent = row.name; el.appendChild(nm);
    if (opts.onRename) nm.addEventListener('dblclick', (e) => { e.stopPropagation(); opts.onRename!(row.name); });
    if (row.dead) { const p = document.createElement('span'); p.className = 'bg-el-dead'; p.textContent = 'dead'; el.appendChild(p); }
    else if (row.refCount != null) { const b = document.createElement('span'); b.className = 'bg-el-refs'; b.textContent = `↗${row.refCount}`; el.appendChild(b); }
    const x = document.createElement('button'); x.className = 'bg-el-del'; x.textContent = '✕'; x.title = 'Delete';
    x.addEventListener('click', (e) => { e.stopPropagation(); opts.onDelete(row.name); }); el.appendChild(x);
    el.addEventListener('click', () => opts.onSelect(row.name));
    host.appendChild(el);
  }
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/types.ts src/ui/rc/entryList.ts
git commit -m "feat(rc): UI deps types + generic entry list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Spline plot (`src/ui/rc/splinePlot.ts`)

**Files:**
- Create: `src/ui/rc/splinePlot.ts`

A canvas plot for 1D and 2D splines. X = time `[0, maxT]`; Y = value range (auto from marks, padded). The curve is drawn by **densely sampling the engine cubic** (Task 1), so the editor shows exactly what the engine plays. Drag a handle to move (t, value); click empty to insert a mark (value sampled from the cubic at that t); ✕ deletes but keeps ≥1 mark. 2D draws x and y as two traces sharing the time axis.

- [ ] **Step 1: Create `src/ui/rc/splinePlot.ts`**

```ts
// src/ui/rc/splinePlot.ts
import { sampleSpline, durationOf, type AnyMark } from '../../rc/spline';

const W = 360, H = 200, PAD = 28;

export interface SplinePlotOpts {
  dim: 1 | 2;                          // 1D: value is number; 2D: value is [x,y]
  getMarks(): AnyMark[];
  setMarks(marks: AnyMark[], opts: { live: boolean }): void;
  loop(): boolean;                     // sample with loop (states) or clamp (one-shots) for the drawn curve
}

const TRACE_COLORS = ['#6cf', '#f96'];

export function createSplinePlot(host: HTMLElement, opts: SplinePlotOpts): { update(): void } {
  host.replaceChildren(); host.className = 'rc-plot';
  host.innerHTML = `
    <canvas data-c="plot" width="${W}" height="${H}" class="rc-plot-canvas"></canvas>
    <div class="rc-plot-marks" data-marks></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>('[data-c="plot"]')!;

  const comp = (m: AnyMark): number[] => (Array.isArray(m[1]) ? m[1].slice() : [m[1] as number]);
  const maxTOf = (marks: AnyMark[]) => Math.max(durationOf(marks), 1e-6);
  function yRange(marks: AnyMark[]): [number, number] {
    let lo = Infinity, hi = -Infinity;
    for (const m of marks) for (const v of comp(m)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1; return [lo - pad, hi + pad];
  }
  const sx = (t: number, maxT: number) => PAD + (t / maxT) * (W - 2 * PAD);
  const sy = (v: number, lo: number, hi: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const tFromX = (x: number, maxT: number) => Math.max(0, ((x - PAD) / (W - 2 * PAD)) * maxT);
  const vFromY = (y: number, lo: number, hi: number) => lo + ((H - PAD - y) / (H - 2 * PAD)) * (hi - lo);

  let sel = 0, dragging = -1;

  function draw(): void {
    const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, W, H);
    const marks = opts.getMarks(); if (!marks.length) return;
    const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    // axes
    ctx.strokeStyle = '#33333d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, sy(0, lo, hi)); ctx.lineTo(W - PAD, sy(0, lo, hi)); ctx.stroke();
    // one trace per component
    for (let k = 0; k < opts.dim; k++) {
      ctx.strokeStyle = TRACE_COLORS[k]; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let px = 0; px <= W - 2 * PAD; px++) {
        const t = (px / (W - 2 * PAD)) * maxT;
        const v = sampleSpline(marks, opts.dim, t, opts.loop())[k];
        const X = PAD + px, Y = sy(v, lo, hi);
        if (px === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    // handles (one per mark; in 2D the handle moves component 0's y for hit-testing, both shown)
    marks.forEach((m, i) => {
      const X = sx(m[0], maxT);
      comp(m).forEach((v, k) => {
        const Y = sy(v, lo, hi); ctx.beginPath(); ctx.arc(X, Y, i === sel ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = TRACE_COLORS[k]; ctx.fill(); ctx.strokeStyle = i === sel ? '#fff' : '#000'; ctx.lineWidth = 2; ctx.stroke();
      });
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    const marks = opts.getMarks(); if (!marks.length) return;
    const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    let nearest = -1, best = 12 * 12;
    marks.forEach((m, i) => {
      const X = sx(m[0], maxT);
      comp(m).forEach((v) => { const Y = sy(v, lo, hi); const d = (X - e.offsetX) ** 2 + (Y - e.offsetY) ** 2; if (d < best) { best = d; nearest = i; } });
    });
    if (nearest >= 0) { sel = nearest; dragging = nearest; canvas.setPointerCapture(e.pointerId); draw(); }
    else {
      const t = tFromX(e.offsetX, maxT);
      const sampled = sampleSpline(marks, opts.dim, t, opts.loop());
      const value: number | number[] = opts.dim === 1 ? sampled[0] : [sampled[0], sampled[1]];
      const next = [...marks, [t, value] as AnyMark]; sel = next.length - 1;
      opts.setMarks(next, { live: false }); renderMarks();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const marks = opts.getMarks().slice(); const maxT = maxTOf(marks); const [lo, hi] = yRange(marks);
    const t = tFromX(e.offsetX, maxT); const v = vFromY(e.offsetY, lo, hi);
    const old = marks[dragging];
    // drag t for both components; drag value for component 0 (1D) — keep 2D simple: move both toward v keeps x, edits via the numeric list.
    marks[dragging] = opts.dim === 1 ? [t, v] : [t, (old[1] as number[]).slice() as any];
    if (opts.dim === 1) opts.setMarks(marks, { live: true });
    else opts.setMarks(marks, { live: true });
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragging < 0) return; canvas.releasePointerCapture(e.pointerId);
    const marks = opts.getMarks().slice(); const draggedT = marks[dragging][0];
    marks.sort((a, b) => a[0] - b[0]); sel = marks.findIndex((m) => m[0] === draggedT);
    dragging = -1; opts.setMarks(marks, { live: false }); renderMarks();
  });

  // Numeric mark list mirrors the canvas (the authoritative editor for 2D y-values).
  function renderMarks(): void {
    const box = host.querySelector<HTMLElement>('[data-marks]')!; box.replaceChildren();
    const marks = opts.getMarks();
    marks.forEach((m, i) => {
      const row = document.createElement('div'); row.className = 'rc-mark-row' + (i === sel ? ' rc-mark-active' : '');
      const tIn = numInput(String(m[0]), (val) => editMark(i, (mm) => { mm[0] = val; }));
      row.append(label('t', tIn));
      comp(m).forEach((v, k) => {
        const inp = numInput(String(v), (val) => editMark(i, (mm) => { if (opts.dim === 1) mm[1] = val; else (mm[1] as number[])[k] = val; }));
        row.append(label(opts.dim === 1 ? 'v' : (k === 0 ? 'x' : 'y'), inp));
      });
      const del = document.createElement('button'); del.className = 'rc-mark-del'; del.textContent = '✕';
      del.addEventListener('click', () => { const cur = opts.getMarks(); if (cur.length <= 1) return; const next = cur.filter((_, j) => j !== i); sel = Math.max(0, sel - 1); opts.setMarks(next, { live: false }); renderMarks(); });
      row.append(del);
      row.addEventListener('click', () => { sel = i; draw(); renderMarks(); });
      box.appendChild(row);
    });
  }
  function editMark(i: number, mutate: (m: AnyMark) => void): void {
    const marks = opts.getMarks().map((m) => [m[0], Array.isArray(m[1]) ? m[1].slice() : m[1]] as AnyMark);
    mutate(marks[i]); marks.sort((a, b) => a[0] - b[0]); opts.setMarks(marks, { live: false }); renderMarks(); draw();
  }
  function numInput(val: string, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.value = val; inp.style.width = '64px';
    inp.addEventListener('change', () => onChange(Number(inp.value)));
    return inp;
  }
  function label(text: string, inp: HTMLElement): HTMLElement {
    const l = document.createElement('label'); l.className = 'rc-mark-lbl'; l.textContent = `${text} `; l.appendChild(inp); return l;
  }

  function update(): void { draw(); renderMarks(); }
  update();
  return { update };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/splinePlot.ts
git commit -m "feat(rc): 1D/2D spline plot drawn with the engine cubic

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Curve form (`src/ui/rc/curveForm.ts`)

**Files:**
- Create: `src/ui/rc/curveForm.ts`

The 16-slot editor for a Response Curve. Slots split into **States** (loop) and **Events** (one-shot). Each slot is a `<select>` of Event names (plus empty) and a ▶ that sets the preview trigger. Comment field. Adding a curve is an archetype+index picker (constrained keys), handled in the surface (Task 13) via the entry list `onAdd`.

- [ ] **Step 1: Create `src/ui/rc/curveForm.ts`**

```ts
// src/ui/rc/curveForm.ts
import { rcState, setTrigger } from '../../rc/state';
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
    sel.replaceChildren();
    for (const name of ['', ...events]) { const o = document.createElement('option'); o.value = name; o.textContent = name || '— none —'; sel.appendChild(o); }
    if (cur && !events.includes(cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = `${cur} (missing)`; sel.appendChild(o); }
    if (sel !== active) sel.value = cur;
  });
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = c.Comment ?? '';
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/curveForm.ts
git commit -m "feat(rc): response-curve slot editor (states/events + comment)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Event form (`src/ui/rc/eventForm.ts`)

**Files:**
- Create: `src/ui/rc/eventForm.ts`

A free-named Event binds up to seven channels. Each channel is a `<select>` populated from the table named by `CHANNELS[key].kind`. ▶ triggers the whole event. Comment.

- [ ] **Step 1: Create `src/ui/rc/eventForm.ts`**

```ts
// src/ui/rc/eventForm.ts
import { rcState, setTrigger } from '../../rc/state';
import { CHANNELS, CHANNEL_KEYS } from '../../rc/channels';
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
    sel.replaceChildren();
    for (const n of ['', ...names]) { const o = document.createElement('option'); o.value = n; o.textContent = n || '— none —'; sel.appendChild(o); }
    if (cur && !names.includes(cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = `${cur} (missing)`; sel.appendChild(o); }
    if (sel !== active) sel.value = cur;
  });
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = ev.Comment ?? '';
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/eventForm.ts
git commit -m "feat(rc): event channel-binding editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Sound form (`src/ui/rc/soundForm.ts`)

**Files:**
- Create: `src/ui/rc/soundForm.ts`

`file` via a `<select>` over `ctx().assets.sounds`; `tone`/`speed`/`volume` each an optional `[min,max]` pair (absent = key omitted); Comment. No playback.

- [ ] **Step 1: Create `src/ui/rc/soundForm.ts`**

```ts
// src/ui/rc/soundForm.ts
import { rcState } from '../../rc/state';
import type { RcFormDeps } from './types';

const RANGES = ['tone', 'speed', 'volume'] as const;
let host: HTMLElement | null = null, deps: RcFormDeps | null = null;
const soundOf = (): any => { const n = rcState.selected.sounds; return n ? deps!.file.root['Sound Effects']?.[n] : null; };

export function mountSoundForm(h: HTMLElement, d: RcFormDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-form';
  const fs = document.createElement('fieldset'); fs.className = 'pf-zone';
  const lg = document.createElement('legend'); lg.textContent = 'Sound Effect'; fs.appendChild(lg);

  const fileRow = document.createElement('label'); fileRow.className = 'rc-slot';
  fileRow.append(span('file'));
  const fileSel = document.createElement('select'); fileSel.dataset.k = 'file';
  fileSel.addEventListener('change', () => { const s = soundOf(); if (!s) return; s.file = fileSel.value; deps!.markDirty(); });
  fileRow.appendChild(fileSel); fs.appendChild(fileRow);

  for (const key of RANGES) {
    const row = document.createElement('label'); row.className = 'rc-slot';
    row.append(span(key));
    const on = document.createElement('input'); on.type = 'checkbox'; on.dataset.on = key;
    const min = document.createElement('input'); min.type = 'number'; min.step = 'any'; min.style.width = '64px'; min.dataset.min = key;
    const max = document.createElement('input'); max.type = 'number'; max.step = 'any'; max.style.width = '64px'; max.dataset.max = key;
    const writeRange = () => {
      const s = soundOf(); if (!s) return;
      if (on.checked) s[key] = [Number(min.value) || 0, Number(max.value) || 0];
      else delete s[key];
      deps!.markDirty();
    };
    on.addEventListener('change', writeRange); min.addEventListener('change', writeRange); max.addEventListener('change', writeRange);
    row.append(on, min, max); fs.appendChild(row);
  }
  h.appendChild(fs);

  const cf = document.createElement('label'); cf.className = 'rc-comment'; cf.textContent = 'Comment ';
  const ci = document.createElement('input'); ci.type = 'text'; ci.dataset.k = 'Comment';
  ci.addEventListener('change', () => { const s = soundOf(); if (!s) return; if (ci.value) s.Comment = ci.value; else delete s.Comment; deps!.markDirty(); });
  cf.appendChild(ci); h.appendChild(cf);
  updateSoundForm();
}

function span(t: string): HTMLElement { const s = document.createElement('span'); s.className = 'rc-slot-name'; s.textContent = t; return s; }

export function updateSoundForm(): void {
  if (!host || !deps) return;
  const s = soundOf(); host.style.display = s ? '' : 'none'; if (!s) return;
  const active = document.activeElement;
  const fileSel = host.querySelector<HTMLSelectElement>('select[data-k="file"]')!;
  const sounds = deps.ctx().assets.sounds.filter((a) => a.status !== 'rejected-format').map((a) => a.path);
  const cur = s.file ?? '';
  fileSel.replaceChildren();
  for (const p of ['', ...sounds]) { const o = document.createElement('option'); o.value = p; o.textContent = p || '— none —'; fileSel.appendChild(o); }
  if (cur && !sounds.includes(cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = `${cur} (missing)`; fileSel.appendChild(o); }
  if (fileSel !== active) fileSel.value = cur;

  for (const key of RANGES) {
    const on = host.querySelector<HTMLInputElement>(`input[data-on="${key}"]`)!;
    const min = host.querySelector<HTMLInputElement>(`input[data-min="${key}"]`)!;
    const max = host.querySelector<HTMLInputElement>(`input[data-max="${key}"]`)!;
    const has = Array.isArray(s[key]);
    if (on !== active) on.checked = has;
    min.disabled = max.disabled = !has;
    if (has) { if (min !== active) min.value = String(s[key][0]); if (max !== active) max.value = String(s[key][1]); }
  }
  const ci = host.querySelector<HTMLInputElement>('input[data-k="Comment"]');
  if (ci && ci !== active) ci.value = s.Comment ?? '';
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/soundForm.ts
git commit -m "feat(rc): sound-effect editor (file + optional tone/speed/volume ranges)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Gradient form adapter (`src/ui/rc/gradientForm.ts`)

**Files:**
- Create: `src/ui/rc/gradientForm.ts`

Reuses `createGradientBar` (Task 5) in `engine-cubic-raw` mode over `file.root['Gradients']`, with `rc:gradients` consumers.

- [ ] **Step 1: Create `src/ui/rc/gradientForm.ts`**

```ts
// src/ui/rc/gradientForm.ts
import { rcState, rcNotify } from '../../rc/state';
import type { Mark } from '../../bg/gradients';
import { createGradientBar } from '../bg/gradientBar';
import type { RcFormDeps } from './types';

let bar: { update(): void } | null = null;

export function mountRcGradientForm(host: HTMLElement, deps: RcFormDeps): void {
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
}

export function updateRcGradientForm(): void { bar?.update(); }
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/gradientForm.ts
git commit -m "feat(rc): gradient editor (engine-cubic-raw HDR ramp)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Animated preview (`src/ui/rc/previewPanel.ts`)

**Files:**
- Create: `src/ui/rc/previewPanel.ts`

A placeholder widget (rounded rect + centred label) on a 2D canvas, animated by sampling the `trigger`'s bound channels and folding per `CHANNELS`. Transport bar: play/pause, scrub, loop. Reads `rcState`; never writes the document. Duration = longest bound channel's `durationOf`.

- [ ] **Step 1: Create `src/ui/rc/previewPanel.ts`**

```ts
// src/ui/rc/previewPanel.ts
import { rcState, setTransport } from '../../rc/state';
import { CHANNELS, CHANNEL_KEYS, fold, type ChannelKey } from '../../rc/channels';
import { sampleSpline, durationOf, type AnyMark } from '../../rc/spline';
import type { RcPreviewDeps } from './types';

let host: HTMLElement | null = null, deps: RcPreviewDeps | null = null;
let canvas: HTMLCanvasElement | null = null;
let raf = 0, startMs = 0;

// Resolve the current trigger to a map of channel → marks (from an Event), or a single spline/gradient.
function resolveChannels(): Partial<Record<ChannelKey, AnyMark[]>> {
  const t = rcState.trigger; if (!t || !deps) return {};
  const root = deps.file.root;
  if (t.kind === 'event') {
    const ev = root['Events']?.[t.name]; if (!ev) return {};
    const out: Partial<Record<ChannelKey, AnyMark[]>> = {};
    for (const key of CHANNEL_KEYS) {
      if (key === 'Sound Effect') continue;
      const ref = ev[key]; if (!ref) continue;
      const marks = root[CHANNELS[key].table]?.[ref];
      if (Array.isArray(marks)) out[key] = marks as AnyMark[];
    }
    return out;
  }
  // single spline/gradient applied to its natural channel
  const map: Record<string, ChannelKey> = { spline1d: 'Rotation', spline2d: 'Translation', gradient: 'Tint' };
  const key = map[t.kind]; const table = CHANNELS[key].table;
  const marks = root[table]?.[t.name];
  return Array.isArray(marks) ? { [key]: marks as AnyMark[] } : {};
}

function totalDuration(channels: Partial<Record<ChannelKey, AnyMark[]>>): number {
  let d = 0; for (const k of Object.keys(channels) as ChannelKey[]) d = Math.max(d, durationOf(channels[k]!));
  return d;
}

function frame(): void {
  if (!canvas || !deps) return;
  const ctx = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e0e13'; ctx.fillRect(0, 0, W, H);

  const channels = resolveChannels();
  const dur = totalDuration(channels);
  const t = rcState.playing ? (dur > 0 ? ((performance.now() - startMs) / 1000) : 0) : rcState.scrubSeconds;
  const loop = rcState.loop;

  // fold channels onto identities
  let translation = [0, 0], scaling = [1, 1], rotation = [0], tint = [1, 1, 1, 1], style = [0], fontColor = [0, 0, 0, 0];
  const sampleInto = (key: ChannelKey) => {
    const marks = channels[key]; if (!marks) return null;
    return sampleSpline(marks, CHANNELS[key].dim, t, loop);
  };
  let v: number[] | null;
  if ((v = sampleInto('Translation'))) translation = fold('add', translation, v);
  if ((v = sampleInto('Scaling'))) scaling = fold('multiply', scaling, v);
  if ((v = sampleInto('Rotation'))) rotation = fold('add', rotation, v);
  if ((v = sampleInto('Style'))) style = fold('add', style, v);
  if ((v = sampleInto('Tint'))) tint = fold('multiply', tint, v);
  if ((v = sampleInto('Font Color'))) fontColor = fold('add', fontColor, v);
  void style;

  // draw the widget under the matrix (scale → rotate → translate, translation in points)
  ctx.save();
  ctx.translate(W / 2 + translation[0], H / 2 + translation[1]);
  ctx.rotate(rotation[0]);
  ctx.scale(scaling[0], scaling[1]);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  ctx.fillStyle = `rgba(${clamp01(tint[0]) * 200 + 30},${clamp01(tint[1]) * 200 + 30},${clamp01(tint[2]) * 200 + 30},${clamp01(tint[3])})`;
  const w = 120, h = 60, r = 10;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.fillStyle = `rgba(${clamp01(fontColor[0]) * 255},${clamp01(fontColor[1]) * 255},${clamp01(fontColor[2]) * 255},${1})`;
  ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Widget', 0, 0);
  ctx.restore();

  // transport reflects current time
  const slider = host!.querySelector<HTMLInputElement>('[data-t="scrub"]');
  if (slider && document.activeElement !== slider) { slider.max = String(dur || 1); if (rcState.playing) slider.value = String(loop && dur > 0 ? t % dur : Math.min(t, dur)); }

  if (rcState.playing) raf = requestAnimationFrame(frame);
}

export function mountRcPreview(h: HTMLElement, d: RcPreviewDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-preview';
  h.innerHTML = `
    <canvas data-c="stage" width="320" height="220" class="rc-pv-canvas"></canvas>
    <div class="rc-transport">
      <button data-t="play">▶</button>
      <input type="range" min="0" max="1" step="0.01" value="0" data-t="scrub" style="flex:1">
      <label><input type="checkbox" data-t="loop" checked> loop</label>
    </div>`;
  canvas = h.querySelector('[data-c="stage"]')!;
  const play = h.querySelector<HTMLButtonElement>('[data-t="play"]')!;
  play.addEventListener('click', () => {
    const next = !rcState.playing;
    if (next) startMs = performance.now() - rcState.scrubSeconds * 1000;
    setTransport({ playing: next });
  });
  h.querySelector<HTMLInputElement>('[data-t="scrub"]')!.addEventListener('input', (e) => {
    setTransport({ playing: false, scrubSeconds: Number((e.target as HTMLInputElement).value) });
  });
  h.querySelector<HTMLInputElement>('[data-t="loop"]')!.addEventListener('change', (e) => {
    setTransport({ loop: (e.target as HTMLInputElement).checked });
  });
  updateRcPreview();
}

export function updateRcPreview(): void {
  if (!host) return;
  const play = host.querySelector<HTMLButtonElement>('[data-t="play"]'); if (play) play.textContent = rcState.playing ? '⏸' : '▶';
  cancelAnimationFrame(raf);
  if (rcState.playing) { if (!startMs) startMs = performance.now(); raf = requestAnimationFrame(frame); }
  else frame(); // single static draw at scrubSeconds
}
```

> `CanvasRenderingContext2D.roundRect` is standard in current Chromium (Playwright's bundled browser) — no polyfill needed.

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/previewPanel.ts
git commit -m "feat(rc): animated widget preview (engine cubic + channel fold)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Surface (`src/ui/rc/surface.ts`)

**Files:**
- Create: `src/ui/rc/surface.ts`

Wires the 4 panels, subscribes to `rcState`, re-mounts the editor on structural-key change, and handles add/delete/rename per tab. Mirrors `bg/surface.ts`.

- [ ] **Step 1: Create `src/ui/rc/surface.ts`**

```ts
// src/ui/rc/surface.ts
import type { Surface, SurfaceContext } from '../surfaces/registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import { resolveEntrySelection } from '../surfaces/readOnlyTable';
import {
  rcState, rcSubscribe, rcNotify, rcStructuralKey, selectRcTab, selectRcEntry, setTrigger, type RcTab,
} from '../../rc/state';
import { buildRcRows, renderRcEntryList, RC_TAB_TABLE, RC_TAB_NS } from './entryList';
import { renameRcEntry } from '../../rc/rename';
import { mountCurveForm, updateCurveForm } from './curveForm';
import { mountEventForm, updateEventForm } from './eventForm';
import { createSplinePlot } from './splinePlot';
import { mountSoundForm, updateSoundForm } from './soundForm';
import { mountRcGradientForm, updateRcGradientForm } from './gradientForm';
import { mountRcPreview, updateRcPreview } from './previewPanel';
import type { RcFormDeps, RcPreviewDeps } from './types';
import type { AnyMark } from '../../rc/spline';

const TABS: { id: RcTab; label: string }[] = [
  { id: 'curves', label: 'Curves' }, { id: 'events', label: 'Events' },
  { id: 'splines1d', label: '1D Splines' }, { id: 'splines2d', label: '2D Splines' },
  { id: 'gradients', label: 'Gradients' }, { id: 'sounds', label: 'Sounds' },
];
const ARCHETYPES = ['GridItem', 'ListItem', 'Button', 'Action', 'Affordance', 'Window', 'Progress', 'Toggle', 'Bounce'];

export function createResponseCurvesSurface(rcFile: FileDoc, onDirty: () => void): Surface {
  let built = false; let lastCtx: SurfaceContext | null = null;
  let railHost!: HTMLElement, listHost!: HTMLElement, editorHost!: HTMLElement, previewHost!: HTMLElement;
  let plot: { update(): void } | null = null;

  const markDirty = () => { rcFile.dirty = true; onDirty(); };
  const ensure = (tab: RcTab) => (rcFile.root[RC_TAB_TABLE[tab]] ??= {});

  function addEntry(): void {
    const tab = rcState.tab; const table = ensure(tab);
    if (tab === 'curves') {
      const arch = prompt(`Archetype (${ARCHETYPES.join(', ')}), or _N / N:`, 'Button'); if (!arch) return;
      const idx = prompt('Index 0–3 (archetypes), or a number for _N / N:', '0'); if (idx === null) return;
      const key = ARCHETYPES.includes(arch) ? `${arch}_${idx}` : arch.startsWith('_') ? arch : `_${idx}`;
      if (!/^((GridItem|ListItem|Button|Action|Affordance|Window|Progress|Toggle|Bounce)_[0-3]|_[0-9]+|[0-9]+)$/.test(key)) { alert(`Invalid curve key "${key}".`); return; }
      if (key in table) { alert('Already exists.'); return; }
      table[key] = {}; selectRcEntry('curves', key);
    } else {
      const name = prompt(`New ${tab} name:`); if (!name) return;
      if (name in table) { alert('Name already exists.'); return; }
      table[name] = defaultEntry(tab); selectRcEntry(tab, name);
    }
    markDirty();
  }

  function defaultEntry(tab: RcTab): any {
    switch (tab) {
      case 'events': return {};
      case 'splines1d': return [[0, 0], [1, 0]];
      case 'splines2d': return [[0, [0, 0]], [1, [0, 0]]];
      case 'gradients': return [[0, [1, 1, 1, 1]], [1, [1, 1, 1, 1]]];
      case 'sounds': return { file: '' };
      default: return {};
    }
  }

  function deleteEntry(tab: RcTab, name: string): void {
    const table = rcFile.root[RC_TAB_TABLE[tab]]; if (!table) return;
    const ns = RC_TAB_NS[tab];
    const consumers = ns ? lastCtx!.index.consumers(ns, name).length : 0;
    if (!confirm(`Delete "${name}"?${consumers ? ` ${consumers} reference(s) will dangle.` : ''}`)) return;
    delete table[name];
    if (rcState.selected[tab] === name) selectRcEntry(tab, null);
    markDirty();
  }

  function renameEntry(tab: RcTab, name: string): void {
    const ns = RC_TAB_NS[tab]; if (!ns) return; // curves not renamable
    const next = prompt(`Rename "${name}" to:`, name); if (!next || next === name) return;
    const table = rcFile.root[RC_TAB_TABLE[tab]];
    if (next in (table ?? {})) { alert('Name already exists.'); return; }
    renameRcEntry(lastCtx!.pkg, lastCtx!.index, ns, name, next);
    selectRcEntry(tab, next);
    markDirty();
  }

  function renderRail(): void {
    railHost.replaceChildren();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'bg-tab' + (rcState.tab === t.id ? ' bg-tab-active' : '');
      b.textContent = t.label;
      const tbl = rcFile.root[RC_TAB_TABLE[t.id]];
      const n = tbl && typeof tbl === 'object' ? Object.keys(tbl).length : 0;
      const badge = document.createElement('span'); badge.className = 'bg-tab-count'; badge.textContent = String(n); b.appendChild(badge);
      b.addEventListener('click', () => selectRcTab(t.id));
      railHost.appendChild(b);
    }
  }

  function renderList(): void {
    if (!lastCtx) return;
    const rows = buildRcRows(rcState.tab, lastCtx.index, rcFile.root);
    renderRcEntryList(listHost, {
      tab: rcState.tab, rows, selected: rcState.selected[rcState.tab],
      onSelect: (name) => selectRcEntry(rcState.tab, name),
      onAdd: addEntry,
      onDelete: (name) => deleteEntry(rcState.tab, name),
      onRename: RC_TAB_NS[rcState.tab] ? (name) => renameEntry(rcState.tab, name) : undefined,
    });
  }

  function splineMarksDeps(tab: 'splines1d' | 'splines2d'): { get: () => AnyMark[]; set: (m: AnyMark[], o: { live: boolean }) => void } {
    const table = RC_TAB_TABLE[tab];
    return {
      get: () => { const n = rcState.selected[tab]; const raw = n ? rcFile.root[table]?.[n] : null; return Array.isArray(raw) ? raw : []; },
      set: (marks, { live }) => { const n = rcState.selected[tab]; if (!n) return; if (!live) marks.sort((a, b) => a[0] - b[0]); rcFile.root[table][n] = marks; if (!live) markDirty(); rcNotify(); },
    };
  }

  const formDeps = (): RcFormDeps => ({ file: rcFile, ctx: () => lastCtx!, markDirty });

  function mountEditor(): void {
    editorHost.replaceChildren(); plot = null;
    const tab = rcState.tab;
    if (tab === 'curves') mountCurveForm(editorHost, formDeps());
    else if (tab === 'events') mountEventForm(editorHost, formDeps());
    else if (tab === 'sounds') mountSoundForm(editorHost, formDeps());
    else if (tab === 'gradients') mountRcGradientForm(editorHost, formDeps());
    else {
      const d = splineMarksDeps(tab as 'splines1d' | 'splines2d');
      // selecting a spline/gradient implicitly triggers a preview of it
      const sel = rcState.selected[tab];
      if (sel) setTrigger({ kind: tab === 'splines1d' ? 'spline1d' : 'spline2d', name: sel });
      plot = createSplinePlot(editorHost, {
        dim: tab === 'splines1d' ? 1 : 2,
        getMarks: d.get, setMarks: d.set, loop: () => rcState.loop,
      });
    }
  }
  function updateEditor(): void {
    const tab = rcState.tab;
    if (tab === 'curves') updateCurveForm();
    else if (tab === 'events') updateEventForm();
    else if (tab === 'sounds') updateSoundForm();
    else if (tab === 'gradients') updateRcGradientForm();
    else plot?.update();
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
    const previewDeps: RcPreviewDeps = { file: rcFile, ctx: () => lastCtx! };
    mountRcPreview(previewHost, previewDeps);

    let lastKey = '';
    rcSubscribe(() => {
      renderRail();
      const key = rcStructuralKey();
      if (key !== lastKey) { lastKey = key; renderList(); mountEditor(); }
      renderList(); updateEditor(); updateRcPreview();
    });
    built = true;
    rcNotify();
  }

  return {
    key: 'responseCurves', label: 'Response Curves', icon: '◠',
    mount(host, ctx) { lastCtx = ctx; if (!built) buildOnce(host); },
    refresh(ctx) { lastCtx = ctx; rcNotify(); },
    reveal(entry?: NavTarget['entry']) {
      if (!entry) return;
      const named = resolveEntrySelection(lastCtx!.index, [
        { ns: 'rc:events', title: '' }, { ns: 'rc:splines1d', title: '' }, { ns: 'rc:splines2d', title: '' },
        { ns: 'rc:gradients', title: '' }, { ns: 'rc:sounds', title: '' },
      ], entry);
      if (named) {
        const tabFor: Record<string, RcTab> = { 'rc:events': 'events', 'rc:splines1d': 'splines1d', 'rc:splines2d': 'splines2d', 'rc:gradients': 'gradients', 'rc:sounds': 'sounds' };
        selectRcTab(tabFor[named.ns]); selectRcEntry(rcState.tab, named.name); return;
      }
      const name = entry.name ?? entry.slot;
      if (name && rcFile.root['Response Curves']?.[name]) { selectRcTab('curves'); selectRcEntry('curves', name); }
    },
  };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/rc/surface.ts
git commit -m "feat(rc): 4-panel response-curves surface (tabs, add/delete/rename, preview wiring)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Boot swap + CSS (`src/ui/boot.ts`, `index.html`)

**Files:**
- Modify: `src/ui/boot.ts:10,52`
- Modify: `index.html` (`<style>` block — add `.rc-*` rules near the `.ct-*` block)

- [ ] **Step 1: Swap the import in `src/ui/boot.ts`**

Replace line 10:
```ts
import { createReadOnlyTableSurface } from './surfaces/readOnlyTable';
```
with:
```ts
import { createResponseCurvesSurface } from './rc/surface';
```

- [ ] **Step 2: Swap the surface registration in `src/ui/boot.ts`**

Replace line 52:
```ts
    createReadOnlyTableSurface('responseCurves', 'Response Curves', '◠'),
```
with:
```ts
    createResponseCurvesSurface(pkg.files.responseCurves, scheduleRevalidate),
```

> `resolveEntrySelection` (still imported by `bg/surface.ts` and `rc/surface.ts` from `readOnlyTable.ts`) keeps `readOnlyTable.ts` in the build — do not delete that file.

- [ ] **Step 3: Add CSS to `index.html`** (insert before the closing `</style>` at line 155, after the `.ct-*` block)

```css
    /* Response Curves surface */
    .bg-surface { display: grid; grid-template-columns: 64px 220px 1fr 1fr; height: 100%; }
    .bg-surface > * { overflow: auto; min-width: 0; }
    .bg-rail { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px; border-right: 1px solid #2a2a33; }
    .bg-tab { display: flex; flex-direction: column; align-items: center; gap: 2px; background: #1a1a22; border: 1px solid #33333d; border-radius: 4px; color: #ccc; padding: 6px 2px; cursor: pointer; font-size: 11px; }
    .bg-tab-active { background: rgba(140,120,220,.22); color: #fff; }
    .bg-tab-count { font: 10px 'JetBrains Mono', monospace; opacity: .6; }
    .bg-list { border-right: 1px solid #2a2a33; }
    .bg-entrylist { display: flex; flex-direction: column; }
    .bg-el-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid #23232b; }
    .bg-el-count { opacity: .6; font: 11px 'JetBrains Mono', monospace; flex: 1; }
    .bg-el-add { background: #1a1a22; border: 1px solid #33333d; color: #ccc; border-radius: 4px; cursor: pointer; }
    .bg-el-row { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; }
    .bg-el-active { background: rgba(140,120,220,.14); }
    .bg-el-name { flex: 1; font: 12px 'JetBrains Mono', monospace; }
    .bg-el-refs { font: 11px 'JetBrains Mono', monospace; color: #8c78dc; }
    .bg-el-dead { font-size: 10px; border: 1px dashed #555; border-radius: 3px; padding: 0 4px; opacity: .6; }
    .bg-el-del { background: none; border: none; color: #888; cursor: pointer; }
    .bg-preview, .bg-editor { padding: 10px; }
    .bg-editor { border-left: 1px solid #2a2a33; }
    .rc-form { display: flex; flex-direction: column; gap: 10px; }
    .rc-slot { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .rc-slot-name { flex: 1; }
    .rc-play { background: #1a1a22; border: 1px solid #33333d; color: #cbb8ff; border-radius: 4px; cursor: pointer; }
    .rc-comment input, .rc-slot select, .rc-slot input[type="number"], .rc-mark-row input { background: #23232b; color: #cfcfcf; border: 1px solid #2a2a33; border-radius: 3px; }
    .rc-plot-canvas { border: 1px solid #2a2a33; border-radius: 4px; }
    .rc-plot-marks { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .rc-mark-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .rc-mark-active { background: rgba(140,120,220,.12); border-radius: 3px; }
    .rc-mark-del { background: none; border: none; color: #888; cursor: pointer; }
    .rc-pv-canvas { border: 1px solid #2a2a33; border-radius: 4px; background: #0e0e13; }
    .rc-transport { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .rc-transport button { background: #1a1a22; border: 1px solid #33333d; color: #ccc; border-radius: 4px; cursor: pointer; padding: 2px 10px; }
    .bg-grad-bar { border: 1px solid #2a2a33; border-radius: 4px; cursor: pointer; }
    .bg-grad-stop { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; font-size: 12px; }
    .bg-refby { margin-top: 10px; }
    .bg-refby-head { font-size: 11px; opacity: .7; margin-bottom: 4px; }
    .bg-refby-row { font: 11px 'JetBrains Mono', monospace; opacity: .8; }
```

> These `.bg-*` rules also retroactively style the backgrounds surface (which previously had no surface CSS in `index.html`). That is an improvement, not a regression — verify the bg e2e smokes still pass in Step 5.

- [ ] **Step 4: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (all unit tests green).

- [ ] **Step 5: Build + bg regression e2e**

```bash
npm run build
ss -ltnp | grep 8137 && pkill -f server.js || true
npx playwright test e2e/editor.spec.ts -g "backgrounds"
```
Expected: PASS (bg surface still works with the new shared CSS).

- [ ] **Step 6: Commit**

```bash
git add src/ui/boot.ts index.html
git commit -m "feat(rc): register response-curves surface + surface CSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: e2e smokes (`e2e/editor.spec.ts`)

**Files:**
- Modify: `e2e/editor.spec.ts` (**append only** — never touch existing borders/backgrounds/harness blocks)

- [ ] **Step 1: Append RC smoke tests**

```ts
test('response curves: add an event and bind a channel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await page.locator('.bg-tab', { hasText: 'Events' }).click();
  page.once('dialog', (d) => d.accept('E2EHover')); // new event name prompt
  await page.locator('.bg-el-add').click();
  await page.locator('.bg-el-row', { hasText: 'E2EHover' }).click();
  // bind nothing-yet is fine; assert the channel selects render
  await expect(page.locator('select[data-ch="Translation"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('response curves: add a 1D spline mark via the plot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await page.locator('.bg-tab', { hasText: '1D Splines' }).click();
  page.once('dialog', (d) => d.accept('e2eWobble'));
  await page.locator('.bg-el-add').click();
  await page.locator('.bg-el-row', { hasText: 'e2eWobble' }).click();
  const plot = page.locator('.rc-plot-canvas');
  const box = await plot.boundingBox();
  // click empty area to insert a mark (away from the two default endpoints)
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.3);
  await expect(page.locator('.rc-mark-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('response curves: trigger an event and the preview canvas stays alive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await expect(page.locator('.rc-pv-canvas')).toBeVisible();
  await page.locator('.bg-tab', { hasText: 'Events' }).click();
  await expect(page.locator('.rc-pv-canvas')).toBeVisible(); // preview persists across tab switches
});
```

- [ ] **Step 2: Build + run the RC e2e**

```bash
npm run build
ss -ltnp | grep 8137 && pkill -f server.js || true
npx playwright test e2e/editor.spec.ts -g "response curves"
```
Expected: PASS (3 new tests).

> The e2e mirror is write-isolated (the runner copies the JSON and symlinks assets — see the harness block at the top of `editor.spec.ts`), so these `Save`-triggering tests do not mutate the live `response curves.json`. `dialog.accept('value')` echoes a value (bare `accept()` returns `''` for prompts).

- [ ] **Step 3: Full e2e + commit**

```bash
npx playwright test e2e/editor.spec.ts
git add e2e/editor.spec.ts
git commit -m "test(rc): e2e smokes — add event, add spline mark, preview persists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full suite green**

```bash
npx tsc --noEmit
npx vitest run
npm run build
ss -ltnp | grep 8137 && pkill -f server.js || true
npx playwright test e2e/editor.spec.ts
```
Expected: all unit tests pass, build clean, all e2e (borders + backgrounds + response curves + harness) pass.

- [ ] **Dispatch a final whole-implementation code review** (per subagent-driven-development), then proceed to `superpowers:finishing-a-development-branch`.

---

## Self-review notes (author's check against the spec)

- **Spec coverage:** cubic port (T1) ✓; combine table (T2) ✓; rc state bus w/ guards (T3) ✓; rename rewriting referrers (T4) ✓; gradient bar extraction + byte-parity guard (T5) ✓; all six editors — curves (T8), events (T9), splines1d/2d (T7+T13), gradients (T11), sounds (T10) ✓; animated preview w/ scale→rotate→translate + tint/font-color (T12) ✓; cross-surface reveal + constrained curve keys + no schema change (T13) ✓; boot swap + CSS (T14) ✓; append-only e2e (T15) ✓.
- **Deviation flagged:** `renameRcEntry` is a parallel of the bg function, not a wrapper (the bg one is hardcoded to backgrounds). Documented in T4.
- **Scope/YAGNI:** no cross-fade blend machine, no sound playback, no WebGL — matches spec "Out of scope."
- **2D plot drag** edits `t` for both components and value for the 1D case; 2D component y-values are edited via the authoritative numeric mark list (T7). This keeps the canvas-drag simple while staying lossless. If finer 2D drag is wanted later, it's an additive enhancement, not a correctness gap.
- **Type consistency:** `AnyMark`/`Mark1`/`Mark2`/`Mark4` (spline.ts), `Mark` (bg gradients) used consistently across plot/preview/gradient; `ChannelKey`/`CHANNELS`/`fold` shared by eventForm + preview.
```
