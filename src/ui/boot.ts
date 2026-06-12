// src/ui/boot.ts
import { readFileText, writeFileBytes, listDir } from '../api';
import { loadPackage } from '../package/model';
import { buildRefIndex, type RefIndex } from '../package/refIndex';
import { fetchAssetList, type AssetList } from '../package/assets';
import { createSchemaValidators, runValidators, type Issue, type SchemaTexts } from '../package/validate';
import { createShell } from './shell';
import { createBordersSurface } from './surfaces/borders';
import { createBackgroundsSurface } from './bg/surface';
import { createResponseCurvesSurface } from './rc/surface';
import { createCodingThemesSurface } from './surfaces/codingThemes';
import { createAssetsSurface } from './surfaces/assets';
import type { Surface, SurfaceContext } from './surfaces/registry';

async function loadSchemas(): Promise<SchemaTexts> {
  const read = (n: string) => readFileText(`schemas/${n}`).then((t) => JSON.parse(t));
  return {
    borders: await read('borders.schema.json'),
    backgrounds: await read('backgrounds.schema.json'),
    responseCurves: await read('response-curves.schema.json'),
    codingThemes: await read('coding-themes.schema.json'),
  };
}

async function boot(): Promise<void> {
  const pkg = await loadPackage(readFileText);
  const schemas = createSchemaValidators(await loadSchemas());

  let index: RefIndex = buildRefIndex(pkg);
  let assets: AssetList = await fetchAssetList(index.edges(), listDir);
  let issues: Issue[] = [];

  const getContext = (): SurfaceContext => ({ pkg, index, assets, issues, navigate: (t) => shell.navigate(t) });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  function scheduleRevalidate(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { void runPipeline(false); }, 150);
  }

  async function runPipeline(refreshAssets: boolean): Promise<void> {
    index = buildRefIndex(pkg);
    if (refreshAssets) assets = await fetchAssetList(index.edges(), listDir);
    issues = runValidators(pkg, index, assets, schemas);
    shell.setIssues(issues);
    shell.refreshSurfaces();
  }

  const surfaces: Surface[] = [
    createBordersSurface(pkg.files.borders, scheduleRevalidate),
    createBackgroundsSurface(pkg.files.backgrounds, scheduleRevalidate),
    createResponseCurvesSurface(pkg.files.responseCurves, scheduleRevalidate),
    createCodingThemesSurface(pkg.files.codingThemes, scheduleRevalidate),
    createAssetsSurface(),
  ];

  const shell = createShell({
    pkg, surfaces, getContext,
    onValidate: () => { void runPipeline(true); },
    writeFile: (path, data) => writeFileBytes(path, data),
  });

  document.getElementById('app')!.replaceChildren(shell.root);
  shell.setActive('borders');
  await runPipeline(false); // initial validation pass
}

void boot();
