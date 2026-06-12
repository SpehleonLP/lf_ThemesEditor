// tests/bg/entryRows.test.ts
import { describe, it, expect } from 'vitest';
import { buildEntryRows } from '../../src/ui/bg/entryList';
import { buildRefIndex } from '../../src/package/refIndex';

function idx(bg: any) {
  const blank = { path: '', root: {}, dirty: false, indent: '\t' };
  return buildRefIndex({ files: {
    borders: { ...blank }, backgrounds: { path: '', root: bg, dirty: false, indent: '\t' },
    responseCurves: { ...blank }, codingThemes: { ...blank },
  } } as any);
}

describe('buildEntryRows', () => {
  it('named tab rows carry refCount + dead flag', () => {
    const bg = { TexCoords: { used: {}, lonely: {} }, Lights: { White: { gradient: 'g', texCoord: 'used' } }, Gradients: { g: [] } };
    const rows = buildEntryRows('texcoords', idx(bg), bg, []);
    const used = rows.find((r) => r.name === 'used')!;
    const lonely = rows.find((r) => r.name === 'lonely')!;
    expect(used.refCount).toBe(1); expect(used.dead).toBe(false);
    expect(lonely.dead).toBe(true);
  });
  it('enum tab rows are never dead and have no refCount badge', () => {
    const bg = { Backgrounds: { Backdrop_0: { 'Frosted Glass': {} } } };
    const rows = buildEntryRows('backdrops', idx(bg), bg, []);
    expect(rows[0].name).toBe('Backdrop_0');
    expect(rows[0].dead).toBe(false);
    expect(rows[0].refCount).toBeNull();
  });
});
