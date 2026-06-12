# Response Curves Editor — Design Spec (Slice 5)

**Date:** 2026-06-12
**Status:** Approved design → next step is the implementation plan (`writing-plans`).
**Surface:** `responseCurves` — replaces the current read-only table placeholder with a full editor.

---

## Goal

Replace the read-only `responseCurves` table surface with a full authoring surface for `response curves.json`, mirroring the established backgrounds-surface house style (rail tabs │ entry list │ editor │ live preview), with an **engine-faithful** animated preview and curve editors.

## Architecture (in one paragraph)

A 4-panel `Surface` over a small pub/sub state bus (ported from `src/bg/state.ts`, including its re-entrancy-guarded notify and idempotent setters). Six tabs map 1:1 to the six tables in `response curves.json`. Edits mutate the file in place, set `file.dirty`, and call the surface's `onDirty()` (which schedules revalidation, refreshing the cross-reference index). A 2D-canvas preview animates a placeholder widget by sampling the bound channels with a **verbatim port of the engine's cubic spline**, combining them per the engine's per-channel add/multiply rules. Preview/transport state never dirties the document (slice-3 invariant). In-place root mutation only — never reassign `file.root` (reassigning sub-tables like `root['Events'][name]` is fine) (slice-1 invariant).

## Tech stack

Vite 5 + vanilla TypeScript (strict) · Vitest (node env, no DOM) for pure logic · Playwright (port 8137) for smokes · 2D canvas for plots/preview (no WebGL — there is no lighting/megatexture to port). ajv 8 draft-07 validates against the **out-of-repo** schema at `/mnt/Passport/Lifaundi/Gui/schemas/response-curves.schema.json`.

---

## Engine ground truth

Source: `/mnt/Passport/Engine/Kreatures/Engine/src/Gui/Themes/gui_themepackage.cpp`. The editor must match these three facts or the preview lies:

### 1. Interpolation is a cubic Catmull-Rom spline, not linear

`Spline::compute(n0,n1,n2,n3,t)` (lines 434–456) evaluates a uniform Catmull-Rom cubic from four neighbouring control points:

```
m1 = (p1 - p0) - (p2 - p0)/2 + (p2 - p1)      // == (p2 - p0)/2
m2 = (p2 - p1) - (p3 - p1)/2 + (p3 - p2)      // == (p3 - p1)/2
a  =  2(p1 - p2) + m1 + m2
b  = -3(p1 - p2) - m1 - m1 - m2
c  =  m1
d  =  p1
value = a·t³ + b·t² + c·t + d                  // t = local fraction in [0,1] within the segment
```

`Spline::compute(timestamp, loop_begin, loop_end)` (lines 458–511) selects the four indices and the local `t`. **Port this verbatim** (do not pre-simplify the tangents — keep bit-fidelity with the engine):

- `elements === 1` → constant `output[0]`.
- `t < input[0]`: if `loop_begin && elements >= 2` wrap `(elements-2, elements-1, 0, 1, t/input[0])`; else clamp `output[0]`.
- `t < input[1]`: indices `(loop_begin ? elements-1 : 0, 0, 1, after_the_end)` where `after_the_end = loop_end ? 2 % elements : min(2, elements-1)`; local `t = (t - input[0])/(input[1] - input[0])`.
- general `for i = 2 … elements-1`, first `t < input[i]`: indices `(i-2, i-1, i, loop_end ? (i+1)%elements : min(i+1, elements-1))`; local `t = (t - input[i-1])/(input[i] - input[i-1])`.
- fell through → clamp `output[elements-1]`.

`input[]` = knot times in seconds (the `t` of each mark); `output[]` = flat values strided by dimension (1, 2, or 4). Duration = `input[last]` seconds (engine: `totalDurationMS = input[last]·1000`). Looping is `time % duration` with neighbour wrap (`ComputeLooping`, line 524); one-shots clamp.

### 2. Each channel combines onto the base with a fixed rule and default

From `ComputeState`/`ComputeEvent` (lines 798–918). JSON channel keys are exact (`Style`, `Sound Effect`, `Font Color` — note spacing/casing):

| Channel (JSON key) | Spline table | Dim | Combine | Default (identity) |
|---|---|---|---|---|
| `Translation` | `2D Splines` | 2 | **add** | (0, 0) |
| `Scaling` | `2D Splines` | 2 | **multiply** | (1, 1) |
| `Rotation` | `1D Splines` | 1 | add | 0 |
| `Style` | `1D Splines` | 1 | add | 0 |
| `Tint` | `Gradients` | 4 | **multiply** | (1, 1, 1, 1) |
| `Font Color` | `Gradients` | 4 | add | (0, 0, 0, 0) |
| `Sound Effect` | `Sound Effects` | — | (plays a sound) | — |

The final widget transform is `Response::matrix()` (line 920): a `mat3` built as **scale → rotate → translate**, translation in points. The preview applies channels in that order.

### 3. "Gradients" are 4-D cubic splines, not linear colour ramps

`Tint`/`Font Color` index into `splines4d` (lines 844, 860) and are evaluated by the **same cubic** as every other spline — they are RGBA-over-time curves whose values may exceed 1.0 (HDR glow). They are a *separate namespace* from `backgrounds.json` Gradients. **Decision:** keep the familiar colour-stop **bar UX**, but draw the bar with the engine cubic and treat values as **raw HDR multipliers** (interp mode `engine-cubic-raw`, no sRGB bake). The backgrounds gradient editor keeps its existing `linear-srgb` mode unchanged.

### Preview scope (explicit YAGNI)

The engine has a ~150-line entry→exit→loop cross-fade state machine (`ComputeState`, hover-begin blending into hover-end, etc.). The authoring preview ports only the **single-event playback** path: trigger one event or state slot, sample each bound channel's spline at the transport time, fold per the table above (loop for state slots, clamp for one-shots), draw. The cross-fade blend machine is **out of scope**.

---

## File structure

```
src/rc/
  spline.ts      Verbatim port of Spline::compute (dim 1/2/4); durationOf(); loop/clamp wrappers. PURE.
  channels.ts    CHANNELS table (kind/combine/ident) — single source of truth shared by preview + forms.
  state.ts       rc pub/sub bus: tab, per-tab selection, transport (playing/scrubSeconds/loop), trigger,
                 structuralNonce, rev. Ports bg's re-entrancy-guarded rcNotify + idempotent setters. PURE.
  rename.ts      Thin wrappers over the existing renameNamedEntry for rc:* namespaces.
src/ui/rc/
  types.ts       RcFormDeps { file, ctx, markDirty }, RcPreviewDeps { file, ctx } (mirrors bg/types.ts).
  surface.ts     createResponseCurvesSurface(file, onDirty): Surface. 4-panel layout; structural-key re-mount.
  entryList.ts   Entry rows + ✕ delete + dblclick-rename (adapted from bg/entryList.ts).
  curveForm.ts   Response Curves: archetype+index "add"; 16 slots grouped States vs Events; each a dropdown
                 into Events + a ▶ trigger; Comment.
  eventForm.ts   Events: 7 channel dropdowns into the table per CHANNELS.kind + Comment + ▶ trigger.
  splinePlot.ts  Shared 1D/2D plot: draws the engine cubic; drag mark (t+value), click-empty insert,
                 ✕ delete, numeric mark list. 1 trace (1D) or 2 traces x,y (2D).
  soundForm.ts   Sound Effects: file picker (asset:sound) + tone/speed/volume [min,max] + Comment.
  previewPanel.ts 2D-canvas placeholder widget + transport bar. Samples trigger, folds channels, draws.
src/ui/bg/gradientBar.ts   NEW: extracted parameterized createGradientBar(opts) (see "Gradient reuse").
src/ui/bg/gradientEditor.ts MODIFIED: becomes a thin bg adapter over createGradientBar (linear-srgb mode).
src/ui/rc/gradientForm.ts  RC adapter over createGradientBar (engine-cubic-raw mode, rc:gradients consumers).
src/ui/boot.ts MODIFIED: swap createReadOnlyTableSurface('responseCurves', …) → createResponseCurvesSurface.
tests/rc/      spline.test.ts (cubic vs hand-computed engine values), channels.test.ts, state.test.ts.
tests/bg/      gradient regression: bg output unchanged after the extraction.
e2e/editor.spec.ts  Append-only RC smokes.
```

No `src/preview/rc/` — the preview is 2D canvas, no WebGL renderer module.

## State shape (`src/rc/state.ts`)

```ts
type RcTab = 'curves' | 'events' | 'splines1d' | 'splines2d' | 'gradients' | 'sounds';
interface RcState {
  tab: RcTab;
  selected: Record<RcTab, string | null>;
  // preview transport — NEVER dirties the document
  playing: boolean;
  scrubSeconds: number;
  loop: boolean;
  trigger: { kind: 'event' | 'spline1d' | 'spline2d' | 'gradient'; name: string } | null;
  structuralNonce: number;
  rev: number;        // bump to force plot/preview redraw without re-mount
}
```

- `structuralKey = [tab, selected[tab] ?? '', String(structuralNonce)].join('|')` → drives panel re-mount; a plain `rcNotify()` updates in place. Same contract as bg.
- `rcNotify` is the re-entrancy-guarded loop (the slice-4 stack-overflow fix, baked in from the start). All setters are idempotent (no write/notify when the value is unchanged), matching the `setPairing` fix.
- `trigger` is what the preview animates: set by a ▶ on the event/curve forms, or implicitly to the selected spline/gradient on those tabs. Preview-only.

## Gradient reuse (the extraction)

Extract `src/ui/bg/gradientBar.ts` exposing:

```ts
interface GradientBarOpts {
  getMarks(): Mark[];                       // Mark = [t, [r,g,b,a]]
  setMarks(marks: Mark[], opts: { live: boolean }): void; // live=true: dragging, not yet sorted/committed
  consumers(): { from: { label: string } }[];
  interp: 'linear-srgb' | 'engine-cubic-raw';
  onRedraw(fn: () => void): void;           // subscribe to the host bus (bgNotify / rcNotify)
}
createGradientBar(host: HTMLElement, opts: GradientBarOpts): { update(): void };
```

- `interp: 'linear-srgb'` → existing `bakeGradient` + `pow(1/2.2)` display + 0..1 colour inputs (backgrounds, **unchanged behaviour**).
- `interp: 'engine-cubic-raw'` → bar drawn by sampling the **engine cubic** (`src/rc/spline.ts`, dim 4) over t∈[0,maxT]; values shown raw (HDR-capable); inserted stops interpolate from the cubic, not the linear bake.
- `src/ui/bg/gradientEditor.ts` becomes a ~10-line adapter that constructs `createGradientBar` with bg globals + `linear-srgb`. **Regression guard:** existing `tests/bg/*` must stay green; add an assertion that a fixed gradient bakes to identical bytes pre/post extraction.

## Surface contract

`createResponseCurvesSurface(file: FileDoc, onDirty: () => void): Surface` returns `{ key: 'responseCurves', label: 'Response Curves', icon: '◠', mount, refresh, reveal }`. `mount` builds the 4 panels once; `refresh(ctx)` re-threads ctx and repaints (structural-key change re-mounts the editor/preview, plain change updates in place); `reveal(entry?)` selects the tab+entry a cross-surface nav targets. Registered in `boot.ts` in place of the read-only placeholder, passing `pkg.files.responseCurves` and `scheduleRevalidate` (confirm the exact `FileDoc` key during implementation).

## Editors

- **curveForm** — entry key is constrained (`(GridItem|ListItem|Button|Action|Affordance|Window|Progress|Toggle|Bounce)_[0-3]`, `_N`, or bare `N`); "add" is an archetype+index picker, not free text. 16 slots in two groups — **States** (Hovering/Toggled/Selected/BaselineLoop, loop) and **Events** (OnHoverBegin…OnActivate2, one-shot) — each a `<select>` of `Events` names (plus empty) + a ▶ that sets `trigger`. Comment field.
- **eventForm** — free-named. 7 `<select>`s, each populated from the table named by `CHANNELS[key].kind` (Translation/Scaling → 2D Splines, Rotation/Style → 1D Splines, Tint/Font Color → Gradients, Sound Effect → Sound Effects), plus empty. ▶ triggers the whole event. Comment.
- **splinePlot** — canvas plot. X = time (0…maxT), Y = value range (auto from marks, padded). Curve drawn as the **engine cubic** (sample densely). Drag a handle to move (t, value); click empty to insert (value from the cubic at that t); ✕ deletes but always keeps ≥1 mark (schema `minItems: 1`; the cubic falls back to a constant at a single mark). Numeric mark list mirrors the canvas. 2D draws x and y as two coloured traces sharing the time axis.
- **gradientForm** — `createGradientBar` in `engine-cubic-raw` mode over `file.root['Gradients']`, `rc:gradients` consumers.
- **soundForm** — `file` via asset picker (`asset:sound`); `tone`/`speed`/`volume` each an optional `[min,max]` pair (absent = omit the key); Comment. No playback.

## Animated preview (`previewPanel.ts`)

A placeholder widget (rounded rect + centred label) on a 2D canvas. Each frame (rAF, only while `playing`):

1. `t = playing ? elapsed : scrubSeconds`.
2. Resolve the `trigger` to its bound channels (an Event's channel map, or a single selected spline/gradient applied to its natural channel).
3. For each channel, `sampleSpline(...)` at `t` (loop-wrap for state slots, clamp for one-shots), fold onto the base per `CHANNELS[key].combine`/`ident`.
4. Draw: `ctx.translate → rotate → scale` (matching `matrix()`), Tint as colour multiply on the rect (clamped for display, raw HDR noted), Font Color on the label.

Transport bar: play/pause, scrub slider, loop toggle. Duration = longest bound channel's `durationOf`. The preview reads selection/trigger from `rcState` and **never writes the document**.

## Cross-references, rename, validation

- Namespaces already exist in `refIndex`: `rc:events`, `rc:splines1d`, `rc:splines2d`, `rc:gradients`, `rc:sounds`. Dropdowns list names via the index/table; "referenced by" panels use `index.consumers(ns, name)`.
- Rename of a free-named entry (event/spline/gradient/sound) rewrites referrers via the existing `renameNamedEntry(pkg, index, ns, old, new)`. Response-Curve **widget keys are not renamed** (constrained slots) — add/remove only.
- Every mutation calls `markDirty()` → `onDirty()` → `scheduleRevalidate`, keeping ajv issues and the index fresh. Schema lives **outside this repo** (commit schema edits in the `Gui` repo separately) — but this slice needs **no schema change**.

## Testing

- **Unit (Vitest, pure):** `spline.test.ts` — cubic sampler vs hand-computed engine values for 1/2/4-D, the `elements===1`, pre-first, post-last, and loop-wrap branches; `channels.test.ts` — combine/ident table; `state.test.ts` — structural key, idempotent setters, re-entrancy guard (ported bg regression tests).
- **Regression:** `tests/bg/*` stay green; gradient byte-parity assertion across the `createGradientBar` extraction.
- **e2e (Playwright, append-only):** smokes — open Response Curves tab; add an event and bind a channel; add a spline mark; trigger an event and assert the preview canvas updates. Use `d.accept(d.defaultValue())` for prompt dialogs. `npm run build` before running (server serves `dist/`).

## Invariants (carried from prior slices)

- In-place root mutation; never reassign `file.root` (sub-table reassignment OK).
- Preview/transport state never dirties the document.
- Forms skip `document.activeElement` in `update()` so typing isn't clobbered.
- `tsc --noEmit` after every task (catches what Vitest/esbuild skip). `npm run build` before any e2e conclusion.
- Work on a single `slice-5-response-curves` branch; no new branches; no force-push; never `npm install`.

## Out of scope

Entry→exit→loop cross-fade blend machine; sound playback (WebAudio); 3D/4D spline *motion* preview beyond Tint/Font-Color colour; editing `backgrounds.json` gradients' behaviour (only the shared component is extracted); schema changes.

## Risks

- **Slice-4 regression** from extracting `gradientBar`. Mitigation: bg adapter preserves exact behaviour; bg tests + byte-parity assertion guard it.
- **Cubic fidelity** — easy to get the index/`t` selection subtly wrong. Mitigation: verbatim port + unit tests against hand-computed engine outputs.
- **`FileDoc` key / asset-namespace names** (`pkg.files.responseCurves`, `asset:sound`) assumed from prior exploration — confirm exact identifiers in the first implementation task.
