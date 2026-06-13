// src/package/validate.ts
import Ajv, { type ValidateFunction } from 'ajv';
import type { PackageDoc, FileKey } from './model';
import type { RefIndex, Namespace } from './refIndex';
import type { AssetList } from './assets';
import { marksAscending } from '../bg/gradients';

export type Severity = 'error' | 'warning' | 'notice';

export interface NavTarget { surface: FileKey | 'assets'; entry?: { ns?: Namespace; name?: string; slot?: string } }

export interface Issue {
  severity: Severity;
  category: string; // 'schema' | 'dangling-ref' | 'dead-entry' | 'asset' | 'missing-file' | 'load-error'
  message: string;
  file: FileKey | 'assets';
  jsonPath?: (string | number)[];
  nav?: NavTarget;
}

export type SchemaTexts = Record<FileKey, object>;
export type SchemaValidators = Record<FileKey, ValidateFunction>;

export function createSchemaValidators(schemas: SchemaTexts): SchemaValidators {
  const ajv = new Ajv({ strict: false, allErrors: true });
  return {
    borders: ajv.compile(schemas.borders),
    backgrounds: ajv.compile(schemas.backgrounds),
    responseCurves: ajv.compile(schemas.responseCurves),
    codingThemes: ajv.compile(schemas.codingThemes),
  };
}

const FILE_KEYS: FileKey[] = ['borders', 'backgrounds', 'responseCurves', 'codingThemes'];

// Human label per namespace, for messages.
const NS_LABEL: Record<Namespace, string> = {
  'bg:gradients': 'Gradient', 'bg:texcoords': 'TexCoord',
  'rc:events': 'Event', 'rc:splines1d': '1D Spline', 'rc:splines2d': '2D Spline',
  'rc:gradients': 'Gradient', 'rc:sounds': 'Sound Effect',
  'asset:image': 'image', 'asset:sound': 'sound',
};

export type Validator = (pkg: PackageDoc, index: RefIndex, assets: AssetList, schemas: SchemaValidators) => Issue[];

// 1. schema — ajv per file, with the unknown-key → notice downgrade.
const schemaValidator: Validator = (pkg, _index, _assets, schemas) => {
  const out: Issue[] = [];
  for (const file of FILE_KEYS) {
    const doc = pkg.files[file];
    if (doc.loadError || doc.missing) continue; // handled by other validators; never schema-check an unread file
    const validate = schemas[file];
    if (validate(doc.root)) continue;
    for (const err of validate.errors ?? []) {
      const unknownKey = err.keyword === 'additionalProperties';
      const extra = unknownKey ? ` (unknown key "${(err.params as any).additionalProperty}" — silently ignored by the engine)` : '';
      const path = err.instancePath ? err.instancePath.split('/').filter(Boolean) : [];
      out.push({
        severity: unknownKey ? 'notice' : 'error',
        category: 'schema',
        message: `${err.instancePath || '(root)'} ${err.message}${extra}`,
        file, jsonPath: path, nav: { surface: file },
      });
    }
  }
  return out;
};

// 2. dangling-ref — name namespaces only (asset dangles are owned by the asset validator).
const danglingValidator: Validator = (_pkg, index) =>
  index.dangling().map((e) => ({
    severity: 'error' as const,
    category: 'dangling-ref',
    message: `${NS_LABEL[e.to.ns]} "${e.to.name}" is referenced but not defined — this is a build error (the packer's GetIndex fails on the missing name).`,
    file: e.from.file,
    jsonPath: e.from.jsonPath,
    nav: { surface: e.from.file, entry: { ns: e.to.ns, name: e.to.name } },
  }));

// 3. dead-entry — defined names with zero consumers.
const NAME_NAMESPACES: Namespace[] = ['bg:gradients', 'bg:texcoords', 'rc:events', 'rc:splines1d', 'rc:splines2d', 'rc:gradients', 'rc:sounds'];
const NS_FILE: Record<string, FileKey> = {
  'bg:gradients': 'backgrounds', 'bg:texcoords': 'backgrounds',
  'rc:events': 'responseCurves', 'rc:splines1d': 'responseCurves', 'rc:splines2d': 'responseCurves',
  'rc:gradients': 'responseCurves', 'rc:sounds': 'responseCurves',
};
const deadEntryValidator: Validator = (_pkg, index) =>
  NAME_NAMESPACES.flatMap((ns) =>
    index.dead(ns).map((name) => ({
      severity: 'notice' as const,
      category: 'dead-entry',
      message: `${NS_LABEL[ns]} "${name}" is defined but unreferenced — it won't be packed.`,
      file: NS_FILE[ns],
      nav: { surface: NS_FILE[ns], entry: { ns, name } },
    })),
  );

// 4. assets — referenced-but-missing (error), rejected format (error), unreferenced eligible (notice).
const assetsValidator: Validator = (_pkg, _index, assets) => {
  const out: Issue[] = [];
  for (const m of assets.missing) {
    out.push({ severity: 'error', category: 'asset', message: `Referenced ${m.kind} "${m.name}" is missing on disk — the build will silently drop it.`, file: 'assets', nav: { surface: 'assets' } });
  }
  for (const w of assets.wrongFormat) {
    out.push({ severity: 'error', category: 'asset', message: `Referenced ${w.kind} "${w.name}" is a .${w.ext} — the engine only loads ${w.kind === 'image' ? 'png/jpg/jpeg/bmp' : 'wav/flac/ogg'}. Export it to a supported format.`, file: 'assets', nav: { surface: 'assets' } });
  }
  for (const a of [...assets.images, ...assets.sounds]) {
    if (a.status === 'rejected-format') {
      out.push({ severity: 'error', category: 'asset', message: `"${a.path}" uses rejected format .${a.ext} — the engine refuses it.`, file: 'assets', nav: { surface: 'assets' } });
    } else if (a.status === 'unreferenced') {
      out.push({ severity: 'notice', category: 'asset', message: `"${a.path}" is an eligible ${a.kind} but is unreferenced — it won't be packed.`, file: 'assets', nav: { surface: 'assets' } });
    }
  }
  return out;
};

// 0. load/missing-file housekeeping (runs first; loadError files are excluded from schema check above).
const fileStateValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  for (const file of FILE_KEYS) {
    const doc = pkg.files[file];
    if (doc.loadError) out.push({ severity: 'error', category: 'load-error', message: `${doc.path} could not be parsed: ${doc.loadError}. It is read-only and will not be saved.`, file, nav: { surface: file } });
    else if (doc.missing) out.push({ severity: 'notice', category: 'missing-file', message: `${doc.path} does not exist yet — it will be created on first save.`, file, nav: { surface: file } });
  }
  return out;
};

// 6. borders-tessellation-units — per-axis the engine decides pt-vs-fraction from one component
// (X: right>1, Y: top>1; gui_panel.tese:108). Warn when the deciding component is a fraction (<=1)
// but its paired component is in pixels (>1) — the pair silently becomes a nonsense fraction.
const bordersTessUnitsValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const root = pkg.files.borders.root;
  if (pkg.files.borders.loadError || pkg.files.borders.missing || !root) return out;
  for (const name of Object.keys(root)) {
    const entry = root[name];
    const t = entry?.Tessellation;
    if (!Array.isArray(t) || t.length !== 4) continue;
    const [left, top, right, bottom] = t as number[];
    const check = (axis: 'X' | 'Y', deciding: number, pair: number, dName: string, pName: string) => {
      if (deciding <= 1 && pair > 1) {
        out.push({
          severity: 'warning', category: 'borders-tessellation-units',
          message: `Border "${name}" ${axis} tessellation mixes units: ${dName}=${deciding} is a fraction (decides the axis) but ${pName}=${pair} is in pixels — the pixel value becomes a nonsense fraction.`,
          file: 'borders', jsonPath: [name, 'Tessellation'],
          nav: { surface: 'borders', entry: { name } },
        });
      }
    };
    check('X', right, left, 'right', 'left');
    check('Y', top, bottom, 'top', 'bottom');
  }
  return out;
};

// 7. bg-gradient-marks — non-ascending marks crash the bake; out-of-range t is dead/misleading.
const bgGradientMarksValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const grads = pkg.files.backgrounds.root?.Gradients;
  if (!grads || typeof grads !== 'object') return out;
  for (const name of Object.keys(grads)) {
    const marks = grads[name];
    if (!Array.isArray(marks)) continue;
    const ts = marks.map((m: any) => (Array.isArray(m) ? m[0] : NaN)) as number[];
    const parsed = marks
      .filter((m: any) => Array.isArray(m) && typeof m[0] === 'number')
      .map((m: any) => [m[0], m[1]] as [number, [number, number, number, number]]);
    if (!marksAscending(parsed)) {
      out.push({
        severity: 'error', category: 'bg-gradient-marks',
        message: `Gradient "${name}" has marks that are not in ascending order — the builder's bake loop reads past the end of the marks and can crash the build (the engine's own check misses it).`,
        file: 'backgrounds', jsonPath: ['Gradients', name],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:gradients', name } },
      });
    }
    if (ts.some((t) => t < 0 || t > 1)) {
      out.push({
        severity: 'warning', category: 'bg-gradient-marks',
        message: `Gradient "${name}" has a mark t outside 0..1 — ends are auto-extended, so out-of-range marks are dead or misleading.`,
        file: 'backgrounds', jsonPath: ['Gradients', name],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:gradients', name } },
      });
    }
  }
  return out;
};

// borders-overlay-image — an object-form Overlay with no Image has no visible
// artwork to draw. (An imageless Mask is fine: it reuses the Overlay image — #COPY semantics.)
export const bordersLayerImageValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const doc = pkg.files.borders;
  if (doc.loadError || doc.missing || !doc.root) return out;
  for (const name of Object.keys(doc.root)) {
    const layer = doc.root[name]?.Overlay;
    if (layer && typeof layer === 'object' && !Array.isArray(layer)
        && (typeof layer.Image !== 'string' || layer.Image === '')) {
      out.push({
        severity: 'warning', category: 'borders-overlay-image',
        message: `Border "${name}" Overlay has no Image — there is no artwork to draw.`,
        file: 'borders', jsonPath: [name, 'Overlay'],
        nav: { surface: 'borders', entry: { name } },
      });
    }
  }
  return out;
};

// rc-marks — the engine's Catmull-Rom evaluation assumes strictly ascending knots and
// fixed-dim values; the schemas document it but ajv can't express the ordering.
const RC_MARK_TABLES: { table: string; ns: Namespace; dim: number }[] = [
  { table: '1D Splines', ns: 'rc:splines1d', dim: 1 },
  { table: '2D Splines', ns: 'rc:splines2d', dim: 2 },
  { table: 'Gradients', ns: 'rc:gradients', dim: 4 },
];
export const rcMarksValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const doc = pkg.files.responseCurves;
  if (doc.loadError || doc.missing || !doc.root) return out;
  for (const { table, ns, dim } of RC_MARK_TABLES) {
    const tbl = doc.root[table];
    if (!tbl || typeof tbl !== 'object') continue;
    for (const name of Object.keys(tbl)) {
      const marks = tbl[name];
      if (!Array.isArray(marks)) continue; // shape itself is ajv's job
      const issue = (message: string) => out.push({
        severity: 'error', category: 'rc-marks', message,
        file: 'responseCurves', jsonPath: [table, name],
        nav: { surface: 'responseCurves', entry: { ns, name } },
      });
      const badShape = marks.some((m: any) =>
        !Array.isArray(m) || typeof m[0] !== 'number'
        || (dim === 1 ? typeof m[1] !== 'number'
            : !Array.isArray(m[1]) || m[1].length !== dim || m[1].some((v: any) => typeof v !== 'number')));
      if (badShape) { issue(`${NS_LABEL[ns]} "${name}" has a malformed mark — expected [t, ${dim === 1 ? 'value' : `[${dim} numbers]`}].`); continue; }
      for (let i = 1; i < marks.length; ++i) {
        if (!(marks[i][0] > marks[i - 1][0])) {
          issue(`${NS_LABEL[ns]} "${name}" mark times are not strictly ascending (t[${i}]=${marks[i][0]} after t[${i - 1}]=${marks[i - 1][0]}) — spline evaluation misbehaves.`);
          break;
        }
      }
    }
  }
  return out;
};

// texcoord-timefactor — only timeFactor 0 is reliable (known engine shader int/float bug,
// brief §3.4). The engine port (src/bg/texcoord.ts) defaults an ABSENT timeFactor to 1, so an
// absent field silently inherits the buggy realtime path — warn on absent AND on explicit nonzero.
export const texCoordTimeFactorValidator: Validator = (pkg) => {
  const out: Issue[] = [];
  const doc = pkg.files.backgrounds;
  if (doc.loadError || doc.missing || !doc.root) return out;
  const tcs = doc.root.TexCoords;
  if (!tcs || typeof tcs !== 'object') return out;
  for (const name of Object.keys(tcs)) {
    const tf = tcs[name]?.timeFactor;
    if (tf === undefined) {
      out.push({
        severity: 'warning', category: 'texcoord-timefactor',
        message: `TexCoord "${name}" has no timeFactor — the engine defaults it to 1 (realtime), but only 0 is reliable (known engine shader int/float bug). Set it to 0.`,
        file: 'backgrounds', jsonPath: ['TexCoords', name],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:texcoords', name } },
      });
    } else if (typeof tf === 'number' && tf !== 0) {
      out.push({
        severity: 'warning', category: 'texcoord-timefactor',
        message: `TexCoord "${name}" has timeFactor=${tf} — only 0 is reliable (known engine shader int/float bug).`,
        file: 'backgrounds', jsonPath: ['TexCoords', name, 'timeFactor'],
        nav: { surface: 'backgrounds', entry: { ns: 'bg:texcoords', name } },
      });
    }
  }
  return out;
};

const REGISTRY: Validator[] = [fileStateValidator, schemaValidator, danglingValidator, deadEntryValidator, assetsValidator, bordersTessUnitsValidator, bgGradientMarksValidator, bordersLayerImageValidator, rcMarksValidator, texCoordTimeFactorValidator];

export function runValidators(pkg: PackageDoc, index: RefIndex, assets: AssetList, schemas: SchemaValidators): Issue[] {
  return REGISTRY.flatMap((v) => v(pkg, index, assets, schemas));
}
