import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
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

test('open, edit a tessellation value, save, JSON updated', async ({ page }) => {
  await page.goto('/'); // server serves dist/ — requires `npm run build` first
  const name = await page.locator('#border-list div').first().textContent();
  await page.locator('#border-list div').first().click();
  const tess = page.locator('input[data-edge="Tessellation"][data-i="0"]');
  await tess.fill('17');
  await tess.dispatchEvent('change');
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#save').click();
  await expect(page.locator('#save-status')).toContainText('saved');
  const doc = JSON.parse(await readFile(path.join(root, 'borders.json'), 'utf-8'));
  expect(doc[name!].Tessellation[0]).toBe(17);
});
