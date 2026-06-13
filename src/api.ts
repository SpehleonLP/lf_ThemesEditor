export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new HttpError(`read ${path}: ${r.status} ${await r.text()}`, r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export async function readFileText(path: string): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(path));
}

export async function writeFileBytes(path: string, data: Uint8Array | string): Promise<void> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: data as BodyInit });
  if (!r.ok) throw new HttpError(`write ${path}: ${r.status} ${await r.text()}`, r.status);
}

export async function listDir(dir: string): Promise<{ name: string; dir: boolean }[]> {
  const r = await fetch(`/api/list?dir=${encodeURIComponent(dir)}`);
  if (!r.ok) throw new HttpError(`list ${dir}: ${r.status}`, r.status);
  return await r.json();
}
