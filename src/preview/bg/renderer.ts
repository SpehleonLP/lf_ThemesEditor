// src/preview/bg/renderer.ts
import type { Rgba } from '../../types';
import type { BgPreviewInput } from '../../bg/previewInput';
import { BG_VERT, BG_FRAG } from './shaders';
import { makeSceneCanvas } from './scene';

export interface LightUniforms {
  id: number; dir: [number, number]; radial: number; amplitude: number;
  mode: number; gradientRow: number;
}
export interface BgRenderParams {
  input: BgPreviewInput;
  layer0: { image: Rgba | null; noise: boolean } | null;
  layer1: { image: Rgba | null; noise: boolean } | null;
  wrap0: [number, number]; wrap1: [number, number];
  light0: LightUniforms | null; light1: LightUniforms | null;
  detailOpacity: number;
  glass: { blur: number; opacity: number } | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? 'compile failed'; gl.deleteShader(s); throw new Error(log);
  }
  return s;
}

export class BgPreviewRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uloc = new Map<string, WebGLUniformLocation | null>();
  private vao: WebGLVertexArrayObject;
  private bufs: WebGLBuffer[];
  private layerTex = new WeakMap<Rgba, WebGLTexture>();
  private gradTex: WebGLTexture; private gradCount = 0; private gradKey = '';
  private sceneTex: WebGLTexture;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, BG_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, BG_FRAG);
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, vs); gl.attachShader(this.prog, fs); gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) ?? 'link failed');
    const nU = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < nU; ++i) {
      const info = gl.getActiveUniform(this.prog, i); if (!info) continue;
      this.uloc.set(info.name, gl.getUniformLocation(this.prog, info.name));
    }
    gl.detachShader(this.prog, vs); gl.detachShader(this.prog, fs); gl.deleteShader(vs); gl.deleteShader(fs);
    this.vao = gl.createVertexArray()!;
    this.bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!];
    this.gradTex = gl.createTexture()!;
    this.sceneTex = this.uploadScene();
    gl.getExtension('EXT_color_buffer_float'); // for RGBA32F sampling, harmless if absent
  }

  private u(name: string): WebGLUniformLocation | null { return this.uloc.get(name) ?? null; }

  private uploadScene(): WebGLTexture {
    const gl = this.gl; const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeSceneCanvas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // key: identifies the gradient set + content revision; re-upload only when it changes.
  setGradients(rows: Float32Array[], key: string): void {
    if (key === this.gradKey) return;
    this.gradKey = key; this.gradCount = Math.max(rows.length, 1);
    const gl = this.gl;
    const data = new Float32Array(128 * this.gradCount * 4);
    rows.forEach((r, i) => data.set(r.subarray(0, 128 * 4), i * 128 * 4));
    gl.bindTexture(gl.TEXTURE_2D, this.gradTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 128, this.gradCount, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // NEAREST in V
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);  // LINEAR in U
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private texFor(img: Rgba): WebGLTexture {
    let t = this.layerTex.get(img);
    if (t) return t;
    const gl = this.gl; t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.layerTex.set(img, t);
    return t;
  }

  render(p: BgRenderParams): void {
    const gl = this.gl;
    // Build per-corner attribute arrays (4 verts, fan order TL,TR,BR,BL).
    const quad = new Float32Array(8), det = new Float32Array(16), lit = new Float32Array(16), glass = new Float32Array(8);
    p.input.corners.forEach((c, i) => {
      quad.set(c.quad, i * 2);
      det.set([...(c.detail0 ?? [0, 0]), ...(c.detail1 ?? [0, 0])], i * 4);
      lit.set([...(c.light0 ?? [0, 0]), ...(c.light1 ?? [0, 0])], i * 4);
      glass.set(c.glassUV ?? [0, 0], i * 2);
    });
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    const attr = (loc: number, data: Float32Array, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[loc]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, quad, 2); attr(1, det, 4); attr(2, lit, 4); attr(3, glass, 2);

    // textures: 0 layer0, 1 layer1, 2 scene, 3 gradients
    const bindLayer = (unit: number, layer: BgRenderParams['layer0'], onName: string, noiseName: string, samplerName: string) => {
      const on = layer && (layer.image || layer.noise) ? 1 : 0;
      gl.uniform1i(this.u(onName), on);
      gl.uniform1i(this.u(noiseName), layer?.noise ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, layer?.image ? this.texFor(layer.image) : this.gradTex);
      gl.uniform1i(this.u(samplerName), unit);
    };
    bindLayer(0, p.layer0, 'u_layer0On', 'u_layer0Noise', 'u_layer0');
    bindLayer(1, p.layer1, 'u_layer1On', 'u_layer1Noise', 'u_layer1');
    gl.activeTexture(gl.TEXTURE0 + 2); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(this.u('u_scene'), 2);
    gl.activeTexture(gl.TEXTURE0 + 3); gl.bindTexture(gl.TEXTURE_2D, this.gradTex); gl.uniform1i(this.u('u_gradients'), 3);
    gl.uniform1i(this.u('u_gradientCount'), this.gradCount);

    gl.uniform2i(this.u('u_wrap0'), p.wrap0[0], p.wrap0[1]);
    gl.uniform2i(this.u('u_wrap1'), p.wrap1[0], p.wrap1[1]);
    const setLight = (l: LightUniforms | null, idN: string, dirN: string, radN: string, ampN: string, modeN: string, gradN: string) => {
      gl.uniform1i(this.u(idN), l?.id ?? 0);
      gl.uniform2f(this.u(dirN), l?.dir[0] ?? 0, l?.dir[1] ?? 1);
      gl.uniform1f(this.u(radN), l?.radial ?? 1); gl.uniform1f(this.u(ampN), l?.amplitude ?? 1);
      gl.uniform1i(this.u(modeN), l?.mode ?? 0); gl.uniform1i(this.u(gradN), l?.gradientRow ?? 0);
    };
    setLight(p.light0, 'u_light0', 'u_lightDir0', 'u_lightRadial0', 'u_lightAmp0', 'u_lightMode0', 'u_lightGrad0');
    setLight(p.light1, 'u_light1', 'u_lightDir1', 'u_lightRadial1', 'u_lightAmp1', 'u_lightMode1', 'u_lightGrad1');
    gl.uniform1f(this.u('u_detailOpacity'), p.detailOpacity);
    gl.uniform1i(this.u('u_glassOn'), p.glass ? 1 : 0);
    gl.uniform1f(this.u('u_glassBlur'), p.glass?.blur ?? 0);
    gl.uniform1f(this.u('u_glassOpacity'), p.glass?.opacity ?? 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    for (const b of this.bufs) gl.deleteBuffer(b);
    gl.deleteTexture(this.gradTex); gl.deleteTexture(this.sceneTex); gl.deleteVertexArray(this.vao);
  }
}
