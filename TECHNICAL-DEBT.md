# Technical Debt — borders-editor webapp

Deferred items found during review but intentionally NOT fixed in-slice (would deviate
from the frozen plan or can only be validated/optimized at integration). Revisit during
Task 11 (preview wiring) and the final whole-implementation review.

## Rect editor (Task 7) — render architecture

These are critiques of the plan's deliberate render-on-subscribe + `notify()`-for-cross-panel-sync
design, surfaced by the Task 7 code-quality review. They were NOT applied because:
- the implementation is byte-identical to the plan's listing, and
- `notify()` on cell-select is what the (future) properties form (Task 8) and preview (Task 11)
  rely on for cross-panel updates — removing it would break planned behavior, and
- Step 3 (live browser interaction) is deferred to integration, which is where these are best judged.

- **C1 — mousedown calls `notify()`, which rebuilds the canvas mid-gesture.** `renderRectEditor`
  resets `host.innerHTML` on every notify, replacing the very `<canvas>` the mousedown fired on.
  Drag state is module-level and survives, and the new canvas re-receives move/up at the same
  cursor position, so it likely works — but it's fragile. At integration, consider
  `setPointerCapture` and/or splitting structural render from per-frame `draw()`.
- **C2 — `onmouseup` calls `notify()` on every release, including pans** (which change no document
  state). Full DOM teardown/rebuild per gesture. At integration, only `notify()` on real document
  mutations; repaint view-only changes with `draw()`.
- **I1 — `renderRectEditor` rebuilds the whole subtree + re-binds listeners on every subscribe.**
  No listener leak (property-assignment handlers die with their nodes), but heavy. Split one-time
  structural render from per-frame `draw()`.
- **I2 — `imageCanvas` cache key is `${state.selected}/${state.activeLayer}`** (border *name*),
  not image identity. Reloading the same border name with a fresh image would reuse a stale canvas.
  Low blast radius today (names stable); key off image reference / path+dims when reload-same-border
  becomes a real path.

## Properties form (Task 8) — render-on-subscribe focus loss

- `renderPropertiesForm` rebuilds the whole form (`host.innerHTML = ...`) on every `notify()`,
  so committing an edit (`onchange`) tears down and rebuilds the form, jumping focus to the top.
  `onchange` (not `oninput`) means mid-typing isn't lost, but sequential field entry is awkward.
  Same render-on-subscribe debt as the rect editor; address at integration by splitting structural
  render from per-frame paint, or by preserving/restoring focus across rebuilds.
- Optional type tightening: `LayerState.edgeFill/centerFill` are `[string, string]`; typing them
  `[FillMode, FillMode]` (FillMode already exists in types.ts) would remove the `as any` casts in
  propertiesForm.ts and catch invalid fill values at compile time. Deferred (ripples into state.ts).

## WebGL2 renderer (Task 10) — perf follow-ups

Surfaced by the Task 10 code-quality review. The Critical/Important resource-hygiene
items (dispose(), shader detach+delete, context guard) WERE fixed in `0d584728`.
These remaining items are perf smells, correctness-safe, deferred until the Task 11
preview consumer makes the cost real:

- **M5 — `u()` returns `WebGLUniformLocation | null` straight into `gl.uniform*`.** A mistyped
  uniform name (or one optimized out by the GLSL compiler) silently no-ops. All current names
  verified correct against the shader. Consider a dev-only assert when a location is null but the
  program linked clean.
- **M6 — `upload()` does a full `texImage2D` (realloc) every `render()`** even when the image is
  unchanged. For an interactive preview re-rendering on each cell drag this re-uploads the whole
  border image per frame. Switch to `texSubImage2D` (or a dirty flag) once the image is stable and
  only band geometry changes.
- **M7 — `getUniformLocation` called every render for every uniform, no caching.** ~20 lookups/frame.
  Locations are stable post-link; cache them at construction when optimizing the render loop. Pairs
  with the M5 fix.

## Deferred view-fit (Task 7 minor)

- Module-level `view` (zoom/pan) is not reset/fit when switching borders; a differently-sized border
  keeps the previous transform. Likely intended for a later slice — wire an auto-fit-on-select if
  integration shows it's needed.
