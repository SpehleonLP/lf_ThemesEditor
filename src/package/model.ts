// src/package/model.ts
export type FileKey = 'borders' | 'backgrounds' | 'responseCurves' | 'codingThemes';

export interface FileDoc {
  path: string;       // 'borders.json', 'response curves.json' (note: spaces in two names)
  root: any;          // raw parsed JSON, edited in place; unknown keys round-trip untouched
  dirty: boolean;
  indent: string;     // detected indentation unit; reused on serialize
  loadError?: string; // unreadable/malformed → read-only, never saved
  missing?: boolean;  // absent at load → empty root + notice; created on first save
}

export interface PackageDoc {
  files: Record<FileKey, FileDoc>;
}

export const FILE_PATHS: Record<FileKey, string> = {
  borders: 'borders.json',
  backgrounds: 'backgrounds.json',
  responseCurves: 'response curves.json',
  codingThemes: 'coding themes.json',
};

export type ReadText = (path: string) => Promise<string>;

// First indented line wins; fall back to a tab so borders/backgrounds stay tab-indented.
function detectIndent(text: string): string {
  const m = text.match(/\n([ \t]+)\S/);
  return m ? m[1] : '\t';
}

export async function loadPackage(read: ReadText): Promise<PackageDoc> {
  const files = {} as Record<FileKey, FileDoc>;
  for (const key of Object.keys(FILE_PATHS) as FileKey[]) {
    const path = FILE_PATHS[key];
    let text: string;
    try {
      text = await read(path);
    } catch (e) {
      // Only a confirmed 404 means "doesn't exist yet". Anything else (5xx, network)
      // must NOT degrade to missing: a later Save would overwrite the real file.
      if ((e as any)?.status === 404) {
        files[key] = { path, root: {}, dirty: false, indent: '\t', missing: true };
      } else {
        files[key] = { path, root: {}, dirty: false, indent: '\t', loadError: String((e as Error)?.message ?? e) };
      }
      continue;
    }
    try {
      files[key] = { path, root: JSON.parse(text), dirty: false, indent: detectIndent(text) };
    } catch (e) {
      files[key] = { path, root: {}, dirty: false, indent: '\t', loadError: String((e as Error)?.message ?? e) };
    }
  }
  return { files };
}

export function serializeFile(file: FileDoc): string {
  return JSON.stringify(file.root, null, file.indent) + '\n';
}

export function anyDirty(pkg: PackageDoc): boolean {
  return (Object.keys(pkg.files) as FileKey[]).some((k) => pkg.files[k].dirty);
}
