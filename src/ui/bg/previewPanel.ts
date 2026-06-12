// src/ui/bg/previewPanel.ts
import { bgState, bgNotify, setPairing } from '../../bg/state';
import { BgPreviewRenderer, type LightUniforms } from '../../preview/bg/renderer';
import { buildBgPreviewInput, type BgScene, type SceneLayer } from '../../bg/previewInput';
import { bakeGradient, type Mark } from '../../bg/gradients';
import { readLayers, glassEnabled } from '../../bg/backdropModel';
import { resolveLightTexCoord } from '../../bg/lightInput';
import { allLightNames } from '../../package/slotNames';
import { loadImage } from '../../images';
import type { TexCoordEntry } from '../../bg/texcoord';
import type { Rgba } from '../../types';
import type { BgPreviewDeps } from './types';

const WRAP_INT: Record<string, number> = { REPEAT: 0, MIRRORED_REPEAT: 1, CLAMP_TO_EDGE: 2, CLAMP_TO_BORDER: 3 };
const MODE_INT: Record<string, number> = { None: 0, FADE: 1, SAW: 2, SINE: 3, TRIANGLE: 4 };

let _host: HTMLElement | null = null; let _deps: BgPreviewDeps | null = null;
let renderer: BgPreviewRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let panelW = 240, panelH = 140;
let raf = 0;
const imgCache = new Map<string, Rgba | null>();
let gradOrder: string[] = []; // gradient name → atlas row index

function ensureImage(path: string | null): Rgba | null {
  if (!path || path === '#HURL_NOISE') return null;
  if (imgCache.has(path)) return imgCache.get(path)!;
  imgCache.set(path, null);
  loadImage(path).then((img) => { imgCache.set(path, img); }).catch(() => imgCache.set(path, null));
  return null;
}

let gradKey = '';
let gradRows: Float32Array[] = [];

function rebuildGradients(): void {
  const grads = _deps!.file.root.Gradients ?? {};
  const order = Object.keys(grads);
  // gradientRev covers stop edits; the name list covers add/delete/rename (row indices shift).
  const key = `${bgState.gradientRev}|${order.join(' ')}`;
  if (key !== gradKey) {
    gradKey = key;
    gradOrder = order;
    gradRows = order.map((n) => bakeGradient(Array.isArray(grads[n]) ? grads[n] : []));
  }
  renderer!.setGradients(gradRows.length ? gradRows : [new Float32Array(128 * 4).fill(1)], gradKey);
}

function lightUniforms(name: string, layerTexCoord: string | undefined, tcs: Record<string, TexCoordEntry>): LightUniforms | null {
  if (!name || name === 'White') return { id: 0, dir: [0, 1], radial: 1, amplitude: 1, mode: 0, gradientRow: 0 };
  const entry = _deps!.file.root.Lights?.[name]; if (!entry) return null;
  const id = Math.max(1, allLightNames().indexOf(name));
  const gradName = entry.gradient; const gradientRow = Math.max(0, gradOrder.indexOf(gradName));
  void resolveLightTexCoord(entry, { texCoord: layerTexCoord }); void tcs; // texcoord sweep handled in previewInput via layer.texCoord
  const dir = Array.isArray(entry.direction) ? entry.direction : [0, 1];
  return {
    id, dir: [dir[0], dir[1]], radial: typeof entry.radial === 'number' ? entry.radial : 1,
    amplitude: typeof entry.amplitude === 'number' ? entry.amplitude : 1,
    mode: MODE_INT[entry.mode] ?? 0, gradientRow,
  };
}

function frame(): void {
  if (!renderer || !canvas || !_deps) return;
  const slot = bgState.selected.backdrops || Object.keys(_deps.file.root.Backgrounds ?? {})[0];
  const entry = slot ? _deps.file.root.Backgrounds?.[slot] : null;
  rebuildGradients();
  const now = bgState.playing ? (performance.now() & 0x7FFFFF) * 1e-3 : bgState.scrubSeconds;
  const tcs: Record<string, TexCoordEntry> = _deps.file.root.TexCoords ?? {};

  let params;
  if (entry) {
    const [m0, m1] = readLayers(entry);
    const pair = bgState.pairing[slot!] ?? ['White', ''];
    const img0 = ensureImage(m0.image), img1 = ensureImage(m1.image);
    const layer = (m: typeof m0, img: Rgba | null): SceneLayer => ({
      enabled: m.enabled, image: m.image, imageSize: img ? [img.width, img.height] : [1, 1],
      texCoord: m.texCoord, wrapX: m.wrapX, wrapY: m.wrapY, light: { id: 1 },
    });
    const scene: BgScene = { panelSize: [panelW, panelH], now, texcoords: tcs, layers: [layer(m0, img0), layer(m1, img1)], glass: glassEnabled(entry) ? { blur: entry['Frosted Glass'].blur ?? 0, zoom: entry['Frosted Glass'].zoom ?? 1, opacity: entry['Frosted Glass'].opacity ?? 0 } : null };
    params = {
      input: buildBgPreviewInput(scene),
      layer0: { image: img0, noise: m0.image === '#HURL_NOISE' }, layer1: { image: img1, noise: m1.image === '#HURL_NOISE' },
      wrap0: [WRAP_INT[m0.wrapX], WRAP_INT[m0.wrapY]] as [number, number],
      wrap1: [WRAP_INT[m1.wrapX], WRAP_INT[m1.wrapY]] as [number, number],
      light0: lightUniforms(pair[0], m0.texCoord, tcs), light1: lightUniforms(pair[1], m1.texCoord, tcs),
      detailOpacity: typeof entry.detailOpacity === 'number' ? entry.detailOpacity : 1,
      glass: scene.glass ? { blur: scene.glass.blur, opacity: scene.glass.opacity } : null,
    };
  } else {
    params = { input: buildBgPreviewInput({ panelSize: [panelW, panelH], now, texcoords: tcs, layers: [{ enabled: false }, { enabled: false }] as any, glass: null }), layer0: null, layer1: null, wrap0: [0, 0] as [number, number], wrap1: [0, 0] as [number, number], light0: null, light1: null, detailOpacity: 1, glass: null };
  }
  renderer.render(params);
  if (bgState.playing) raf = requestAnimationFrame(frame);
}

export function mountBgPreview(host: HTMLElement, deps: BgPreviewDeps): void {
  _host = host; _deps = deps; host.replaceChildren(); host.className = 'bg-preview-panel';
  host.innerHTML = `
    <div class="bg-pv-controls">
      <label>Slot: <select data-pv="slot"></select></label>
      <label>L0: <select data-pv="l0"></select></label>
      <label>L1: <select data-pv="l1"></select></label>
      <label>W <input type="number" data-pv="w" value="${panelW}" style="width:64px"></label>
      <label>H <input type="number" data-pv="h" value="${panelH}" style="width:64px"></label>
      <button data-pv="play">⏸</button>
      <input type="range" min="0" max="10" step="0.01" data-pv="scrub" disabled>
    </div>
    <canvas data-pv="canvas" width="360" height="220" class="bg-pv-canvas"></canvas>`;
  canvas = host.querySelector('[data-pv="canvas"]')!;
  try { renderer = new BgPreviewRenderer(canvas); } catch (e) { host.innerHTML = `<div class="bg-note">WebGL2 unavailable: ${String(e)}</div>`; return; }

  host.querySelector('[data-pv="w"]')!.addEventListener('change', (e) => { panelW = Number((e.target as HTMLInputElement).value) || panelW; });
  host.querySelector('[data-pv="h"]')!.addEventListener('change', (e) => { panelH = Number((e.target as HTMLInputElement).value) || panelH; });
  host.querySelector('[data-pv="slot"]')!.addEventListener('change', (e) => { bgState.selected.backdrops = (e.target as HTMLSelectElement).value; bgNotify(); });
  host.querySelector('[data-pv="l0"]')!.addEventListener('change', (e) => { const slot = bgState.selected.backdrops; if (slot) setPairing(slot, (e.target as HTMLSelectElement).value, bgState.pairing[slot]?.[1] ?? ''); });
  host.querySelector('[data-pv="l1"]')!.addEventListener('change', (e) => { const slot = bgState.selected.backdrops; if (slot) setPairing(slot, bgState.pairing[slot]?.[0] ?? 'White', (e.target as HTMLSelectElement).value); });
  const playBtn = host.querySelector<HTMLButtonElement>('[data-pv="play"]')!;
  const scrub = host.querySelector<HTMLInputElement>('[data-pv="scrub"]')!;
  playBtn.addEventListener('click', () => {
    bgState.playing = !bgState.playing; playBtn.textContent = bgState.playing ? '⏸' : '▶'; scrub.disabled = bgState.playing;
    if (bgState.playing) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); frame(); }
  });
  scrub.addEventListener('input', () => { bgState.scrubSeconds = Number(scrub.value); if (!bgState.playing) frame(); });

  raf = requestAnimationFrame(frame);
  updateBgPreview();
}

export function updateBgPreview(): void {
  if (!_host || !_deps || !renderer) return;
  const slots = Object.keys(_deps.file.root.Backgrounds ?? {});
  const lights = ['White', '', ...Object.keys(_deps.file.root.Lights ?? {}).filter((n) => n !== 'White')];
  const fill = (sel: string, opts: string[], val: string) => {
    const el = _host!.querySelector<HTMLSelectElement>(sel); if (!el || el === document.activeElement) return;
    el.innerHTML = opts.map((o) => `<option value="${o}">${o || '(none)'}</option>`).join(''); el.value = val;
  };
  const slot = bgState.selected.backdrops || slots[0] || '';
  fill('[data-pv="slot"]', slots, slot);
  const pair = bgState.pairing[slot] ?? ['White', ''];
  fill('[data-pv="l0"]', lights, pair[0]); fill('[data-pv="l1"]', lights, pair[1]);
  if (!bgState.playing) frame(); // static refresh while paused so edits show
}
