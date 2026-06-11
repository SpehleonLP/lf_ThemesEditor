// tests/package/refIndex.test.ts
import { expect, test } from 'vitest';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc, FileDoc } from '../../src/package/model';

function fd(root: any): FileDoc { return { path: 'x', root, dirty: false, indent: '\t' }; }

function pkg(parts: Partial<Record<keyof PackageDoc['files'], any>>): PackageDoc {
  return {
    files: {
      borders: fd(parts.borders ?? {}),
      backgrounds: fd(parts.backgrounds ?? {}),
      responseCurves: fd(parts.responseCurves ?? {}),
      codingThemes: fd(parts.codingThemes ?? {}),
    },
  };
}

test('borders Overlay/Mask Image → asset:image edges', () => {
  const idx = buildRefIndex(pkg({
    borders: { Window_0: { Overlay: { Image: 'Images/a.png', Cells: '#COPY' }, Mask: { Image: 'Images/m.png', Cells: '#COPY' } } },
  }));
  const targets = idx.edges().filter((e) => e.to.ns === 'asset:image').map((e) => e.to.name).sort();
  expect(targets).toEqual(['Images/a.png', 'Images/m.png']);
});

test('backgrounds detail-layer image/texCoord and light gradient/texCoord edges', () => {
  const idx = buildRefIndex(pkg({
    backgrounds: {
      Backgrounds: { Backdrop_0: { 'Detail Layers': [{ image: 'Images/p.png', texCoord: 'scroll' }] } },
      Lights: { White: { gradient: 'dusk', texCoord: 'spin' } },
      TexCoords: { scroll: {}, spin: {} },
      Gradients: { dusk: [] },
    },
  }));
  const by = (ns: string) => idx.edges().filter((e) => e.to.ns === ns).map((e) => e.to.name).sort();
  expect(by('asset:image')).toEqual(['Images/p.png']);
  expect(by('bg:texcoords')).toEqual(['scroll', 'spin']);
  expect(by('bg:gradients')).toEqual(['dusk']);
  expect(idx.dangling()).toEqual([]); // all targets defined
});

test('response-curves channels map to the right spline/gradient/sound namespaces', () => {
  const idx = buildRefIndex(pkg({
    responseCurves: {
      'Response Curves': { Button_0: { OnClick: 'Pop', Comment: 'a note' } },
      Events: { Pop: { Translation: 't2', Scaling: 's2', Rotation: 'r1', Style: 'st1', Tint: 'g', 'Font Color': 'fc', 'Sound Effect': 'snd', Comment: 'ignore me' } },
      '2D Splines': { t2: [], s2: [] },
      '1D Splines': { r1: [], st1: [] },
      Gradients: { g: [], fc: [] },
      'Sound Effects': { snd: { file: 'Sounds/x.ogg' } },
    },
  }));
  const by = (ns: string) => idx.edges().filter((e) => e.to.ns === ns).map((e) => e.to.name).sort();
  expect(by('rc:events')).toEqual(['Pop']);        // Comment under a curve is NOT an event ref
  expect(by('rc:splines2d')).toEqual(['s2', 't2']);
  expect(by('rc:splines1d')).toEqual(['r1', 'st1']);
  expect(by('rc:gradients')).toEqual(['fc', 'g']);
  expect(by('rc:sounds')).toEqual(['snd']);
  expect(by('asset:sound')).toEqual(['Sounds/x.ogg']);
});

test('empty string, #directives, and non-strings produce no edge', () => {
  const idx = buildRefIndex(pkg({
    responseCurves: { 'Response Curves': { Button_0: { OnClick: '', OnToggled: 42 as any } } },
    backgrounds: { Backgrounds: { Backdrop_0: { 'Detail Layers': [{ image: '#HURL_NOISE', texCoord: 'tc' }] } }, TexCoords: { tc: {} } },
  }));
  expect(idx.edges().filter((e) => e.to.ns === 'rc:events')).toEqual([]);
  expect(idx.edges().filter((e) => e.to.ns === 'asset:image')).toEqual([]); // #HURL_NOISE is a directive
  expect(idx.edges().filter((e) => e.to.ns === 'bg:texcoords').map((e) => e.to.name)).toEqual(['tc']);
});

test('dangling targets a missing name; consumers/dead reflect the graph', () => {
  const idx = buildRefIndex(pkg({
    responseCurves: {
      'Response Curves': { Button_0: { OnClick: 'Missing' }, Action_0: { OnClick: 'Pop' } },
      Events: { Pop: {}, Unused: {} },
    },
  }));
  expect(idx.dangling().map((e) => e.to.name)).toEqual(['Missing']);
  expect(idx.consumers('rc:events', 'Pop').map((e) => e.from.jsonPath.join('/'))).toEqual(['Response Curves/Action_0/OnClick']);
  expect(idx.dead('rc:events')).toEqual(['Unused']);   // defined, zero consumers
  expect(idx.definitions('rc:events').sort()).toEqual(['Pop', 'Unused']);
});

test('bg and rc Gradients are separate namespaces', () => {
  const idx = buildRefIndex(pkg({
    backgrounds: { Lights: { White: { gradient: 'shared' } }, Gradients: { shared: [] } },
    responseCurves: { Events: { E: { Tint: 'shared' } }, Gradients: {} }, // rc 'shared' undefined
  }));
  expect(idx.dangling().filter((e) => e.to.ns === 'bg:gradients')).toEqual([]);
  expect(idx.dangling().filter((e) => e.to.ns === 'rc:gradients').map((e) => e.to.name)).toEqual(['shared']);
});
