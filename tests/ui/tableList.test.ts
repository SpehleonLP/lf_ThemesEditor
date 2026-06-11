// tests/ui/tableList.test.ts
import { expect, test } from 'vitest';
import { buildRows } from '../../src/ui/tableList';
import { buildRefIndex } from '../../src/package/refIndex';
import type { PackageDoc, FileDoc } from '../../src/package/model';

const fd = (root: any): FileDoc => ({ path: 'x', root, dirty: false, indent: '\t' });
const pkg = (responseCurves: any): PackageDoc => ({
  files: { borders: fd({}), backgrounds: fd({}), responseCurves: fd(responseCurves), codingThemes: fd({}) },
});

test('buildRows yields name, ref-count, and dead flag per entry', () => {
  const idx = buildRefIndex(pkg({
    'Response Curves': { Button_0: { OnClick: 'Pop' }, Action_0: { OnClick: 'Pop' } },
    Events: { Pop: {}, Lonely: {} },
  }));
  const rows = buildRows(idx, 'rc:events');
  const pop = rows.find((r) => r.name === 'Pop')!;
  const lonely = rows.find((r) => r.name === 'Lonely')!;
  expect(pop.refCount).toBe(2);
  expect(pop.dead).toBe(false);
  expect(lonely.refCount).toBe(0);
  expect(lonely.dead).toBe(true);
});
