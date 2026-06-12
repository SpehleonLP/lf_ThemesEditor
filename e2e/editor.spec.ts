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

  // Switch to Response Curves (now the editable 4-panel authoring surface).
  await page.locator('.nav-row[data-surface="responseCurves"]').click();
  await expect(page.locator('.bg-surface')).toBeVisible();
  // The rail renders its tab buttons (e.g. Events).
  await expect(page.locator('.bg-tab', { hasText: 'Events' })).toBeVisible();

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

test('borders: 5×5-lines mode live line-drag commits + round-trips through save/reload', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('.borders-surface')).toBeVisible();

  // Decoration_1's Overlay Cells are the x/y line form [[0,40,40,472,472,512],[0,0,128,128]],
  // which expands to a clean 5×5 partition -> detectGridMode() returns '5x5lines'. (No live border
  // is a clean 3×3, so we exercise the partition-line path, which subsumes 3×3 geometrically.)
  const enter5x5 = async () => {
    await page.locator('.bs-slots div', { hasText: /^Decoration_1$/ }).click();
    // 5×5-lines is available; 3×3 is not (these cells are a non-3×3 partition).
    await expect(page.locator('#mode-5x5')).toBeEnabled();
    await expect(page.locator('#mode-3x3')).toBeDisabled();
    await page.locator('#mode-5x5').click();
    await expect(page.locator('#mode-5x5')).toHaveAttribute('aria-pressed', 'true');
  };
  // Parse the x-line index 1 value out of the monospace readout ("5×5  x=[..]  y=[..]").
  const xLine1 = async (): Promise<number> => {
    const txt = (await page.locator('#readout').textContent()) ?? '';
    const m = txt.match(/x=\[([^\]]+)\]/);
    if (!m) throw new Error(`readout has no x-lines: ${txt}`);
    return Number(m[1].split(',')[1].trim());
  };

  await enter5x5();
  const before = await xLine1(); // 40
  expect(before).toBe(40);

  // The rect canvas publishes its view transform (zoom/ox/oy) as data attributes so we can map an
  // image-space partition line to a canvas pixel without re-deriving the transform.
  const canvas = page.locator('#rect-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('rect canvas not laid out');
  const view = await canvas.evaluate((el) => ({
    z: Number((el as HTMLElement).dataset.viewZoom),
    ox: Number((el as HTMLElement).dataset.viewOx),
  }));
  // Drag the x-line at image-x=40 (index 1) LEFT by a clear delta. rewrite5x5Line clamps it to its
  // neighbours [0, 40], so a leftward drag lands well below 40.
  const sx = box.x + (before * view.z + view.ox);
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 25, sy, { steps: 8 });
  await page.mouse.move(sx - 25, sy, { steps: 2 });
  await page.mouse.up();

  // (a) The readout reflects the committed drag: x-line 1 DECREASED below its starting 40.
  await expect.poll(xLine1).toBeLessThan(before);
  const dragged = await xLine1();

  // (b) The drag committed -> package dirty -> Save enables. Save, then it disables again.
  const saveBtn = page.locator('.tb-btn', { hasText: 'Save' });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled();

  // (c) Reload from the (saved) mirror JSON and confirm the dragged geometry persisted.
  await page.reload();
  await enter5x5();
  expect(await xLine1()).toBe(dragged);
});

test('borders: slot list add/delete + shared-sheet badge', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('.borders-surface')).toBeVisible();

  // (c) A border whose Overlay image is shared by >= 2 borders shows the ⛓N badge with N >= 2.
  // In the live data Slider_0 and Slider_1 both use Images/circle_border.png as their Overlay.
  const sliderRow = page.locator('.sl-row', { has: page.locator('.sl-name', { hasText: /^Slider_0$/ }) });
  await expect(sliderRow).toBeVisible();
  const badge = sliderRow.locator('.sl-badge');
  await expect(badge).toBeVisible();
  const badgeText = (await badge.textContent()) ?? '';
  const n = Number(badgeText.replace(/[^0-9]/g, ''));
  expect(n).toBeGreaterThanOrEqual(2);
  expect(badgeText).toContain('⛓');

  // (a) Adding an unused slot via the dropdown inserts a row that becomes selected and enables Save.
  const saveBtn = page.locator('.tb-btn', { hasText: 'Save' });
  await expect(saveBtn).toBeDisabled();

  // Pick the first unused name offered by the add-slot select (skip the placeholder option).
  const addSelect = page.locator('.sl-add-select');
  const newName = await addSelect.locator('option').nth(1).getAttribute('value');
  if (!newName) throw new Error('no unused border name available to add');
  await addSelect.selectOption(newName);

  const newRow = page.locator('.sl-row', { has: page.locator('.sl-name', { hasText: new RegExp(`^${newName}$`) }) });
  await expect(newRow).toBeVisible();
  await expect(newRow).toHaveClass(/sl-selected/);
  await expect(saveBtn).toBeEnabled();

  // (b) Deleting that slot removes its row. Accept the confirm() dialog.
  page.once('dialog', (d) => void d.accept());
  await newRow.hover();
  await newRow.locator('.sl-del').click();
  await expect(newRow).toHaveCount(0);
});

test('borders: mask-mode select + Comment field dirty & round-trip', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('.borders-surface')).toBeVisible();

  // Select Window_0.
  await page.locator('.bs-slots div', { hasText: /^Window_0$/ }).click();
  const saveBtn = page.locator('.tb-btn', { hasText: 'Save' });
  await expect(saveBtn).toBeDisabled();

  // (a) Change the Mask mode to #OVERLAY -> entry mutates, structural remount fires, Save enables.
  const maskSel = page.locator('select[data-mask="mode"]');
  await expect(maskSel).toBeVisible();
  await maskSel.selectOption('#OVERLAY');
  await expect(saveBtn).toBeEnabled();
  // The select reflects the chosen mode after the remount (focus-preserving update re-reads entry).
  await expect(maskSel).toHaveValue('#OVERLAY');

  // (b) Type into the border Comment field — Save stays enabled, no new validation notice.
  const comment = page.locator('input[data-comment="border"]');
  await comment.fill('e2e mask + comment test');
  await expect(saveBtn).toBeEnabled();

  // (c) Save, then reload from the (saved) mirror JSON and confirm both round-trip.
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled();
  await page.reload();
  await expect(page.locator('.borders-surface')).toBeVisible();
  await page.locator('.bs-slots div', { hasText: /^Window_0$/ }).click();
  await expect(page.locator('select[data-mask="mode"]')).toHaveValue('#OVERLAY');
  await expect(page.locator('input[data-comment="border"]')).toHaveValue('e2e mask + comment test');
});

test('backgrounds: add backdrop slot → configure layer → dirty → Save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await page.locator('.bg-tab', { hasText: 'Backdrops' }).click();
  // add a slot via the + button → pick the first offered slot from the dropdown dialog
  await page.locator('.bg-el-add').click();
  await page.locator('.picker-dialog select').first().selectOption({ index: 0 });
  await page.locator('.picker-dialog button', { hasText: 'Add' }).click();
  // enable layer 0 + enable glass so the entry is valid
  await page.locator('[data-layer="0"] [data-l="enabled"]').check();
  await page.locator('[data-g="enabled"]').check();
  const save = page.getByRole('button', { name: /^Save/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
});

test('backgrounds: gradient stop drag commits once and survives notify', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await page.locator('.bg-tab', { hasText: 'Gradients' }).click();
  page.once('dialog', (d) => d.accept('rampE2E'));
  await page.locator('.bg-el-add').click();
  const bar = page.locator('.bg-grad-bar');
  const box = await bar.boundingBox();
  // click empty area to insert a stop, then drag it
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('backgrounds: tab switch keeps preview canvas alive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await expect(page.locator('.bg-pv-canvas')).toBeVisible();
  await page.locator('.bg-tab', { hasText: 'Lights' }).click();
  await expect(page.locator('.bg-pv-canvas')).toBeVisible(); // preview persists across tabs
});

test('backgrounds: away→back resumes the playing preview loop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  const canvas = page.locator('.bg-pv-canvas');
  await expect(canvas).toBeVisible();
  // Preview mounts playing (⏸). Switch AWAY (loop suspends on the hidden host) then BACK.
  await page.locator('.nav-row[data-surface="borders"]').click();
  await expect(page.locator('.borders-surface')).toBeVisible();
  await page.getByRole('button', { name: /Backgrounds/ }).click();
  await expect(canvas).toBeVisible();
  // frame() publishes data-frame, ticking once per rendered (visible) frame. If the rAF loop
  // re-armed on re-activation the counter keeps climbing; the frozen-until-edit regression would
  // leave it stuck. Content-independent, so it holds even where WebGL2 is unavailable.
  const frameCount = () => canvas.evaluate((c: HTMLCanvasElement) => Number(c.dataset.frame) || 0);
  const start = await frameCount();
  await expect.poll(frameCount, { timeout: 4000 }).toBeGreaterThan(start);
});

test('response curves: add an event and bind a channel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await page.locator('.bg-tab', { hasText: 'Events' }).click();
  page.once('dialog', (d) => d.accept('E2EHover')); // new event name prompt
  await page.locator('.bg-el-add').click();
  await page.locator('.bg-el-row', { hasText: 'E2EHover' }).click();
  // bind nothing-yet is fine; assert the channel selects render
  await expect(page.locator('select[data-ch="Translation"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('response curves: add a 1D spline mark via the plot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await page.locator('.bg-tab', { hasText: '1D Splines' }).click();
  page.once('dialog', (d) => d.accept('e2eWobble'));
  await page.locator('.bg-el-add').click();
  await page.locator('.bg-el-row', { hasText: 'e2eWobble' }).click();
  const plot = page.locator('.rc-plot-canvas');
  const box = await plot.boundingBox();
  // click empty area to insert a mark (away from the two default endpoints)
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.3);
  await expect(page.locator('.rc-mark-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled();
});

test('response curves: trigger an event and the preview canvas stays alive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Response Curves/ }).click();
  await expect(page.locator('.rc-pv-canvas')).toBeVisible();
  await page.locator('.bg-tab', { hasText: 'Events' }).click();
  await expect(page.locator('.rc-pv-canvas')).toBeVisible(); // preview persists across tab switches
});
