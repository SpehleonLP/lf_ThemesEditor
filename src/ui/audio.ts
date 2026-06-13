// One-at-a-time asset audio player. Tone/speed/volume mirror the engine's per-play
// randomization within the authored range (gui_themepackage.cpp sound trigger):
// pitch = 2^random(tone), speed = random(speed), volume = random(volume). The engine
// keeps speed (a playback-rate multiplier) and tone (a pitch factor) separate; the
// browser's playbackRate conflates speed+pitch, so we fold both into playbackRate
// (preservesPitch=false) — close enough for preview.
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
let current: HTMLAudioElement | null = null;

export interface SoundRanges { tone?: [number, number]; speed?: [number, number]; volume?: [number, number] }

export function playAsset(path: string, ranges: SoundRanges = {}): void {
  stopAudio();
  const a = new Audio(`/api/file?path=${encodeURIComponent(path)}`);
  let rate = 1, varies = false;
  if (Array.isArray(ranges.tone)) { rate *= Math.pow(2, rand(ranges.tone[0], ranges.tone[1])); varies = true; }
  if (Array.isArray(ranges.speed)) { rate *= rand(ranges.speed[0], ranges.speed[1]); varies = true; }
  if (varies) {
    a.preservesPitch = false;
    a.playbackRate = Math.min(4, Math.max(0.25, rate));
  }
  if (Array.isArray(ranges.volume)) a.volume = Math.max(0, Math.min(1, rand(ranges.volume[0], ranges.volume[1])));
  a.addEventListener('ended', () => { if (current === a) current = null; });
  a.play().catch((e) => console.warn(`audio ${path}:`, e));
  current = a;
}

export function stopAudio(): void {
  if (current) { current.pause(); current = null; }
}
