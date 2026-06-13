import { buildBandMesh } from './mesh';
import { computeBands } from '../bands';
import { fromEditorGrid, normalizeCells, quantizeUnorm16 } from '../cells';
import { FILL_VALUE, type FillMode, type Rgba, type Vec4 } from '../types';
import type { CellGrid } from '../types';
import { FRAG, VERT } from './shaders';
import { expandedSize } from './geometry';

export interface PreviewLayer {
  image: Rgba;
  cells: CellGrid;
  edgeFill: [FillMode, FillMode];
  centerFill: [FillMode, FillMode];
}

export interface PreviewInput {
  mask: PreviewLayer | null;
  overlay: PreviewLayer | null;
  tessellation: Vec4;
  centerTile: Vec4;
  panelSize: [number, number]; // pt; preview treats 1pt = 1px
  showOverlayRegion: boolean;
  maskMode: 0 | 1 | 2;        // 0 none, 1 texture, 2 overlay
  expansion: Vec4;             // [l,t,r,b] in pt; drawn quad = panelSize + expansion
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? 'shader compile failed';
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

// Split signs into flag bits + abs, then unorm16-quantize — what the GPU actually sees.
function gpuCells(cells: CellGrid, imageSize: [number, number]): { rects: Float32Array; mirror: Int32Array } {
  const norm = normalizeCells(fromEditorGrid(cells), imageSize);
  const rects = new Float32Array(25 * 4);
  const mirror = new Int32Array(25);
  for (let y = 0; y < 5; ++y)
    for (let x = 0; x < 5; ++x) {
      const r = norm[y][x];
      const i = y * 5 + x;
      mirror[i] = ((r[0] < 0 || r[2] < 0) ? 1 : 0) | ((r[1] < 0 || r[3] < 0) ? 2 : 0);
      for (let k = 0; k < 4; ++k) rects[i * 4 + k] = quantizeUnorm16(r[k]);
    }
  return { rects, mirror };
}

export class PreviewRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uloc = new Map<string, WebGLUniformLocation | null>();
  private vao: WebGLVertexArrayObject;
  private bufs: WebGLBuffer[];
  private maskTex: WebGLTexture;
  private overlayTex: WebGLTexture;
  private texFor: { mask: Rgba | null; overlay: Rgba | null } = { mask: null, overlay: null };

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.prog = gl.createProgram()!;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(this.prog, vs);
    gl.attachShader(this.prog, fs);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(this.prog) ?? 'link failed';
      gl.deleteProgram(this.prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(log);
    }
    // Cache all active uniform locations once so per-draw lookups are O(1) map reads.
    const nU = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < nU; ++i) {
      const info = gl.getActiveUniform(this.prog, i);
      if (!info) continue;
      const base = info.name.replace(/\[0\]$/, '');
      const baseLoc = gl.getUniformLocation(this.prog, info.name);
      this.uloc.set(info.name, baseLoc);
      if (base !== info.name) this.uloc.set(`${base}[0]`, baseLoc);
    }
    // Program keeps its own linked copy; detach + delete the shader objects.
    gl.detachShader(this.prog, vs);
    gl.detachShader(this.prog, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.vao = gl.createVertexArray()!;
    this.bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!];
    this.maskTex = this.makeTex();
    this.overlayTex = this.makeTex();
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    for (const b of this.bufs) gl.deleteBuffer(b);
    gl.deleteTexture(this.maskTex);
    gl.deleteTexture(this.overlayTex);
    gl.deleteVertexArray(this.vao);
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private upload(tex: WebGLTexture, img: Rgba): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // pixels are data
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);            // row 0 = top, like the engine
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
  }

  render(input: PreviewInput): void {
    const gl = this.gl;
    const drawn = expandedSize(input.panelSize, input.expansion);
    const bands = computeBands(input.tessellation, input.centerTile, drawn);
    const mesh = buildBandMesh(bands);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    const attrs: [number, Float32Array][] = [[0, mesh.positions], [1, mesh.cells], [2, mesh.adjust]];
    for (const [loc, data] of attrs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[loc]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufs[3]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);

    const u = (name: string): WebGLUniformLocation | null => {
      if (this.uloc.has(name)) return this.uloc.get(name) ?? null;
      const loc = gl.getUniformLocation(this.prog, name); // tolerate array-element names not enumerated
      this.uloc.set(name, loc);
      console.assert(loc !== null, `preview: uniform "${name}" not found after clean link`);
      return loc;
    };
    const setOverlayLayer = (layer: PreviewLayer | null, tex: WebGLTexture, unit: number) => {
      gl.uniform1i(u('u_hasOverlay'), layer ? 1 : 0);
      if (!layer) return;
      if (this.texFor['overlay'] !== layer.image) {
        this.upload(tex, layer.image);
        this.texFor['overlay'] = layer.image;
      }
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u('u_overlayTex'), unit);
      const { rects, mirror } = gpuCells(layer.cells, [layer.image.width, layer.image.height]);
      gl.uniform4fv(u('u_overlayCells[0]'), rects);
      gl.uniform1iv(u('u_overlayMirror[0]'), mirror);
      gl.uniform4i(u('u_overlayFill'),
        FILL_VALUE[layer.edgeFill[0]], FILL_VALUE[layer.edgeFill[1]],
        FILL_VALUE[layer.centerFill[0]], FILL_VALUE[layer.centerFill[1]]);
      gl.uniform2f(u('u_overlayTexSize'), layer.image.width, layer.image.height);
    };

    // maskMode: 0=none, 1=texture (upload mask layer), 2=overlay (mask=(0,1), no texture needed)
    const maskMode = input.maskMode === 1 && !input.mask ? 0 : input.maskMode;
    gl.uniform1i(u('u_maskMode'), maskMode);
    if (maskMode === 1 && input.mask) {
      const layer = input.mask;
      if (this.texFor['mask'] !== layer.image) {
        this.upload(this.maskTex, layer.image);
        this.texFor['mask'] = layer.image;
      }
      gl.activeTexture(gl.TEXTURE0 + 0);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.uniform1i(u('u_maskTex'), 0);
      const { rects, mirror } = gpuCells(layer.cells, [layer.image.width, layer.image.height]);
      gl.uniform4fv(u('u_maskCells[0]'), rects);
      gl.uniform1iv(u('u_maskMirror[0]'), mirror);
      gl.uniform4i(u('u_maskFill'),
        FILL_VALUE[layer.edgeFill[0]], FILL_VALUE[layer.edgeFill[1]],
        FILL_VALUE[layer.centerFill[0]], FILL_VALUE[layer.centerFill[1]]);
      gl.uniform2f(u('u_maskTexSize'), layer.image.width, layer.image.height);
    }
    setOverlayLayer(input.overlay, this.overlayTex, 1);

    gl.uniform2f(u('u_panelSize'), drawn[0], drawn[1]);
    gl.uniform4f(u('u_positionsX'), bands.positionsX[1], bands.positionsX[2], bands.positionsX[3], bands.positionsX[4]);
    gl.uniform4f(u('u_positionsY'), bands.positionsY[1], bands.positionsY[2], bands.positionsY[3], bands.positionsY[4]);
    gl.uniform4f(u('u_content'), 0.35, 0.35, 0.4, 0.85);
    gl.uniform1i(u('u_showOverlayRegion'), input.showOverlayRegion ? 1 : 0);

    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }
}
