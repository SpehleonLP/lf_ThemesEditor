# GUI Theme Package Editor — Mockup Brief

> **Paste this into the claude.ai design tool together with the four schema files
> (`borders/backgrounds/response-curves/coding-themes.schema.json`) and a screenshot of the current
> borders editor.** Produce **one clickable visual mockup of the entire app** — all four authoring
> surfaces plus the shared shell. It does **not** need to be wired to real data or the real engine.
> It is a **layout + interaction reference** that a separate model will reimplement in **vanilla
> TypeScript + `<canvas>`/WebGL2** (no framework). React/Tailwind is fine for the mockup; don't worry
> that the final build won't be React. **Layout and interaction clarity matter more than pixel
> perfection.**

---

## 1. What the app is

It authors a **`.lf_gui` theme package** for a game engine's GUI. A theme is authored as **four JSON
files** plus image/sound assets, then compiled into the package by `Gui::PackageBuilder`:

| Surface | File | What it themes |
|---|---|---|
| **Borders** | `borders.json` | 9-slice / tessellated panel frames (CSS `border-image`, but richer) |
| **Backgrounds** | `backgrounds.json` | Panel backdrops: textured detail layers, frosted glass, swept "light" gradients |
| **Response Curves** | `response curves.json` | Widget feedback: events → animated channels (move/scale/tint/sound) |
| **Coding Themes** | `coding themes.json` | Syntax-highlight palettes for in-game text buffers |

**Only the Borders surface exists today** (the attached screenshot — functional but flawed, see §4).
The other three are greenfield. The mockup should present a **unified package editor** that hosts all
four, not four separate tools.

## 2. App shell

- **Top toolbar (package-level):** package name, **Save** (writes all files), **Validate**, **Build
  / Export `.lf_gui`**, validation status.
- **Left nav:** the four surfaces (Borders / Backgrounds / Response Curves / Coding Themes) + an
  **Assets** section (images, sounds).
- **Main area:** the active surface.

## 3. Cross-cutting principles (apply to ALL surfaces — this is the app's reason to exist)

1. **The engine silently ignores anything it doesn't recognize.** A mistyped slot name
   (`FlatGroupBox_0` instead of `FlatGroupBox_X_Y`), a wrong field, or a dangling name reference
   simply does nothing — no error. So the editor's core job is to make those impossible / loud:
   - **Slot names come from a fixed enum** (the schemas' `patternProperties`). Adding an entry =
     **picking an unused slot from a dropdown**, never free text.
   - **Cross-references are pickers, not text fields.** Names like a gradient/event/spline/texcoord/
     sound are referenced *by name* from many places; every such field should be a **dropdown of
     existing entries** with "+ new", a **go-to-definition**, and a **dangling-reference warning**
     when a referenced name doesn't exist (schema can't catch this).
   - **Validate beyond schema:** file existence + format (images png/jpg/jpeg/bmp — **webp
     rejected**; sounds ogg/wav/flac), **ascending spline marks**, border `Tessellation` per-axis
     unit consistency. Surface these **inline**, next to the offending field, not just as a dump.
2. **Named tables are first-class.** Gradients, TexCoords, Events, 1D/2D Splines, Sound Effects are
   reusable tables referenced from multiple consumers. Give each an editor, show **which consumers
   reference each entry**, and flag **unreferenced ("dead")** entries (entries are only packed when
   referenced).
3. **Direct manipulation over raw numbers**, with numeric fields as a secondary, always-in-sync
   readout. Drag handles on a canvas; scrub timelines; pick colors — don't make the artist type
   coordinates.
4. **`timeFactor` caveat:** in TexCoords, only `timeFactor: 0` is reliable (a known shader int/float
   bug); warn on nonzero.

---

## 4. Surface A — Borders (`borders.json`) — the complex one; v1 exists

### Model
`borders.json` is a flat map; **each key is a fixed GUI slot enum name** (`Window_0..3`,
`GridItem_0..3`, `Panel_i_j`, `FlatGroupBox_i_j`, `Backing_0..2`, …). Each border has:
- **`Overlay`** — visible artwork *layer* = `{ Image (path), EdgeFill, CenterFill, Cells, Comment }`.
- **`Mask`** — optional coverage layer (R = shape, G = Photoshop-Overlay-blend strength); often
  `"#COPY"` (inherit Overlay cells) or `"#OVERLAY"` (overlay masks itself).
- **`Tessellation [l,t,r,b]`** — outer border band widths in points (≤1 = fraction of panel).
- **`Expansion [l,t,r,b]`** — points the canvas bleeds **outside** the layout rect (shadows, rod ends).
- **`CenterTile [x0,y0,x1,y1]`** — bounds the tiled center "spine"; default `[1,1,-1,-1]` collapses it.
- **`Style`** — CSS **box model**: `Margin` (outside), `Padding` (inside), `MinSize [w,h]`.

### Slice / cells model (the heart)
A border slices its source image into up to a **5×5** grid (classic case: 3×3 nine-patch — 4 fixed
corners, 4 stretch/tile edges, 1 center). `EdgeFill`/`CenterFill [x,y]` choose fill per axis:
`STRETCH`, `TILE` (native-size repeat), `FLEXIBLE` (integer repeats scaled), `CENTER` (detail bunches
at band ends), `SNAP` (reserved). Cells geometry is source rects `[x0,y0,x1,y1]`;
**negative coords MIRROR** that axis (one corner mirrors to all four). **Images are shared by path**
across many slots.

### Fidelity rule (critical)
The preview **must render exactly what the engine renders** — in particular the engine's shader
`discard`s duplicate corner instances, so a 9-patch shows **one** corner copy. The current editor
wrongly draws **9 copies**. If the preview lies, the tool is useless.

### Redesign goals (fix the screenshot)
Everything is **directly manipulable on the canvas**, numbers in sync:
- **Box-model overlay** (devtools-style nested Margin/Padding/band boxes) with draggable edges.
- **Tessellation & Expansion drawn on the preview as draggable bands** (show Expansion's outside bleed).
- **Grid cuts are draggable handles** (today columns can't be grabbed).
- **Preview is a real resizable viewport** — drag a handle to resize the previewed panel (so W/H is a
  gesture and the render actually resizes), with **zoom + pan**.
- **Slot picker** (enum dropdown to add a border), **open/add images**, **shared-sheet indicator**
  (badge when N borders reference one sheet — shows edit blast radius).

---

## 5. Surface B — Backgrounds (`backgrounds.json`)

Four tables. Authoring centers on a **live panel-background preview**.

- **`Backgrounds` (Backdrops)** — per slot: up to **2 Detail Layers** (`image` path or `#HURL_NOISE`
  procedural noise + a **`texCoord` ref** + `wrapX/wrapY`), optional **`Frosted Glass`** (`blur` 0..2,
  `zoom`, `opacity`), `detailOpacity`. Layer 1 composites over layer 0.
- **`Lights`** — a 1-D **gradient ref** swept across the panel: `direction`, `scale` (frequency),
  `radial` (0 linear→1 circular), `amplitude`, `mode` (`Fade/Saw/Sine/Triangle/None`), optional
  `texCoord`.
- **`TexCoords`** (shared table) — named UV transform/animation: `normalization`, `spinSpeed`,
  `scrollFactor`, `scaleFactor`, `rotationCenter`, `initialTime`, `timeFactor` (warn ≠ 0).
- **`Gradients`** (shared table) — named color ramps; marks `[t, [r,g,b,a]]`, t ascending 0..1.

**Authoring surface:** pick a slot → compose detail layers + lights with a **live shader-style
preview** of the resulting panel; a **gradient stop editor** and a **texcoord editor** (with an
animation play/scrub) as shared tables, referenced by dropdown from layers/lights.

---

## 6. Surface C — Response Curves (`response curves.json`)

Widget **feedback animation**. Tables:

- **`Response Curves`** — per archetype slot (`Button_0..3`, `GridItem_0..3`, …): map **events/states**
  (`HoveringState`, `ToggledState`, `SelectedState`, `BaselineLoop`, `OnHoverBegin/End`, `OnClick`,
  `OnDoubleClick`, `OnToggled`, `OnActivate1/2`, …) → an **Event ref**.
- **`Events`** — bundle channels: `Translation` (2D spline, points), `Rotation` (1D spline),
  `Style` (1D), `Scaling` (2D), `Tint` (gradient), `Font Color` (gradient), `Sound Effect`.
- **`1D / 2D Splines`** — keyframe curves over time; marks `[t, v]` / `[t,[x,y]]`, **t strictly
  ascending**; states loop, one-shots clamp.
- **`Gradients`** — RGBA over time (HDR values >1 allowed, e.g. glow). **`Sound Effects`** —
  `file` + randomized `tone/speed/volume [min,max]` ranges.

**Authoring surface:** pick an archetype → wire its events to **Events** (dropdown). An **Event editor**
with per-channel sub-editors: a **spline curve editor** (drag keyframes on a timeline), a
**gradient-over-time** editor, a **sound picker**. A **preview that plays the feedback on a sample
widget** (trigger hover / click / toggle) with a **timeline scrubber**.

---

## 7. Surface D — Coding Themes (`coding themes.json`)

Syntax-highlight palettes keyed `Light` / `Dark`. ~18 **optional** RGBA color roles: `Background`,
`Line`, `LineNumber`, `SideBar`, `ScrollBar`, `ModifiedLines`, `SavedLines`, `Error`, `Warnings`,
`Text`, `Comment`, `Integer`, `String`, `Keyword`, `Builtin_Type`, `Keyword_TypeModifier`,
`Builtin_Function`, `Preprocessor`. (Unset roles fall back to engine defaults.)

**Authoring surface:** a role list with **color pickers** beside a **live syntax-highlighted code
sample** that recolors as you edit; **Light/Dark** toggle or side-by-side. Colors pack to RGB5551, so
alpha is effectively a 1-bit on/off — reflect that.

---

## 8. Assets

An image/sound browser: thumbnails/listing, **which tables reference each asset**, and
**missing-file / wrong-format** warnings (webp rejected for images).

## 9. Deliverable

One clickable artifact showing: the **package shell** (toolbar + 4-surface nav + Assets); **all four
surfaces**, with **Borders the most fleshed-out** (box-model + band overlays, draggable cut/cell/margin
handles even if faked, resizable/zoomable preview, slot dropdown, shared-sheet badge); the **shared
named-table pattern** (reference pickers + go-to-definition + dead-entry flags) visible on Backgrounds
and Response Curves; **inline validation/warnings**; and **Build/Export `.lf_gui`**. Annotate anything
non-obvious. Layout + interaction clarity over pixel perfection — this is a reimplementation reference.
