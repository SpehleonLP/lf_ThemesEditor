// tests/package/validate.test.ts
import { expect, test, describe } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createSchemaValidators, runValidators, type SchemaTexts } from '../../src/package/validate';
import { buildRefIndex } from '../../src/package/refIndex';
import { classifyAssets } from '../../src/package/assets';
import type { PackageDoc, FileDoc, FileKey } from '../../src/package/model';

const SCHEMA_DIR = '/mnt/Passport/Lifaundi/Gui/schemas';
async function schemaTexts(): Promise<SchemaTexts> {
  const read = (n: string) => readFile(`${SCHEMA_DIR}/${n}`, 'utf-8').then(JSON.parse);
  return {
    borders: await read('borders.schema.json'),
    backgrounds: await read('backgrounds.schema.json'),
    responseCurves: await read('response-curves.schema.json'),
    codingThemes: await read('coding-themes.schema.json'),
  };
}

function fd(root: any, extra: Partial<FileDoc> = {}): FileDoc { return { path: 'x', root, dirty: false, indent: '\t', ...extra }; }
function pkg(p: Partial<Record<FileKey, FileDoc>>): PackageDoc {
  return { files: { borders: p.borders ?? fd({}), backgrounds: p.backgrounds ?? fd({}), responseCurves: p.responseCurves ?? fd({}), codingThemes: p.codingThemes ?? fd({}) } };
}

async function run(p: PackageDoc, disk: { path: string }[] = []) {
  const validators = createSchemaValidators(await schemaTexts());
  const index = buildRefIndex(p);
  const assets = classifyAssets(disk, index.edges());
  return runValidators(p, index, assets, validators);
}

test('live coding-themes shape → unknown-key NOTICES, never errors/blocks', async () => {
  const issues = await run(pkg({ codingThemes: fd({ Light: { diffuse: [1, 1, 1, 1], warp: 0 }, Dark: {} }) }));
  const ct = issues.filter((i) => i.file === 'codingThemes');
  expect(ct.length).toBeGreaterThan(0);
  expect(ct.every((i) => i.severity === 'notice')).toBe(true);
  expect(ct.some((i) => i.category === 'schema' && /diffuse|warp/.test(i.message))).toBe(true);
});

test('non-additionalProperties schema violation stays an error', async () => {
  // Tessellation must be a 4-number array; a string is a type violation (not unknown-key).
  const issues = await run(pkg({ borders: fd({ Window_0: { Overlay: { Cells: '#COPY' }, Tessellation: 'nope' } }) }));
  expect(issues.some((i) => i.file === 'borders' && i.category === 'schema' && i.severity === 'error')).toBe(true);
});

test('dangling name reference → error with build-error wording', async () => {
  const issues = await run(pkg({ responseCurves: fd({ 'Response Curves': { Button_0: { OnClick: 'Ghost' } }, Events: {} }) }));
  const e = issues.find((i) => i.category === 'dangling-ref' && i.severity === 'error' && /Ghost/.test(i.message));
  expect(e).toBeTruthy();
  expect(e!.message).toMatch(/build error/i);
  expect(e!.message).not.toMatch(/silently drop/i);
});

test('dead entry → notice', async () => {
  const issues = await run(pkg({ responseCurves: fd({ Events: { Lonely: {} } }) }));
  expect(issues.some((i) => i.category === 'dead-entry' && i.severity === 'notice' && /Lonely/.test(i.message))).toBe(true);
});

test('referenced-but-missing asset → error; rejected format → error; unreferenced eligible → notice', async () => {
  const p = pkg({ borders: fd({ Window_0: { Overlay: { Image: 'Images/gone.png', Cells: '#COPY' } } }) });
  const issues = await run(p, [{ path: 'Images/orphan.png' }, { path: 'Images/bad.webp' }]);
  expect(issues.some((i) => i.category === 'asset' && i.severity === 'error' && /gone\.png/.test(i.message))).toBe(true);
  expect(issues.some((i) => i.category === 'asset' && i.severity === 'error' && /webp/i.test(i.message))).toBe(true);
  expect(issues.some((i) => i.category === 'asset' && i.severity === 'notice' && /orphan\.png/.test(i.message))).toBe(true);
});

test('missing file → notice', async () => {
  const issues = await run(pkg({ backgrounds: fd({}, { missing: true }) }));
  expect(issues.some((i) => i.file === 'backgrounds' && i.category === 'missing-file' && i.severity === 'notice')).toBe(true);
});

test('timeFactor in a TexCoord → no texcoord-timefactor issue emitted', async () => {
  const issues = await run(pkg({ backgrounds: fd({ TexCoords: { spin: { timeFactor: 5 } } }) }));
  expect(issues.some((i) => i.category === 'texcoord-timefactor')).toBe(false);
});

test('loadError file is reported once and not schema-checked', async () => {
  const issues = await run(pkg({ borders: fd({}, { loadError: 'Unexpected token' }) }));
  const b = issues.filter((i) => i.file === 'borders');
  expect(b.length).toBe(1);
  expect(b[0].category).toBe('load-error');
  expect(b[0].severity).toBe('error');
});

describe('backdrop anyOf schema', () => {
  test('empty Detail Layers array → schema error on backgrounds', async () => {
    const issues = await run(pkg({ backgrounds: fd({ Backgrounds: { Backdrop_0: { 'Detail Layers': [] } } }) }));
    expect(issues.some((i) => i.file === 'backgrounds' && i.category === 'schema' && i.severity === 'error')).toBe(true);
  });

  test('Frosted Glass only backdrop → no schema issue on backgrounds', async () => {
    const issues = await run(pkg({ backgrounds: fd({ Backgrounds: { Backdrop_0: { 'Frosted Glass': {} } } }) }));
    expect(issues.some((i) => i.file === 'backgrounds' && i.category === 'schema')).toBe(false);
  });
});

describe('bg-gradient-marks', () => {
  test('flags non-ascending gradient marks as an error', async () => {
    const issues = await run(pkg({ backgrounds: fd({ Gradients: { bad: [[0,[0,0,0,1]],[0.8,[1,1,1,1]],[0.3,[1,0,0,1]]] } }) }));
    const e = issues.find((i) => i.category === 'bg-gradient-marks' && i.severity === 'error');
    expect(e).toBeTruthy();
    expect(e!.message).toMatch(/ascending/i);
  });

  test('warns when a mark t is outside 0..1', async () => {
    const issues = await run(pkg({ backgrounds: fd({ Gradients: { oob: [[0,[0,0,0,1]],[1.5,[1,1,1,1]]] } }) }));
    const w = issues.find((i) => i.category === 'bg-gradient-marks' && i.severity === 'warning');
    expect(w).toBeTruthy();
  });

  test('no bg-gradient-marks issue for a well-formed gradient', async () => {
    const issues = await run(pkg({ backgrounds: fd({ Gradients: { ok: [[0,[0,0,0,1]],[1,[1,1,1,1]]] } }) }));
    expect(issues.some((i) => i.category === 'bg-gradient-marks')).toBe(false);
  });
});

describe('borders-tessellation-units', () => {
  async function issuesFor(tessellation: number[]) {
    const p = pkg({ borders: fd({ Header_0: { Overlay: { Cells: '#COPY' }, Tessellation: tessellation } }) });
    const all = await run(p);
    return all.filter((i) => i.category === 'borders-tessellation-units');
  }

  test('warns when X mixes: right<=1 (fraction) but left>1 (px)', async () => {
    const is = await issuesFor([32, 0.5, 0.25, 0.5]);
    expect(is).toHaveLength(1);
    expect(is[0].severity).toBe('warning');
    expect(is[0].message).toMatch(/X/);
    expect(is[0].message).toContain('32');
    expect(is[0].message).toContain('0.25');
  });

  test('warns when Y mixes: top<=1 but bottom>1', async () => {
    const is = await issuesFor([0.25, 0.25, 0.25, 64]);
    expect(is).toHaveLength(1);
    expect(is[0].message).toMatch(/Y/);
  });

  test('no warning when an axis is consistently pixels', async () => {
    expect(await issuesFor([32, 64, 32, 64])).toHaveLength(0);
  });

  test('no warning when an axis is consistently fractions', async () => {
    expect(await issuesFor([0.1, 0.2, 0.1, 0.2])).toHaveLength(0);
  });

  test('navigates to the borders surface / the entry', async () => {
    const is = await issuesFor([32, 0.5, 0.25, 0.5]);
    expect(is[0].nav?.surface).toBe('borders');
    expect(is[0].nav?.entry?.name).toBe('Header_0');
  });
});
