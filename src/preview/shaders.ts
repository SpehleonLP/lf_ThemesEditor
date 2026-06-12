export const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_cell;
layout(location=2) in vec2 a_adjust;
out vec2 v_cell;
out vec2 v_adjust;
void main() {
  v_cell = a_cell;
  v_adjust = a_adjust;
  vec2 ndc = a_pos * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

// Border path of gui_panel.frag + adjust() from gui_panel_support.h.glsl.
// Deliberate divergences (documented in the spec):
//  - cell index clamped to 4 (engine clamps to 5 and reads out of bounds on exact far-edge fragments);
//  - the mask.g "overlay" region renders as a tint toggle instead of the engine's separate overlay pass;
//  - detail/light/glass content behind the border is a flat u_content color.
//  - u_maskMode: 0=none→mask(1,0), 1=texture, 2=#OVERLAY→mask(0,1) (replaces old u_hasMask bool).
export const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_maskTex;
uniform sampler2D u_overlayTex;
uniform int u_maskMode; // 0 none, 1 texture, 2 overlay
uniform bool u_hasOverlay;
uniform vec4 u_maskCells[25];    // |normalized| rects, unorm16-quantized
uniform vec4 u_overlayCells[25];
uniform int  u_maskMirror[25];   // bit0 flip x, bit1 flip y (cpp:1414-1417 → frag:143-147)
uniform int  u_overlayMirror[25];
uniform ivec4 u_maskFill;        // (edgeX, edgeY, centerX, centerY) as PatchFillType ints
uniform ivec4 u_overlayFill;
uniform vec2 u_maskTexSize;      // source image size in pt (1pt = 1px in preview)
uniform vec2 u_overlayTexSize;
uniform vec2 u_panelSize;        // pt
uniform vec4 u_positionsX;       // inner band positions [1..4] (frag:71)
uniform vec4 u_positionsY;
uniform vec4 u_content;          // stand-in for the detail layer
uniform bool u_showOverlayRegion;

in vec2 v_cell;
in vec2 v_adjust;
out vec4 fragColor;

// gui_panel_support.h.glsl:19-42 (TILE=2, STRETCH_TILE/FLEXIBLE=4, CENTER=5)
float adjust(float uv, int mode, float texWidth, float widthPt) {
  if (texWidth != 0.0) {
    if (mode == 2) uv = mod(uv * widthPt, texWidth) / texWidth;
    else if (mode == 4) { float reps = floor(widthPt / texWidth) + 1.0; uv = fract(uv * reps); }
    else if (mode == 5) { uv = uv * 2.0 - 1.0; uv = uv * uv; uv = (uv + 1.0) / 2.0; }
  }
  return clamp(uv, 0.0, 1.0);
}

// gui_panel.frag:69-81
vec2 cellSizePt(ivec2 cell) {
  float px[6]; float py[6];
  px[0] = 0.0; px[1] = u_positionsX.x; px[2] = u_positionsX.y; px[3] = u_positionsX.z; px[4] = u_positionsX.w; px[5] = 1.0;
  py[0] = 0.0; py[1] = u_positionsY.x; py[2] = u_positionsY.y; py[3] = u_positionsY.z; py[4] = u_positionsY.w; py[5] = 1.0;
  vec2 lo = vec2(px[cell.x], py[cell.y]);
  vec2 hi = vec2(px[cell.x + 1], py[cell.y + 1]);
  return (hi - lo) * u_panelSize;
}

// gui_panel.frag:83-150 with the cells SSBO replaced by uniforms
vec2 layerCoords(vec4 rampUV, int cellMask, ivec4 fills, vec2 texSizeIn,
                 vec2 coords, bool centerX, bool centerY, vec2 cellPt) {
  int stretchX = !centerX ? 0 : (centerY ? fills.z : fills.x);
  int stretchY = !centerY ? 0 : (centerX ? fills.w : fills.y);
  float dp = (rampUV.z - rampUV.x) * (rampUV.w - rampUV.y);
  vec2 texSize = dp < 0.0 ? texSizeIn.yx : texSizeIn;
  texSize *= vec2(abs(rampUV.z - rampUV.x), abs(rampUV.w - rampUV.y));
  vec2 uv = vec2(adjust(coords.x, stretchX, texSize.x, cellPt.x),
                 adjust(coords.y, stretchY, texSize.y, cellPt.y));
  if (dp < 0.0) uv = vec2(uv.y, 1.0 - uv.x);
  if ((cellMask & 1) != 0) uv.x = 1.0 - uv.x;
  if ((cellMask & 2) != 0) uv.y = 1.0 - uv.y;
  return clamp(mix(rampUV.xy, rampUV.zw, uv), vec2(1e-4), vec2(1.0 - 1e-4));
}

// gui_panel.frag:228-237
vec4 overlayBlend(vec4 src, vec4 dst) {
  dst.rgb = dst.rgb * dst.a;
  return vec4(mix(2.0 * src.rgb * dst.rgb,
                  1.0 - 2.0 * (1.0 - src.rgb) * (1.0 - dst.rgb),
                  step(vec3(0.5), src.rgb)),
              src.a);
}

void main() {
  ivec2 cell = ivec2(min(floor(v_cell), vec2(4.0)));
  vec2 coords = fract(v_cell);
  bool centerX = (cell.x == 1 || cell.x == 3);
  bool centerY = (cell.y == 1 || cell.y == 3);

  // edge-cell coordinate compression (frag:99-109)
  coords.x = cell.x == 0 ? coords.x * v_adjust.x
           : !centerX ? 1.0 - (1.0 - coords.x) * v_adjust.x : coords.x;
  coords.y = cell.y == 0 ? coords.y * v_adjust.y
           : !centerY ? 1.0 - (1.0 - coords.y) * v_adjust.y : coords.y;

  int idx = cell.y * 5 + cell.x;
  vec2 cellPt = cellSizePt(cell);

  // SampleBorder (frag:152-184): defaults mask=(1,0), overlay=0
  // u_maskMode: 0 none -> mask=(1,0); 1 texture; 2 overlay -> mask=(0,1)
  vec2 mask = vec2(1.0, 0.0);
  if (u_maskMode == 1) {
    vec2 mc = layerCoords(u_maskCells[idx], u_maskMirror[idx], u_maskFill, u_maskTexSize, coords, centerX, centerY, cellPt);
    vec2 mg = texture(u_maskTex, mc).rg;
    mask = vec2(smoothstep(0.48, 0.52, mg.r), 1.0 - mg.g);
  } else if (u_maskMode == 2) {
    mask = vec2(0.0, 1.0); // overlay masks itself
  }
  vec4 border = vec4(0.0);
  if (u_hasOverlay) {
    vec2 oc = layerCoords(u_overlayCells[idx], u_overlayMirror[idx], u_overlayFill, u_overlayTexSize, coords, centerX, centerY, cellPt);
    border = texture(u_overlayTex, oc);
  }

  // Compose: MODE_OPAQUE-ish single pass (frag:347-408)
  vec4 result;
  if (mask.r == 0.0) {
    if (border.a <= 0.04) discard;
    border.a *= 1.0 - mask.g;
    result = border;
  } else {
    vec4 detail = vec4(u_content.rgb, u_content.a * mask.r);
    if (mask.g == 0.0) {
      result = vec4(mix(detail.rgb, border.rgb, border.a),
                    detail.a + border.a * (1.0 - detail.a));
    } else {
      vec4 overlayed = overlayBlend(detail, border);
      border.a *= (1.0 - mask.g);
      result = vec4(mix(overlayed.rgb, border.rgb, border.a * (1.0 - overlayed.a)),
                    overlayed.a + border.a * (1.0 - overlayed.a));
    }
  }
  if (u_showOverlayRegion && mask.g > 0.0)
    result.rgb = mix(result.rgb, vec3(1.0, 0.2, 1.0), 0.4 * mask.g);
  if (result.a < 0.04) discard;
  fragColor = result;
}`;
