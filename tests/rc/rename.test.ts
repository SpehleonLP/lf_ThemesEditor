// tests/rc/rename.test.ts
import { describe, it, expect } from 'vitest';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc } from '../../src/package/model';
import { renameRcEntry } from '../../src/rc/rename';

function pkgWith(rcRoot: any): PackageDoc {
  const mk = (root: any) => ({ path: 'x', root, dirty: false, indent: '\t' });
  return { files: { borders: mk({}), backgrounds: mk({}), responseCurves: mk(rcRoot), codingThemes: mk({}) } } as PackageDoc;
}

describe('rc/rename', () => {
  it('renames a 1D spline and rewrites the event that references it', () => {
    const pkg = pkgWith({
      '1D Splines': { wobble: [[0, 0], [1, 1]] },
      'Events': { Hover: { Rotation: 'wobble' } },
    });
    const index = buildRefIndex(pkg);
    renameRcEntry(pkg, index, 'rc:splines1d', 'wobble', 'spin');
    const root = pkg.files.responseCurves.root;
    expect(root['1D Splines'].spin).toBeDefined();
    expect(root['1D Splines'].wobble).toBeUndefined();
    expect(root['Events'].Hover.Rotation).toBe('spin');
  });

  it('preserves insertion order of the renamed table', () => {
    const pkg = pkgWith({ 'Events': { a: {}, b: {}, c: {} } });
    const index = buildRefIndex(pkg);
    renameRcEntry(pkg, index, 'rc:events', 'b', 'bb');
    expect(Object.keys(pkg.files.responseCurves.root['Events'])).toEqual(['a', 'bb', 'c']);
  });

  it('throws on duplicate target name', () => {
    const pkg = pkgWith({ 'Gradients': { g1: [[0, [1, 1, 1, 1]]], g2: [[0, [1, 1, 1, 1]]] } });
    const index = buildRefIndex(pkg);
    expect(() => renameRcEntry(pkg, index, 'rc:gradients', 'g1', 'g2')).toThrow();
  });
});
