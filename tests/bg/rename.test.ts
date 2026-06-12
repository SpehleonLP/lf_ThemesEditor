// tests/bg/rename.test.ts
import { describe, it, expect } from 'vitest';
import { buildRefIndex } from '../../src/package/refIndex';
import { renameNamedEntry } from '../../src/bg/rename';
import type { PackageDoc } from '../../src/package/model';

function pkgWith(bg: any): PackageDoc {
  const blank = { path: '', root: {}, dirty: false, indent: '\t' };
  return { files: {
    borders: { ...blank }, backgrounds: { path: 'backgrounds.json', root: bg, dirty: false, indent: '\t' },
    responseCurves: { ...blank }, codingThemes: { ...blank },
  } } as PackageDoc;
}

describe('renameNamedEntry (bg:texcoords)', () => {
  it('renames the table key and every consumer (two layers + a light)', () => {
    const bg = {
      Backgrounds: { Backdrop_0: { 'Detail Layers': [
        { image: 'a.png', texCoord: 'spin' }, { image: 'b.png', texCoord: 'spin' },
      ] } },
      Lights: { White: { gradient: 'g', texCoord: 'spin' } },
      TexCoords: { spin: { spinSpeed: 1 } },
      Gradients: { g: [[0, [1, 1, 1, 1]]] },
    };
    const pkg = pkgWith(bg);
    renameNamedEntry(pkg, buildRefIndex(pkg), 'bg:texcoords', 'spin', 'rotate');

    expect(bg.TexCoords).toEqual({ rotate: { spinSpeed: 1 } });
    expect(bg.Backgrounds.Backdrop_0['Detail Layers'][0].texCoord).toBe('rotate');
    expect(bg.Backgrounds.Backdrop_0['Detail Layers'][1].texCoord).toBe('rotate');
    expect(bg.Lights.White.texCoord).toBe('rotate');
  });

  it('throws on a duplicate target name', () => {
    const bg = { TexCoords: { a: {}, b: {} } };
    const pkg = pkgWith(bg);
    expect(() => renameNamedEntry(pkg, buildRefIndex(pkg), 'bg:texcoords', 'a', 'b')).toThrow();
  });
});
