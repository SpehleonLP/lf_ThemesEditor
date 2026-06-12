// src/preview/bg/scene.ts
// Procedural backdrop scene (radial gradient + soft color blobs). Returns a 256x256 RGBA canvas
// the renderer uploads with mipmaps; textureLod(blur) reads a coarser mip as faux frosted glass.
export function makeSceneCanvas(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, '#3a4a6a'); g.addColorStop(1, '#10131c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const blob = (x: number, y: number, r: number, color: string) => {
    const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, color); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  blob(size * 0.25, size * 0.30, size * 0.30, 'rgba(120,90,200,0.55)');
  blob(size * 0.75, size * 0.65, size * 0.35, 'rgba(80,160,170,0.50)');
  blob(size * 0.60, size * 0.20, size * 0.20, 'rgba(200,120,90,0.45)');
  return c;
}
