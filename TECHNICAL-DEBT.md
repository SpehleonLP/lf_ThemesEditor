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

## Deferred view-fit (Task 7 minor)

- Module-level `view` (zoom/pan) is not reset/fit when switching borders; a differently-sized border
  keeps the previous transform. Likely intended for a later slice — wire an auto-fit-on-select if
  integration shows it's needed.
