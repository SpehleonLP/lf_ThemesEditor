// tests/ui/readOnlyTable.test.ts
import { expect, test } from 'vitest';
import { resolveEntrySelection } from '../../src/ui/surfaces/readOnlyTable';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc, FileDoc } from '../../src/package/model';
import type { Namespace } from '../../src/package/refIndex';

const fd = (root: any): FileDoc => ({ path: 'x', root, dirty: false, indent: '\t' });
const pkg = (responseCurves: any): PackageDoc => ({
  files: { borders: fd({}), backgrounds: fd({}), responseCurves: fd(responseCurves), codingThemes: fd({}) },
});

const RC_TABLES: { ns: Namespace; title: string }[] = [
  { ns: 'rc:events', title: 'Events' },
  { ns: 'rc:splines2d', title: '2D Splines' },
];

test('explicit ns+name is used directly', () => {
  const idx = buildRefIndex(pkg({ Events: { Pop: {} } }));
  expect(resolveEntrySelection(idx, RC_TABLES, { ns: 'rc:events', name: 'Pop' })).toEqual({ ns: 'rc:events', name: 'Pop' });
});

test('name-only resolves to the table that defines it', () => {
  const idx = buildRefIndex(pkg({ Events: { Pop: {} }, '2D Splines': { Slide: [] } }));
  // 'Pop' is an Event → rc:events; 'Slide' is a 2D spline → rc:splines2d
  expect(resolveEntrySelection(idx, RC_TABLES, { name: 'Pop' })).toEqual({ ns: 'rc:events', name: 'Pop' });
  expect(resolveEntrySelection(idx, RC_TABLES, { name: 'Slide' })).toEqual({ ns: 'rc:splines2d', name: 'Slide' });
});

test('name not defined in any of this surface tables → null', () => {
  const idx = buildRefIndex(pkg({ Events: { Pop: {} } }));
  expect(resolveEntrySelection(idx, RC_TABLES, { name: 'Ghost' })).toBeNull();
});

test('undefined / empty entry → null', () => {
  const idx = buildRefIndex(pkg({ Events: { Pop: {} } }));
  expect(resolveEntrySelection(idx, RC_TABLES, undefined)).toBeNull();
  expect(resolveEntrySelection(idx, RC_TABLES, {})).toBeNull();
});
