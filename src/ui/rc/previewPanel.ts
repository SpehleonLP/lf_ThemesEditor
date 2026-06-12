// src/ui/rc/previewPanel.ts
import { rcState, setTransport } from '../../rc/state';
import { CHANNELS, CHANNEL_KEYS, fold, type ChannelKey } from '../../rc/channels';
import { sampleSpline, durationOf, type AnyMark } from '../../rc/spline';
import type { RcPreviewDeps } from './types';

let host: HTMLElement | null = null, deps: RcPreviewDeps | null = null;
let canvas: HTMLCanvasElement | null = null;
let raf = 0, startMs = 0;

// Resolve the current trigger to a map of channel → marks (from an Event), or a single spline/gradient.
function resolveChannels(): Partial<Record<ChannelKey, AnyMark[]>> {
  const t = rcState.trigger; if (!t || !deps) return {};
  const root = deps.file.root;
  if (t.kind === 'event') {
    const ev = root['Events']?.[t.name]; if (!ev) return {};
    const out: Partial<Record<ChannelKey, AnyMark[]>> = {};
    for (const key of CHANNEL_KEYS) {
      if (key === 'Sound Effect') continue;
      const ref = ev[key]; if (!ref) continue;
      const marks = root[CHANNELS[key].table]?.[ref];
      if (Array.isArray(marks)) out[key] = marks as AnyMark[];
    }
    return out;
  }
  // single spline/gradient applied to its natural channel
  const map: Record<string, ChannelKey> = { spline1d: 'Rotation', spline2d: 'Translation', gradient: 'Tint' };
  const key = map[t.kind]; const table = CHANNELS[key].table;
  const marks = root[table]?.[t.name];
  return Array.isArray(marks) ? { [key]: marks as AnyMark[] } : {};
}

function totalDuration(channels: Partial<Record<ChannelKey, AnyMark[]>>): number {
  let d = 0; for (const k of Object.keys(channels) as ChannelKey[]) d = Math.max(d, durationOf(channels[k]!));
  return d;
}

function frame(): void {
  if (!canvas || !deps) return;
  const ctx = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e0e13'; ctx.fillRect(0, 0, W, H);

  const channels = resolveChannels();
  const dur = totalDuration(channels);
  const t = rcState.playing ? (dur > 0 ? ((performance.now() - startMs) / 1000) : 0) : rcState.scrubSeconds;
  const loop = rcState.loop;

  // fold channels onto identities
  let translation = [0, 0], scaling = [1, 1], rotation = [0], tint = [1, 1, 1, 1], style = [0], fontColor = [0, 0, 0, 0];
  const sampleInto = (key: ChannelKey) => {
    const marks = channels[key]; if (!marks) return null;
    return sampleSpline(marks, CHANNELS[key].dim, t, loop);
  };
  let v: number[] | null;
  if ((v = sampleInto('Translation'))) translation = fold('add', translation, v);
  if ((v = sampleInto('Scaling'))) scaling = fold('multiply', scaling, v);
  if ((v = sampleInto('Rotation'))) rotation = fold('add', rotation, v);
  if ((v = sampleInto('Style'))) style = fold('add', style, v);
  if ((v = sampleInto('Tint'))) tint = fold('multiply', tint, v);
  if ((v = sampleInto('Font Color'))) fontColor = fold('add', fontColor, v);
  void style;

  // draw the widget under the matrix (scale → rotate → translate, translation in points)
  ctx.save();
  ctx.translate(W / 2 + translation[0], H / 2 + translation[1]);
  ctx.rotate(rotation[0]);
  ctx.scale(scaling[0], scaling[1]);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  ctx.fillStyle = `rgba(${clamp01(tint[0]) * 200 + 30},${clamp01(tint[1]) * 200 + 30},${clamp01(tint[2]) * 200 + 30},${clamp01(tint[3])})`;
  const w = 120, h = 60, r = 10;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.fillStyle = `rgba(${clamp01(fontColor[0]) * 255},${clamp01(fontColor[1]) * 255},${clamp01(fontColor[2]) * 255},${1})`;
  ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Widget', 0, 0);
  ctx.restore();

  // transport reflects current time
  const slider = host!.querySelector<HTMLInputElement>('[data-t="scrub"]');
  if (slider && document.activeElement !== slider) { slider.max = String(dur || 1); if (rcState.playing) slider.value = String(loop && dur > 0 ? t % dur : Math.min(t, dur)); }

  if (rcState.playing) raf = requestAnimationFrame(frame);
}

export function mountRcPreview(h: HTMLElement, d: RcPreviewDeps): void {
  host = h; deps = d; h.replaceChildren(); h.className = 'rc-preview';
  h.innerHTML = `
    <canvas data-c="stage" width="320" height="220" class="rc-pv-canvas"></canvas>
    <div class="rc-transport">
      <button data-t="play">▶</button>
      <input type="range" min="0" max="1" step="0.01" value="0" data-t="scrub" style="flex:1">
      <label><input type="checkbox" data-t="loop" checked> loop</label>
    </div>`;
  canvas = h.querySelector('[data-c="stage"]')!;
  const play = h.querySelector<HTMLButtonElement>('[data-t="play"]')!;
  play.addEventListener('click', () => {
    const next = !rcState.playing;
    if (next) startMs = performance.now() - rcState.scrubSeconds * 1000;
    setTransport({ playing: next });
  });
  h.querySelector<HTMLInputElement>('[data-t="scrub"]')!.addEventListener('input', (e) => {
    setTransport({ playing: false, scrubSeconds: Number((e.target as HTMLInputElement).value) });
  });
  h.querySelector<HTMLInputElement>('[data-t="loop"]')!.addEventListener('change', (e) => {
    setTransport({ loop: (e.target as HTMLInputElement).checked });
  });
  updateRcPreview();
}

export function updateRcPreview(): void {
  if (!host) return;
  const play = host.querySelector<HTMLButtonElement>('[data-t="play"]'); if (play) play.textContent = rcState.playing ? '⏸' : '▶';
  cancelAnimationFrame(raf);
  if (rcState.playing) { if (!startMs) startMs = performance.now(); raf = requestAnimationFrame(frame); }
  else frame(); // single static draw at scrubSeconds
}
