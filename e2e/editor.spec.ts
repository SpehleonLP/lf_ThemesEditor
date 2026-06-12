// e2e/editor.spec.ts
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SRC = '/mnt/Passport/Lifaundi/Gui';

let proc: ChildProcess;
let root: string;

// Stage a write-isolated mirror of the Gui package. The app only ever SAVES the small top-level
// .json config files; everything else (images/psds/etc., ~212MB) is read-only. A full recursive
// byte-copy off the FUSE mount blows past any sane timeout, so instead we recreate the directory
// tree with real dirs (so /api/list's isDirectory() still reports them correctly), COPY the tiny
// .json files (saves land here, never on the live package), and SYMLINK every other file (zero-copy
// read-through to the originals). server.js's jail is purely lexical, so it follows the symlinks.
async function stageGuiMirror(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const e of await readdir(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) await stageGuiMirror(from, to);
    else if (e.isFile() && e.name.endsWith('.json')) await cp(from, to);
    else await symlink(from, to);
  }
}

test.beforeAll(async () => {
  test.setTimeout(120_000); // metadata-only walk; fast even on FUSE, but leave headroom
  root = await mkdtemp(path.join(tmpdir(), 'gui-e2e-'));
  await stageGuiMirror(SRC, root);
  proc = spawn('node', ['server.js', root], { env: { ...process.env, PORT: '8137' } });
  proc.stderr?.on('data', (d) => console.error('[server]', String(d)));
  await new Promise((r) => proc.stdout!.once('data', r));
});
test.afterAll(async () => {
  proc?.kill();
  // The mirror is symlinks + tiny json copies; removing it never touches the live package.
  if (root) await rm(root, { recursive: true, force: true }).catch(() => {});
});

test('shell loads, nav switches surfaces, drawer opens', async ({ page }) => {
  await page.goto('/'); // server serves dist/ — requires `npm run build` first
  // Borders surface is active by default.
  await expect(page.locator('.borders-surface')).toBeVisible();

  // Switch to Response Curves.
  await page.locator('.nav-row[data-surface="responseCurves"]').click();
  await expect(page.locator('.ro-surface')).toBeVisible();
  // The Events table lists at least one entry from the live data.
  await expect(page.locator('.tl-row').first()).toBeVisible();

  // Open the Issues drawer via the toolbar status button.
  await page.locator('.tb-status').click();
  await expect(page.locator('.drawer-head')).toContainText('Validation');

  // Switch to Assets and confirm a format badge renders.
  await page.locator('.nav-row[data-surface="assets"]').click();
  await expect(page.locator('.as-grid')).toBeVisible();
});

test('coding themes: toggle, enable a role, live sample recolors', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-row[data-surface="codingThemes"]').click();
  await expect(page.locator('.ct-palette')).toBeVisible();
  await expect(page.locator('.ct-code .ct-line').first()).toBeVisible();

  // Light/Dark toggle flips the active theme.
  await page.locator('.ct-seg-btn[data-theme="Dark"]').click();
  await expect(page.locator('.ct-seg-btn[data-theme="Dark"]')).toHaveClass(/ct-seg-on/);
  await page.locator('.ct-seg-btn[data-theme="Light"]').click();
  await expect(page.locator('.ct-seg-btn[data-theme="Light"]')).toHaveClass(/ct-seg-on/);

  // The shipping Light theme has no roles set, so Keyword starts unset (＋). Enable it.
  const kwRow = page.locator('.ct-row[data-role="Keyword"]');
  const addBtn = kwRow.locator('.ct-add');
  if (await addBtn.count()) await addBtn.click();
  const swatch = kwRow.locator('.ct-swatch');
  await expect(swatch).toBeVisible();

  // Setting the swatch updates the live sample's --ct-Keyword variable immediately.
  await swatch.evaluate((el) => {
    (el as HTMLInputElement).value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const kwVar = await page.locator('.ct-pane').evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--ct-Keyword'));
  expect(kwVar.replace(/\s/g, '')).toContain('255,0,0');

  // The edit marks the package dirty -> global Save enables.
  await expect(page.locator('.tb-btn', { hasText: 'Save' })).toBeEnabled();
});

test('borders: dragging the Expansion ring edge edits the field + dirties; wheel-zoom does not', async ({ page }) => {
  // The borders surface is a 3-column grid (slots | cells | preview); give it room so the
  // rightmost preview stage is fully on-screen and mouse events land on the overlay canvas.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('.borders-surface')).toBeVisible();

  // Select Window_0 (has Expansion [32,20,32,20] in the live borders.json).
  await page.locator('.bs-slots div', { hasText: /^Window_0$/ }).click();

  const expR = page.locator('input[data-edge="Expansion"][data-i="2"]');
  await expect(expR).toBeVisible();
  // Ensure it has a non-trivial Expansion (set via the numeric field if missing).
  let before = Number(await expR.inputValue());
  if (!(before > 0)) {
    await expR.fill('32');
    await expR.dispatchEvent('change');
    before = 32;
  }

  // The Chrome/Expansion overlay is on by default; assert its chip is pressed.
  await expect(page.locator('.pv-chip[data-toggle="expansion"]')).toHaveAttribute('aria-pressed', 'true');

  // Wheel-zoom over the stage is VIEW-ONLY: it must NOT enable Save.
  const saveBtn = page.locator('.tb-btn', { hasText: 'Save' });
  await expect(saveBtn).toBeDisabled();
  const stage = page.locator('.pv-stage');
  await stage.hover();
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, 60);
  await expect(saveBtn).toBeDisabled();

  // Drag the RIGHT layout-ring edge outward. previewPanel publishes the layout-rect screen bbox
  // on the overlay canvas as data-layout-{l,t,r,b} (px within the canvas) so we can target the edge
  // without re-deriving the shared view transform.
  const overlay = page.locator('.pv-overlay');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('overlay not laid out');
  const edge = await overlay.evaluate((el) => ({
    r: Number((el as HTMLElement).dataset.layoutR),
    t: Number((el as HTMLElement).dataset.layoutT),
    b: Number((el as HTMLElement).dataset.layoutB),
  }));
  const sxScale = box.width / 512, syScale = box.height / 384;
  const startX = box.x + edge.r * sxScale;
  const startY = box.y + (edge.t + edge.b) / 2 * syScale;

  // Drag the edge left (toward quad interior) by a clear delta. The right edge sits at
  // layoutX1 = quadW - Expansion[2]; moving it left increases Expansion[2].
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 30, startY, { steps: 8 });
  await page.mouse.move(startX - 30, startY, { steps: 2 });
  await page.mouse.up();

  // (a) The docked Expansion[2] field reflects the committed drag and INCREASED.
  await expect.poll(async () => Number(await expR.inputValue())).toBeGreaterThan(before);

  // (b) The drag committed -> the package is dirty -> global Save enables.
  await expect(saveBtn).toBeEnabled();
});
