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

## MaxRects packer (Task 12) — note for Task 13/14 consumer

- **Trailing-edge-only gutter leaves right/bottom-edge sprites with no outer margin.** The packer
  pads each piece's footprint by `roundUp(w+gutter, align)` on its TRAILING edges only; the canvas
  edge acts as the outer gutter on leading sides. This guarantees a full `gutter` separation between
  any two *interior* pieces, but a sprite flush against the right or bottom canvas edge gets zero
  trailing margin. For atlas packing where every sprite needs a gutter on all four sides to prevent
  bilinear/mip bleed, the **Task 13/14 consumer must reserve edge gutter** — pack into
  `(canvasW - gutter) × (canvasH - gutter)`, or pad all sides and accept the packing-efficiency cost.
  The packer API itself is correct (20k-case stress: all placements aligned, in-bounds, non-overlapping
  padded footprints); this is a consumer-side decision, not a packer bug.
  **CLOSED in `2470d90`** (`fix(pack): reserve trailing-edge gutter on the canvas`): the consumer now
  packs into the shrunk canvas (`canvasW - gutter`, `canvasH - gutter`) so right/bottom-edge sprites
  also get a full gutter on all four sides.

## Packer (Task 14) — note for Task 15 export consumer

- **Degenerate (collapsed-band) cells retain SOURCE-space rects in the rewritten sheet-space grid.**
  `packLayer` skips cells with `w<=0||h<=0` during dedup and passes them through unchanged
  (`structuredClone`), so the rewritten `cells` mixes sheet-space rects (real pieces) with
  source-space rects (degenerate). Both reviewers confirmed this is downstream-HARMLESS: a
  zero-extent axis collapses the cell to zero UV span → no texels sampled regardless of where the
  stale coord points (and `quantizeUnorm16` clamps to [0,1]). Task 15's export path just needs to
  not treat a degenerate cell's stale coords as meaningful — they render nothing.
- **Linked-layout dedup keys only off the LEAD layer's cells.** Correct for #COPY (linked layers
  MUST share geometry by definition), and now guarded: `packLayer` throws if linked group members'
  source dimensions differ. The cells-geometry match is still relied upon (the UI edits linked
  layers in lockstep) rather than validated cell-by-cell — acceptable given the single caller.

## Deferred view-fit (Task 7 minor)

- Module-level `view` (zoom/pan) is not reset/fit when switching borders; a differently-sized border
  keeps the previous transform. Likely intended for a later slice — wire an auto-fit-on-select if
  integration shows it's needed.

## Spec-vs-plan gaps (final whole-implementation review, 2026-06-10)

The 18-task plan was executed completely and faithfully, but the final holistic review found three
symbols that the plan defined + unit-tested as Task-3 building blocks yet **no plan task ever wired
into the app**. They are orphan exports today (not accidental dead code — deliberately un-consumed
because the plan never tasked their consumers). The spec implies them; the plan did not schedule them.
Decide explicitly per item: wire it, or accept the gap.

- **`isValidBorderName` (src/borderNames.ts) has no consumer — there is no new-border creation UI.**
  Spec §4.3 promised "border list … with new-border with validated name." The validator exists and is
  tested, but nothing in the app creates a border. To close: a small new-border modal (name field →
  `isValidBorderName` → insert empty entry into `state.doc.root`).
  **CLOSED (pre-existing, not this branch).** `isValidBorderName` is now consumed in the slot-list
  add-name path: `src/ui/slotList.ts:128` (`if (!state.doc || !isValidBorderName(name)) return;`),
  imported at `slotList.ts:13`. The dropdown-driven slot add (commit `1bdbdb5`) routes new names
  through it before inserting.
- **`getEditorMeta`/`setEditorMeta` (src/document.ts:23-29) are never called; `Editor` metadata is
  write-only.** `applyPackResult` writes `entry.Editor` (source image + source-space cells + pack
  settings), but `selectBorder` (src/ui/main.ts) always loads a border from its **packed sheet** cells,
  never from `Editor.source`/`Editor.sourceCells`. So the Slice-4 exit criterion "remains re-editable
  via Editor metadata" holds only in the write direction — you can pack once, but re-opening a packed
  border to re-pack-from-original-source is not wired. To close: an Editor read-back path in
  `selectBorder` that, when `entry.Editor` is present, restores the source image + source-space cells
  instead of the packed cells.
  **CLOSED (pre-existing, not this branch).** The read-back path now exists: `src/editorReadback.ts`
  (`editorSourceCells(entry)` → `getEditorMeta` + `unflattenCells`) and `selectBorder` consumes it at
  `src/ui/main.ts:102` — when `entry.Editor` is present it reopens from SOURCE space (source image +
  source-space cells + authored `linked` flag), falling back to the packed sheet only when there is no
  Editor meta or the source image fails to load. The re-edit loop (pack writes Editor → re-select
  rebuilds source layers) is wired in both directions. `getEditorMeta` is no longer write-only.

## File-server symlink jail caveat (server.js:18-25, final review minor)

- `jail()` correctly blocks `..` and absolute-path escapes via string-prefix check (covered by
  tests/server.test.ts), but does **not** resolve symlinks: a symlink *inside* the Gui root pointing
  outward (`root/x → /etc`) would pass the prefix check and `fs.readFile`/write would follow it out.
  Low risk for a 127.0.0.1-bound dev tool over a trusted asset tree, and arguably out of scope, but
  the one real jail gap. Harden (if wanted) with `fs.realpath` on the resolved path + re-check the
  prefix. Server bind is confirmed 127.0.0.1-only.

## Newly-recorded debt (bugfix-and-polish branch review, 2026-06-12)

Found while landing this branch's fixes. None blocking for a single-user dev tool, but honestly logged.

- **`atomicWrite` uses a fixed `.tmp` temp name (server.js:30).** `const tmp = abs + '.tmp'` — two
  concurrent PUTs to the same path race on the same temp file (one's `open('w')`/`writeFile`/`rename`
  interleaves with the other's), so the surviving file can be a torn mix or the loser's `unlink` can
  delete the winner's temp mid-flight. Harmless for a single-user dev tool (no concurrent writers to
  one path in practice), but a real race. Fix with a unique suffix (`abs + '.' + process.pid + '.' +
  randomUUID() + '.tmp'`) so each write gets its own temp.
- **`BordersDoc`/`FileDoc` dual-model dirty-sync (src/ui/surfaces/borders.ts) is still the most fragile
  coupling.** The surface keeps a `BordersDoc`-shaped editing model while Save/export operate on a
  `FileDoc`; keeping their dirty/serialized state in sync is the trickiest invariant in the app.
  **Partially mitigated** by `38e3294` (`refactor(borders): single serialization path`): exportPanel
  and Save now share one `FileDoc` via `state.file` (set at `borders.ts:59`, the surface receives it as
  `bordersFile: FileDoc`), so there is one serialization path (detected-indent) instead of two. The
  dual-model coupling itself remains — the surface still bridges two shapes — it's just no longer
  double-serializing.
- **Border-name enum is encoded in three independent places with no drift checker.** (1) `PATTERNS` in
  `src/borderNames.ts:1` (the regex list `isValidBorderName` tests against), (2) `allBorderNames()` in
  `src/borderNames.ts:14` (which enumerates the full slot list — must stay in lockstep with PATTERNS by
  hand), and (3) the schema's root `patternProperties` in
  `/mnt/Passport/Lifaundi/Gui/schemas/borders.schema.json:7-…` (e.g.
  `^(Header|Footer|Slider|Button|GridItem|ListItem|Tab|Window|IndentGroupBox|RaisedGroupBox)_[0-3]$`,
  `^Panel_[0-3]_[0-3]$`, etc.). Nothing asserts the three agree; adding a Window-type or changing an
  index range means editing all three or silently diverging. (Note: the schema also lives outside this
  repo — see MEMORY — so a drift checker would need to read across repos.) Consider deriving all three
  from one source, or a test that cross-checks them.
- **RGB5551 quantization is not simulated in the coding-themes color sample.** The engine packs colors
  as RGB5551 (5 bits per RGB channel + 1 alpha bit). The editor only simulates the *alpha* bit:
  `alphaOn(a)` (`src/package/codingThemes.ts:50`) and the swatch/CSS path quantize alpha to on/off. The
  RGB channels go straight to full 8-bit — `rgbaToCss`/`rgbaToHex` use `toByte(n) = round(n*255)` with
  no 5-bit truncation — so the live sample and swatches show colors a touch more precise than the
  engine will actually render. To simulate: quantize each RGB channel to 5 bits (`(round(n*31)/31)`)
  before display. Cosmetic preview-fidelity gap only.

### Branch validators/preview added (changelog note, not debt)

For context, this branch also added several validators and an audio preview (these *reduce* the gap
between editor and engine, they are not debt): asset-in-engine-unsupported-format is now an error
(`8b4086f`), rc spline/gradient mark shape + strict-ascending ordering checks (`b415031`), nonzero
TexCoord `timeFactor` warning (`0c4bcec`), imageless Overlay/#COPY mask handling + warning
(`d258de1`), and audio preview for Assets/Sound-Effect forms (`964e111`).
