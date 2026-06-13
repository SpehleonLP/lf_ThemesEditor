// tests/package/model.test.ts
import { expect, test } from 'vitest';
import { loadPackage, serializeFile, anyDirty, FILE_PATHS, type FileKey } from '../../src/package/model';
import { HttpError } from '../../src/api';

function fakeReader(files: Record<string, string | 'MISSING'>) {
  return async (path: string): Promise<string> => {
    const v = files[path];
    if (v === undefined || v === 'MISSING') throw new HttpError(`read ${path}: 404`, 404);
    return v;
  };
}

test('loads all four files, tracks indentation, no dirty initially', async () => {
  const pkg = await loadPackage(fakeReader({
    'borders.json': '{\n\t"Window_0": {}\n}\n',
    'backgrounds.json': '{\n\t"Gradients": {}\n}\n',
    'response curves.json': '{\n    "Events": {}\n}\n',
    'coding themes.json': '{\n    "Light": {}\n}\n',
  }));
  expect(Object.keys(pkg.files)).toEqual(Object.keys(FILE_PATHS));
  expect(pkg.files.borders.root).toEqual({ Window_0: {} });
  expect(anyDirty(pkg)).toBe(false);
  expect(pkg.files.borders.loadError).toBeUndefined();
  expect(pkg.files.borders.missing).toBeUndefined();
});

test('missing file → empty root flagged missing, never errored', async () => {
  const pkg = await loadPackage(fakeReader({
    'borders.json': '{}',
    'backgrounds.json': 'MISSING',
    'response curves.json': '{}',
    'coding themes.json': '{}',
  }));
  expect(pkg.files.backgrounds.missing).toBe(true);
  expect(pkg.files.backgrounds.root).toEqual({});
  expect(pkg.files.backgrounds.loadError).toBeUndefined();
});

test('malformed JSON → loadError, empty root, not dirty', async () => {
  const pkg = await loadPackage(fakeReader({
    'borders.json': '{ this is not json',
    'backgrounds.json': '{}',
    'response curves.json': '{}',
    'coding themes.json': '{}',
  }));
  expect(pkg.files.borders.loadError).toBeTruthy();
  expect(pkg.files.borders.root).toEqual({});
});

test('serializeFile preserves detected indentation and trailing newline', async () => {
  const pkg = await loadPackage(fakeReader({
    'borders.json': '{\n\t"Window_0": {\n\t\t"a": 1\n\t}\n}\n',
    'backgrounds.json': '{}',
    'response curves.json': '{\n    "Events": {}\n}\n',
    'coding themes.json': '{}',
  }));
  expect(serializeFile(pkg.files.borders)).toBe('{\n\t"Window_0": {\n\t\t"a": 1\n\t}\n}\n');
  expect(serializeFile(pkg.files.responseCurves)).toBe('{\n    "Events": {}\n}\n');
});

test('404 read failure → missing, never errored', async () => {
  const pkg = await loadPackage(async () => { throw new HttpError('read x: 404', 404); });
  expect(pkg.files.borders.missing).toBe(true);
  expect(pkg.files.borders.loadError).toBeUndefined();
});

test('non-404 read failure → loadError (read-only), not missing', async () => {
  const pkg = await loadPackage(async () => { throw new HttpError('read x: 500 EIO', 500); });
  expect(pkg.files.borders.missing).toBeUndefined();
  expect(pkg.files.borders.loadError).toContain('500');
});

test('non-HTTP failure (network down) → loadError, not missing', async () => {
  const pkg = await loadPackage(async () => { throw new TypeError('fetch failed'); });
  expect(pkg.files.borders.missing).toBeUndefined();
  expect(pkg.files.borders.loadError).toContain('fetch failed');
});

test('serializeFile uses a borders-style override (tabs) when a file has no detectable indent', async () => {
  const pkg = await loadPackage(fakeReader({
    'borders.json': '{}', 'backgrounds.json': '{}',
    'response curves.json': '{}', 'coding themes.json': '{}',
  }));
  // empty object serializes to "{}" with a trailing newline regardless of indent
  expect(serializeFile(pkg.files.borders)).toBe('{}\n');
});
