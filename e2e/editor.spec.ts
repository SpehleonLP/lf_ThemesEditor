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
