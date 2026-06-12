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
