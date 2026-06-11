// e2e/editor.spec.ts
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let proc: ChildProcess;
let root: string;

test.beforeAll(async () => {
  test.setTimeout(180_000); // the real Gui dir is ~212MB on a FUSE mount; the recursive copy can be slow
  root = await mkdtemp(path.join(tmpdir(), 'gui-e2e-'));
  await cp('/mnt/Passport/Lifaundi/Gui', root, { recursive: true });
  proc = spawn('node', ['server.js', root], { env: { ...process.env, PORT: '8137' } });
  proc.stderr?.on('data', (d) => console.error('[server]', String(d)));
  await new Promise((r) => proc.stdout!.once('data', r));
});
test.afterAll(() => proc?.kill());

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
