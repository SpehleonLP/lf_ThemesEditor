// Tiny file server for the borders editor. Usage: node server.js <gui-root>
// Serves dist/ statically and a file API jailed to <gui-root>.
import http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? '.');
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT ?? 8137);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.map': 'application/json',
};

function jail(base, rel) {
  // Leading '.' + sep neuters absolute paths; the prefix check kills '..' escapes.
  const abs = path.resolve(base, '.' + path.sep + rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    const err = new Error('path escapes root'); err.status = 403; throw err;
  }
  return abs;
}

async function atomicWrite(abs, buf) {
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = abs + '.tmp';
  const fh = await fsp.open(tmp, 'w');
  try { await fh.writeFile(buf); await fh.sync(); } finally { await fh.close(); }
  // fsync-then-rename: safe on the FUSE mount; clean up the temp file if rename fails
  try {
    await fsp.rename(tmp, abs);
  } catch (e) {
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/file') {
      const abs = jail(root, url.searchParams.get('path') ?? '');
      if (req.method === 'GET') {
        const data = await fsp.readFile(abs);
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        return res.end(data);
      }
      if (req.method === 'PUT') {
        await atomicWrite(abs, await readBody(req));
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(405);
      return res.end();
    }
    if (url.pathname === '/api/list' && req.method === 'GET') {
      const abs = jail(root, url.searchParams.get('dir') ?? '.');
      const entries = await fsp.readdir(abs, { withFileTypes: true });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(entries.map((e) => ({ name: e.name, dir: e.isDirectory() }))));
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const abs = jail(dist, rel);
    const data = await fsp.readFile(abs);
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.status ?? (e.code === 'ENOENT' ? 404 : 500), { 'content-type': 'text/plain' });
    res.end(String(e.message ?? e));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`gui-editor server: root=${root} http://localhost:${port}`);
});
