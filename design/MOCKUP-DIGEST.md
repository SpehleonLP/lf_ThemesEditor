# Mockup Digest — Theme Package Editor

Source: `Theme Package Editor.dc.html` (dc-runtime / React-based clickable mockup)
Brief: `PACKAGE-EDITOR-MOCKUP-BRIEF.md`

---

## 1. App Shell

### Dimensions and chrome
Full-viewport, dark theme (`#0c0c10` body). Two fonts throughout: IBM Plex Sans (UI) and JetBrains Mono (data, code, labels).

### Top toolbar (52 px tall, fixed)
Left to right:
- **App icon** — 26×26 rounded square, purple gradient, small inner square glyph.
- **Package name** (`fantasy_ui.lf_gui`, monospace, 13 px bold) with an amber dot for "unsaved changes" state.
- **Sub-label** — `Gui::PackageBuilder · 4 files · 12 assets` in muted small text.
- **Vertical separator** (1 px).
- **Menu items** — File / Edit / View (text only, 12 px, no dropdown functionality in mockup).
- **Flexible spacer.**
- **Validation status button** — toggleable; when errors present shows a red dot, "3 errors" in red, "· 3 warnings" in amber, a small down-caret. Clicking opens/closes the Issues Drawer. The button border and background tint red when errors exist.
- **Validate** button (secondary style).
- **Save** button (secondary style).
- **Build .lf_gui** button (primary, purple gradient, "⬡" icon).

### Left sidebar (212 px wide, fixed)
Two sections separated by a "SURFACES" / "ASSETS" label:

**SURFACES section:**
- Borders (icon ▥, count badge "12", no warning dot)
- Backgrounds (icon ◧, count badge "7", amber warning dot)
- Response Curves (icon ◠, count badge "9")
- Coding Themes (icon ◑, count badge "2")

Each row: icon + label + optional warning dot + monospace count badge. Active row gets a purple-tinted background and border.

**ASSETS section:**
- Images (icon ▢, count "9", red warning dot — format issues)
- Sounds (icon ◇, count "3")

Assets tab rows click into the Assets surface and also toggle the Images/Sounds sub-tab.

**Bottom of sidebar:**
- **Spec Annotations toggle** — "Spec annotations ON/OFF" — shows/hides the annotation overlays across all surfaces. This is the mockup's teaching mechanism.

### Issues Drawer
Slides in from the right as a 380 px overlay (z-index 40), triggered by the validation status button. Contains:
- Header: "Validation · 3 errors · 3 warnings" + close (✕).
- A build-blocked banner: "Build is blocked by 3 errors. Schema-valid JSON can still fail here — these are the checks the schema can't do."
- Three collapsible groups: Errors (red), Warnings (amber), Notices (grey).
- Each issue is a clickable card with: category label, description text, breadcrumb path, "go ↗" link that navigates to the responsible surface.
- Groups shown: Errors (3), Warnings (3), Notices (4).

---

## 2. Per-Surface Details

---

### Surface A — Borders

#### Layout
Three-column upper region, one-row lower bar:

```
┌─────────────┬──────────────────────────┬─────────────────────────┐
│ Slot list   │ UV Editor                │ Preview                 │
│ 230 px      │ (flex ~1.12)             │ (flex 1)                │
│             │                          │                         │
│             ├─── UV controls (152px) ──┤─── Box model (152px) ───┤
├─────────────┴──────────────────────────┴─────────────────────────┤
│ Overlay bar (flex ~2.2)           │ Mask bar (flex 1)            │
│ 138 px                            │                              │
└───────────────────────────────────┴──────────────────────────────┘
```

#### Slot list panel (left, 230 px)
- Header: "Border slots" + count badge "12".
- **Add slot button**: "＋ Add slot (enum)" — dashed border, opens a dropdown. Dropdown lists unused `Gui::Border` enum slot names (e.g. `Header_0`, `Footer_0`, `Slider_0`, etc.) with "UNUSED Gui::Border SLOTS" heading. Selection-from-dropdown only, no free text.
- **Selected slot card**: shows selected slot name in a purple-tinted picker button (enum dropdown), image thumbnail + filename, and a "used by N slots · [not shared / shared]" badge.
- **Slot list**: scrollable. Each row: small thumbnail square (checkerboard bg with border icon), monospace slot name, optional **shared-image badge** (⛓N in purple, e.g. ⛓3 or ⛓4), optional amber warning dot. Active row is purple-tinted.
- Shared badge is functional: border slots that share an image sheet show the count.

#### UV Editor panel (center-left)
- Header bar (42 px): "UV EDITOR" label + filename/dimensions (`scroll_window · 1024×512`) + toggle buttons row (Cuts / Center tile / Expansion / Mask — each toggleable independently).
- **Canvas area** (fills remaining height): displays the source image as actual `<img>` element filling the frame. Composited overlays (all implemented with positioned divs/SVG):
  - **Expansion ring**: amber-tinted strips around the widget-rect boundary, labeled ◀32, 20▲, 32▶, ▼20 at midpoints.
  - **Widget rect**: dashed amber border labeled "widget rect W×H".
  - **Tessellation cut lines**: purple/lavender vertical and horizontal lines at the band positions.
  - **Draggable cut handles**: 10×10 purple squares on the cut lines (cursor: ew-resize / ns-resize). These are present in the DOM but drag interaction is not wired — they're visual/static.
  - **Band-width labels**: numbers ("32", "64") between widget rect edge and cut line.
  - **Center tile indicator**: dashed amber crosshairs collapsed at center, labeled "CenterTile · collapsed".
  - **Mirrored corner marker**: "◤" green glyph at the top-left corner of the widget rect.
  - **Mask hatch**: green diagonal stripes over the widget rect (shown when Mask toggle is on).
  - **Legend bar** below canvas: "▬ tessellation cut · ▭ widget rect · expansion = chrome ring · ◤ mirrored corner".

- **UV controls bar** (152 px, below canvas, three sub-panels separated by vertical rules):
  - **TESSELLATION** (band widths · pt): 4 fields in a 2×2 grid labeled L/T/R/B. Text reads "drag cuts on canvas ↑" in purple — indicates the canvas handles are the primary control; these are synced readouts. In this mockup the fields appear as static display boxes.
  - **EXPANSION** (grows drawn quad · pt): 4 fields L/T/R/B. Text reads "drag widget rect on canvas ↑" in amber.
  - **CENTERTILE** (spine bounds): 4 fields x0/y0/x1/y1. Note "[1,1,-1,-1] → collapsed" in muted text.

#### Preview panel (center-right)
- Header bar (42 px): "PREVIEW" label + zoom controls (−/pct/+ buttons, functional — clicking actually changes zoom state and re-renders) + dimension readout (e.g. "300 × 208 pt") + toggle buttons row (Margin / Padding / MinSize / Chrome — each independently toggleable).
- **Canvas area**: checkerboard background. Contains the rendered widget at current zoom:
  - `<img>` of the source sheet scaled to fill the widget rect.
  - **Chrome bleed ring**: dashed grey border outside the layout rect, labeled "drawn quad · chrome bleed".
  - **Margin overlay**: amber-tinted ring, labeled "margin 8".
  - **Padding box**: dashed purple inner box, labeled "padding 4".
  - **MinSize floor**: dotted red box, labeled "minSize 96×72" (shown when MinSize toggle on).
  - **Resize handles** (functional): 16×16 purple square (bottom-right, cursor nwse-resize), narrow bar (right edge, ew-resize), narrow bar (bottom edge, ns-resize). Dragging any of these changes `previewW`/`previewH` state and the preview canvas redraws. This drag is wired and working.
  - Annotation note (lower-left, shown when Spec Annotations on): "Rendered widget · margin / padding / minSize. Slice grid & expansion are set in the UV editor ↖." Color-coded references to amber/purple/red.
  - **Numbered annotation pins** (1–5) over the canvas (shown when Spec Annotations on), with a legend panel (upper-right of preview region):
    - 1: Expansion / chrome bleed explanation
    - 2: Tessellation bands + draggable handles
    - 3: Center cut collapsed
    - 4: Resize handle
    - 5: One mirrored corner

- **Box model / Style controls bar** (152 px): 3 rows — Margin, Padding, MinSize — each with 4 display-box fields (LTRB or W/H). MinSize fields show "—" (dashed border, muted). Fields appear as static display; no direct editing wired.

#### Overlay / Mask bar (bottom strip, 138 px)
Spans full width below both editor panels. Two zones:
- **OVERLAY zone** (flex ~2.2): "visible artwork layer · fill behaviour per band". 4 dropdowns in a 2×2 grid labeled Edge X / Edge Y / Center X / Center Y. Each opens a pop-up menu with 5 options: STRETCH / TILE / FLEXIBLE / CENTER / SNAP. **Menus are functional** (opening/closing, selecting a mode updates state). Below the dropdowns: a live **fill-behaviour schematic** showing the current selected band's fill mode as an animated strip diagram with a description sentence. Also shows cell coordinate readout: "cells x:[4,174,858,1024] · y:[0,256,256,512]".
- **MASK zone** (flex 1): "coverage · optional". A single dropdown showing "#COPY (inherit Overlay cells)" with caret. Explanatory text below. Clicking the dropdown is not wired to open.

---

### Surface B — Backgrounds

#### Layout
Three-column: left sidebar (238 px), center main (flex 1), right inspector (320 px).

#### Left panel — table switcher + entry list
- Header: "Tables".
- **4 table tabs** as button rows: Backdrops / Lights / TexCoords / Gradients — the latter two tagged "shared" in purple. Count badges. Active tab is purple-tinted.
- Below the tabs: a divider, then a sub-header showing the active table name (e.g. "BACKDROPS") + "＋ new" button.
- **Entry list**: scrollable. Each row: 18×18 color swatch (gradient preview for Gradients, checkerboard for TexCoords), monospace entry name, optional "dead" pill (dashed border, muted), optional amber dot, optional "↗N" ref count. No separate "selected" row highlighting beyond click interaction.

#### Center panel — live preview + contextual editor
- **Live panel preview** (top, 208 px tall): "Live panel preview · shader-style composite · approximate". Shows a staged scene with radial gradient background and blobs of color, with a centered frosted-glass panel composited over it. The panel has: detail layer 0 (noise pattern), swept light gradient, frosted glass treatment. When Spec Annotations on, floating labels identify "layer0 · #HURL_NOISE", "light · gradient 'dusk'", "Frosted Glass · blur 1.0". A "▶ Play anim" button is present (not wired to animate). The preview is purely CSS/HTML, not a real shader.
- **Contextual editor** (below preview, fills remaining): switches by active table:
  - **Gradients table** → Gradient Stop Editor (see below).
  - **TexCoords table** → TexCoord Editor (see below).
  - **Backdrops or Lights** → Composite Stack (see below).

**Gradient Stop Editor:**
- Header: "GRADIENT STOP EDITOR · dusk · marks [t,[r,g,b,a]], t ascending 0..1".
- Gradient bar (46 px tall, full width): colored ramp with a checkerboard underlay for alpha. Stop handles: circles (14 px diameter) with vertical stem, positioned at their `t` value. Cursor ew-resize. Drag not wired — visual only.
- 0.0 / 1.0 axis labels below.
- **Stop list**: each stop as a row — color swatch, `t` value, hex string, `a 1.0`. "＋ add stop" link at the bottom.

**TexCoord Editor:**
- Header: "TEXCOORD EDITOR · UV transform / animation".
- **Animation scrub row**: play button (▶), progress bar with scrubber handle, time readout "0.32s". Play button not wired; scrubber not interactive here (separate from the main RC scrubber).
- **6 numeric fields** in a 2×2 grid: normalization, spinSpeed, scrollFactor, scaleFactor, rotationCenter, initialTime. Display boxes only.
- **timeFactor warning box**: amber, "▲ timeFactor pinned to 0 — nonzero values misbehave (shader int/float bug). Editor warns on any change."

**Composite Stack:**
- Header: "COMPOSITE STACK · top composites over bottom".
- For Backdrops: 3 layer rows (Detail Layer 1, Detail Layer 0, Frosted Glass) each showing a color thumbnail, layer name, and sub-description. A drag handle (⠿) is present (not wired).
- For Lights: 2 layer rows (Light sweep, TexCoord).

#### Right inspector (320 px)
Switches by active table:
- **Backdrops**: enum slot picker dropdown + Detail Layer 0 card + Detail Layer 1 card + Frosted Glass section.
  - Each detail layer card has: image picker dropdown (#HURL_NOISE or image path), texCoord picker (with ↗ go-to-def button), wrapX/wrapY dropdowns.
  - Dangling reference demo: Detail Layer 1's texCoord "scroll_fast" shown with a red border, error box inline — "Dangling reference: no TexCoord named `scroll_fast`. Build will silently drop this layer. [Create it] · [pick existing]".
  - Frosted Glass: 3 sliders (blur / zoom / opacity) + detailOpacity slider. Sliders are visual (HTML range-like with custom thumb), not interactive.
- **Lights**: enum slot picker + gradient picker (with color preview swatch and ↗ link) + optional texCoord picker + Sweep sub-section with direction [x,y], mode dropdown, scale, amplitude fields, and a radial slider.
- **TexCoords**: entry name display + timeFactor warning box + "REFERENCED BY · N consumers" list (clickable ref rows with ↗).
- **Gradients**: entry name display + "128-texel RGBA16F row · linearized at pack" note + "REFERENCED BY · N consumers" list.

---

### Surface C — Response Curves

#### Layout
Three-column: left sidebar (238 px), center main (flex 1, scrollable), right inspector (320 px).

#### Left panel
Same structural pattern as Backgrounds left panel:
- **6 table tabs**: Response Curves / Events (shared) / 1D Splines / 2D Splines / Gradients (shared) / Sound Effects. Count badges.
- Entry list with same row pattern: swatch, name, "dead" pill, warning dot, ref count.

#### Center panel — feedback preview + contextual editor
- **Feedback preview area** (top, ~250 px total):
  - Header: "FEEDBACK PREVIEW · plays on a sample widget".
  - **Sample widget**: a purple rounded-rectangle button ("Sample") rendered with a CSS transform. When scrubber moves, the button animates (translateY + scale + box-shadow glow — the `widgetStyle()` function is live, driven by scrub value). This is the one functioning animation in the mockup.
  - Label overlay: "archetype Button_0".
  - **Trigger buttons** (wrap row below widget): OnHoverBegin / OnClick / OnToggled / BaselineLoop / OnHoverEnd. Clicking one sets `playState` state and resets scrub; active trigger is highlighted purple. **Functional**.
  - **Timeline scrubber**: play button (▶, resets scrub to 0 if at 100%), progress bar + draggable thumb (functional pointer drag), time readout "0.XXs" (computed from scrub × 0.6s). **Scrubber drag is wired and functional.**

- **Contextual editor** (below preview): switches by active table:
  - **Response Curves** → Event wiring grid.
  - **Events** → Channel editor.
  - **1D or 2D Splines** → Spline editor.
  - **Gradients** → Gradient-over-time editor.
  - **Sound Effects** → Sound editor.

**Event Wiring Grid (Response Curves table active):**
- Header: "EVENT WIRING · Button_0 · state / signal → Event".
- Rows list states/signals with pickers. Three picker styles: purple (assigned), red (dangling), muted (empty/none). Each picker has a ↗ go-to-event button (greyed out when empty or dangling).
- 8 rows shown: HoveringState, ToggledState, BaselineLoop, OnHoverBegin, OnHoverEnd, OnClick (dangling — "click_pres" red), OnDoubleClick, OnToggled.
- Dangling "click_pres" shows red picker with red caret; ↗ button is greyed.

**Event Channel Editor (Events table active):**
- Header: "EVENT CHANNELS · hover_pop · channel → table ref".
- 7 channel rows: Translation (2D Spline), Rotation (1D Spline), Scaling (2D Spline), Style (1D Spline), Tint (Gradient), Font Color (Gradient), Sound Effect. Each row: channel name, target type, value picker, a small spark/fill bar (filled if assigned, empty if not).

**Spline Editor (1D or 2D Splines table active):**
- Header: "SPLINE EDITOR · ease_pop · 1D · marks [t, v], t strictly ascending".
- SVG canvas (320×130): x-axis 0..T, y-axis 0..1. Grid lines at t=0.25/0.5/0.75. Poly-line through 5 marks. **Keyframe circles** (radius 5, lavender) — cursor grab; drag not wired. **Animated playhead line** (amber dashed) driven by scrubber state. Time axis labels.
- Validation note: green box "5 marks strictly ascending in t. One-shot — clamps at last mark; state events loop."
- The playhead position updates live with the scrubber. This is functional.

**Gradient-over-time Editor (Gradients table active):**
- Same visual structure as Backgrounds gradient editor — colored bar with draggable stops (visual only), axis labels "t 0.00" / "loops".
- Note box: amber, "HDR allowed — the white stop packs at value 1.6 for a glow boost. Values may exceed 1."

**Sound Editor (Sound Effects table active):**
- Header + waveform display (48 bars of varying height), play button, filename badge in green.
- 3 range sliders: tone [0.9, 1.1], speed [0.95, 1.05], volume [0.7, 1.0]. Each shown as a range bar with two handles (min/max). Handles are visual only — not draggable.
- The range is shown as a filled segment between two thumb positions.

#### Right inspector (320 px)
Switches by active table, generated by `buildRcInspector()`:
- **Curves/archetypes**: kicker "ARCHETYPE · Response Curve enum", entry name, explanation note, inline error for dangling reference, ref list showing wired event names with ↗.
- **Events**: kicker "EVENT · shared · free-form", name, note, ref list (which Response Curves use it and in what slot).
- **Splines**: kicker "SPLINE · shared · free-form", name, ascending-validation green box, ref list.
- **Gradients**: kicker "GRADIENT · shared · free-form", name, "Separate namespace from backgrounds.json Gradients. HDR (>1) allowed" note, ref list.
- **Sounds**: kicker "SOUND EFFECT · free-form", name, format-validation green box, ref list.

---

### Surface D — Coding Themes

#### Layout
Two-column: left role list (390 px), right live sample (flex 1).

#### Left panel — palette
- Header: "Palette" + **Light/Dark toggle** (segmented button, functional — clicking switches the palette and live sample).
- Explanatory note: "~18 optional roles. Unset roles fall back to engine defaults. Alpha packs to RGB5551 — a single on/off bit, not a ramp."
- **Role list**: 18 rows in a defined order: Background / Text / Line / LineNumber / SideBar / ScrollBar / ModifiedLines / SavedLines / Error / Warnings / Comment / Keyword / Keyword_TypeModifier / Builtin_Type / Builtin_Function / Integer / String / Preprocessor.
  - **Set role row**: 24×24 colored swatch (is an `<input type="color">` — **color picker is functional**), role name, hex value, **α toggle button** (binary, functional — toggles alpha bit state, reflects RGB5551 constraint).
  - **Unset role row**: 24×24 "＋" button (checkerboard bg, dashed border), muted role name, "default" pill. Clicking ＋ enables the role with a default color. **Functional.**
  - Clicking a set role's swatch opens the native color picker and immediately updates the live sample. **Fully functional.**
  - The α button highlights when alpha is on (purple tint), shows strikethrough "α" when off.

#### Right panel — live code sample
- Header bar (42 px): "LIVE SAMPLE · [Light|Dark] · recolors as you edit · in-game text buffer" + "BufferThemes::[mode]" label.
- **Code sample** (scrollable, fills height): ~10 lines of C++ code with syntax highlighting. Each token is a `<span>` with color drawn from the current palette's role. Roles demonstrated: Preprocessor (`#include`), String (`<gui/border.h>`), Comment, Keyword (`constexpr`, `const`, `if`, `return`, `auto`), Builtin_Type (`int`, `Border`, `Image`), Integer (`25`, `3`), Builtin_Function (`makeWindow`, `slice`, `emty`), Keyword_TypeModifier (`const`).
  - **Gutter**: sidebar background, 3-px colored mark (ModifiedLines/SavedLines per line), line numbers in LineNumber color.
  - **Current-line highlight**: one line tinted with Line color.
  - **Error underline**: `emty` has a wavy underline in Warnings color (demonstrating error/warning role).
  - **Scrollbar**: rendered using ScrollBar color.
  - All colors update immediately on palette edit. **Fully functional.**
- **Annotation bar** (bottom, shown when annotations on): explains α toggle, RGB5551, gutter marks with color examples.

---

### Surface E — Assets

#### Layout
Two-column: main grid/list (flex 1), right inspector (320 px).

#### Main panel
- Header bar (48 px): **Images/Sounds tab** toggle (functional), search box (placeholder, not wired), summary "2 format issues · 1 unreferenced", "＋ Import" button.

**Images tab — grid view:**
- `auto-fill` grid, min 158 px per card.
- Each card: 96 px thumbnail area (checkerboard bg + simulated image thumbnail + format badge top-left), filename, status pill.
- Cards with errors: red tinted border and background, warning icon overlaid on thumbnail.
- **Format badge**: top-left overlay on thumbnail showing PNG/JPG/BMP/WEBP — WEBP shown in red.
- **Status pills**: "↗ N consumers" (purple), "unreferenced · won't pack" (grey dashed), "✕ WEBP rejected" (red), "✕ file not found" (red), "✕ .mp3 not allowed" (red).
- Sample data: 9 images including one WEBP (rejected), one missing-file, one unreferenced (dead), and normal PNG/JPG/BMP entries.
- Selecting a card highlights it and updates the right inspector.

**Sounds tab — list view:**
- Each row: play button (▶, not wired), waveform visualization (48 animated bars of varying height using sine function on the filename's char codes), filename, format badge, status tag.
- 3 sounds: 2 OK (OGG, WAV), 1 bad format (MP3 in red).

#### Right inspector (320 px)
Shows selected asset details:
- "ASSET" kicker + filename + format/size readout.
- Status banner (green OK / grey dead / red error with specific message).
- Explanatory note about the status (e.g. "Shared image sheet. Editing it affects every border that slices it." for a shared PNG).
- "REFERENCED BY · N" list: clickable rows showing which surface and which entry references the file, each with ↗.
- For unreferenced: "Nothing references this asset."

---

## 3. Shared Patterns

### Named-table entry pattern
Used in Backgrounds, Response Curves, and (partially) Assets. Consistent across all:
- Left panel entry row: swatch + monospace name + optional **"dead" pill** (dashed border, "unreferenced — not packed") + optional warning dot + optional **"↗N" ref count** badge.
- "＋ new" button in the sub-header.
- Right inspector for the selected entry always shows: kicker label, entry name display, optional validation box, **"REFERENCED BY · N consumers"** list. Each ref row: surface/context label › entry path + ↗ navigate link.

### Reference picker pattern
Used wherever a cross-reference field exists (texCoord on layer, gradient on light, Event on wiring, spline/gradient/sound on channel):
- Inline dropdown: content icon (swatch for gradients), monospace name, ▾ caret.
- Three visual states:
  - **Normal** (purple tint): valid reference exists.
  - **Empty** (muted): "— none —", grey caret.
  - **Dangling** (red tint): referenced name doesn't exist, red border, red name, red caret.
- Every picker has a **↗ go-to-definition button** (28×28) immediately to its right. Greyed when picker is empty or dangling.
- Dangling pickers also show an **inline error box** below them: "✕ Dangling reference: no [Type] named `name`. Build will silently drop this. [Create it] · [pick existing]". The inline action links are present but not wired.

### Validation inline presentation
- **Error boxes** (red, `rgba(231,100,97,.08)` bg, `#5a2a2a` border): "✕" icon + descriptive text + optional actionable links.
- **Warning boxes** (amber, `rgba(230,173,77,.08)` bg, `#4a3a2a` border): "▲" icon + text.
- **Success/OK boxes** (green, `rgba(92,187,133,.08)` bg): "✓" icon + text.
- These appear inline next to the offending field, not just in the Issues drawer.

### Enum picker pattern
For enum-constrained name fields (Border slots, Background/Light/RC archetype slots):
- A purple-tinted button showing the current enum value with ▾.
- "Add slot" opens a dropdown listing unused enum values under a section header. No free text entry.

### Shared-image badge (Borders only)
Entry rows that share an image sheet with other entries show a "⛓N" badge in purple. The selected slot info box shows "used by N slots · [not shared / shared]".

---

## 4. Annotations and Copy

The mockup has a **Spec Annotations toggle** (bottom of left sidebar) that shows/hides explanatory overlays. When ON:

**Borders preview**: 5 numbered pulsing dots with a floating legend panel:
1. Expansion grows the drawn quad past the layout rect; layout & hit area unchanged.
2. Tessellation bands (32/64). Handles sit on real band edges; numbers stay in sync.
3. Center cut (dashed amber) is collapsed by default CenterTile [1,1,-1,-1] — degenerate, pruned.
4. Resize handle — drag to resize the previewed panel.
5. One source corner (◤) mirrored to all others via cell_mask — never nine copies.

**Borders UV legend bottom bar**: "▬ tessellation cut · ▭ widget rect + expansion = chrome ring · ◤ mirrored corner"

**Borders preview bottom annotation**: color-coded reference to margin/padding/minSize with pointer to UV editor.

**Backgrounds live preview**: floating chip labels "layer0 · #HURL_NOISE", "light · gradient 'dusk'", "Frosted Glass · blur 1.0".

**Coding Themes**: annotation bar at bottom of code sample: "Edit a swatch on the left and the matching tokens recolor instantly. The α toggle is binary because RGB5551 stores one alpha bit. Gutter marks show SavedLines / ModifiedLines."

**Fill behaviour notes** (always visible, not annotation-gated): each fill dropdown has a tooltip title, and the active fill is shown in the schematic area in the Overlay panel. Fill descriptions are embedded in the tooltip `title` attribute.

**timeFactor warning**: always visible when a TexCoord with nonzero timeFactor is selected. Not gated by annotation toggle.

**Issues drawer copy** (notable):
- "Build is blocked by 3 errors. Schema-valid JSON can still fail here — these are the checks the schema can't do."
- Notices group explicitly calls out the engine's silent-ignore behavior: FlatGroupBox_0/1 as wrong enum format, BlendMode as unknown field, Progess_0_0 as typo — with descriptions like "silently ignored", "silently dropped".

---

## 5. Deviations and Gaps vs Brief

### Things the mockup got right or closely matched
- Four-surface + Assets structure, consistent shell.
- Slot enum dropdown (not free text) for Borders.
- Shared-image badge on border rows.
- Box-model / Tessellation / Expansion / CenterTile numeric display.
- Zoom +/- functional; preview resize functional.
- Fill-mode dropdowns with menus (functional) and schematic.
- Named-table pattern with dead-entry flag and consumer count.
- Go-to-definition ↗ buttons on all reference pickers.
- Dangling reference inline errors (correct format).
- timeFactor warning on TexCoord.
- RGB5551 1-bit alpha toggle with visual feedback.
- Live code sample updating immediately on color changes.
- Light/Dark theme toggle functional.
- Issues drawer with three severity groups, clickable navigation.
- Correct sound format list (ogg/wav/flac; rejects mp3).
- Correct image format list (png/jpg/jpeg/bmp; rejects webp).
- "dead" entries won't pack note.

### Significant gaps vs the brief

1. **UV cut handles are visual only — not draggable.** The brief explicitly requires draggable cut handles ("today columns can't be grabbed" was a design goal). The handles are rendered with the right cursor but have no pointer event handlers. The spec author must implement actual pointer drag on these.

2. **Tessellation/Expansion numeric fields are read-only display boxes — not editable inputs.** The brief says "numbers in sync" implying bidirectional. The mockup only shows canvas→number direction hinted ("drag cuts on canvas ↑"), not number→canvas.

3. **Overlay and fill controls are not linked to the UV canvas.** The canvas cuts are derived from hardcoded values, not from the LTRB fields. There is no data flow between the Overlay dropdowns and the UV cut positions.

4. **No Cells editor.** The brief describes a 5×5 cells grid with source rects `[x0,y0,x1,y1]` and negative-coord mirroring. The mockup shows cell coordinates only as a static readout (`cells x:[4,174,858,1024] · y:[0,256,256,512]`) with no interactive grid editor.

5. **Preview rendering is not engine-faithful.** The brief specifically calls out the engine's `discard` behavior for duplicate corner instances and warns the preview "must render exactly what the engine renders." The preview is an HTML `<img>` with CSS. The spec note acknowledges this: "Artwork shown is the raw sheet (reference only). Engine-accurate slice + mask lands with the WebGL2 build." This is correctly deferred but the spec author must implement the accurate 9-patch renderer from scratch.

6. **No EdgeFill/CenterFill diagram showing the selected fill per cell.** The fill schematic in the Overlay bar shows the currently selected dropdown's behavior in isolation, but not a full grid diagram showing which cell/band uses which fill. The brief implies a per-band view on the canvas itself.

7. **Backgrounds live preview is CSS approximation only.** It uses CSS blur (backdrop-filter), gradient divs, and noise CSS. The brief says "live shader-style preview." This is understandable for a mockup but the spec must define what "approximate" means and whether canvas/WebGL is required.

8. **Composite stack drag handle is visual only.** Layer reordering (⠿ grab handle) is present but not wired.

9. **Spline keyframe drag not wired.** Circles have cursor:grab but no pointer handlers. Timeline scrubber drives the playhead on the spline curve (functional), but knobs are static.

10. **Sound range-slider handles are static.** The two-handle range (for min/max randomization) is visual only.

11. **Response Curves inspector is rendered via `buildRcInspector()` but the center panel's channel-edit pickers and the wiring-grid pickers are not wired** — clicking a picker does not open a dropdown. They are static display only.

12. **No "Background Lights" per-slot enum** (brief: Lights also has a per-slot enum like Backdrops). The inspector shows a slot picker for Lights; this is present, but the mockup's entry list for Lights includes non-enum-looking names like "White" alongside "Header_0_0" — inconsistency with the brief's archetype-slot model.

13. **Assets "＋ Import" button and search field are not wired.**

14. **No mention of Tessellation unit-consistency validation** (brief: warn when mixed pt/fraction per-axis). The Issues drawer has a "Cells units" warning but it describes pixel vs fraction for cell coordinates, not exactly the brief's "per-axis unit consistency" concern.

15. **No "Comment" field for border slots.** The brief specifies `{ Image, EdgeFill, CenterFill, Cells, Comment }` for the Overlay. Comment is absent from the mockup.

16. **`#OVERLAY` mask option absent.** The brief lists `"#OVERLAY"` as a mask mode (overlay masks itself). The Mask dropdown shows `#COPY` only in the demo.

17. **No 2D Spline editor.** The brief describes 2D splines as `[t,[x,y]]`. The spline editor shown is 1D only. 2D Splines table exists in the list but clicking it shows the same 1D spline editor with no differentiation.

18. **Brief does not mention a third "Notices" severity level** in the Issues drawer. The mockup invents this for schema-valid-but-wrong-key entries. This is a useful addition the spec author should consider keeping.

---

## 6. Quality Judgment

**Follow closely:** The shared named-table pattern (dead flags, consumer counts, go-to-definition, inline dangling-ref errors) is well thought-out and consistent across all surfaces — this is the app's core value proposition and the mockup nails its visual vocabulary. The Borders surface layout (three-column with UV editor + preview + shared bar) is a sensible arrangement and worth preserving. The Issues Drawer with three severity tiers and per-issue navigation links is a genuine design contribution beyond the brief.

**Follow with modifications:** The Coding Themes surface is the strongest end-to-end implementation in the mockup — color picker integration, live sample, α toggle, and Light/Dark switch are all functional. The only adjustment needed is wiring in the "enable/disable role" interaction more clearly. The Response Curves feedback preview (animated widget, scrubber, trigger buttons) captures the intent well even though the channel pickers are static.

**Treat as filler/placeholder:** The UV editor canvas, while visually correct in structure, is a non-interactive illustration — the cut handle drag, which is the entire point, must be built from scratch. The live background preview and gradient stop drag are also visual-only, and the spec author should not assume any of these canvas interactions work. The Backgrounds composite stack and the spline editor knobs similarly need full interaction design in implementation.

**Missing and must be specified:** The Cells grid editor (5×5 source rects with negative-coord mirroring) has no representation at all in the mockup. This is likely the most complex interactive component in the Borders surface and will need independent design before implementation.
