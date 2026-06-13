import { afterAll, beforeAll, expect, test } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let proc: ChildProcess;
let root: string;
const PORT = 8917;
const base = `http://127.0.0.1:${PORT}`;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gui-editor-test-'));
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'hello.json'), '{"a":1}');
  await writeFile(path.join(root, 'beep.wav'), 'RIFFfake');
  await writeFile(path.join(root, 'mystery.xyz'), 'unknown');
  proc = spawn('node', ['server.js', root], { env: { ...process.env, PORT: String(PORT) } });
  await new Promise<void>((resolve, reject) => {
    proc.stdout!.on('data', () => resolve());
    proc.on('exit', () => reject(new Error('server died')));
  });
});
afterAll(() => { proc.kill(); });

test('GET /api/file reads a file', async () => {
  const r = await fetch(`${base}/api/file?path=hello.json`);
  expect(r.status).toBe(200);
  expect(await r.text()).toBe('{"a":1}');
});

test('GET media file serves its real MIME type', async () => {
  const r = await fetch(`${base}/api/file?path=beep.wav`);
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('audio/wav');
});

test('GET unknown ext falls back to octet-stream', async () => {
  const r = await fetch(`${base}/api/file?path=mystery.xyz`);
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('application/octet-stream');
});

test('GET missing file is 404', async () => {
  const r = await fetch(`${base}/api/file?path=nope.json`);
  expect(r.status).toBe(404);
});

test('path traversal is rejected', async () => {
  for (const p of ['../etc/passwd', '..%2F..%2Fetc%2Fpasswd', '/etc/passwd', 'sub/../../etc/passwd']) {
    const r = await fetch(`${base}/api/file?path=${p}`);
    expect([403, 404]).toContain(r.status);
    expect(r.status === 403 || p === '/etc/passwd').toBe(true); // absolute paths jail to root instead
  }
});

test('PUT writes atomically and round-trips bytes', async () => {
  const body = new Uint8Array([0, 1, 254, 255, 137, 80]);
  const r = await fetch(`${base}/api/file?path=sub/out.bin`, { method: 'PUT', body });
  expect(r.status).toBe(204);
  const back = new Uint8Array(await readFile(path.join(root, 'sub', 'out.bin')));
  expect([...back]).toEqual([...body]);
  // atomic write: the tmp file must be gone after the rename
  const { readdir } = await import('node:fs/promises');
  expect((await readdir(path.join(root, 'sub'))).filter((n) => n.includes('.tmp'))).toEqual([]);
});

test('GET /api/list lists a directory', async () => {
  const r = await fetch(`${base}/api/list?dir=.`);
  const entries = await r.json() as { name: string; dir: boolean }[];
  expect(entries).toContainEqual({ name: 'hello.json', dir: false });
  expect(entries).toContainEqual({ name: 'sub', dir: true });
});
