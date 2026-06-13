import { describe, it, expect } from 'vitest';
import { texCoordTimeFactorValidator } from '../src/package/validate';

const pkgWith = (bg: any) => ({
  files: {
    borders: { path: 'borders.json', root: {}, dirty: false, indent: '\t' },
    backgrounds: { path: 'backgrounds.json', root: bg, dirty: false, indent: '\t' },
    responseCurves: { path: 'response curves.json', root: {}, dirty: false, indent: '\t' },
    codingThemes: { path: 'coding themes.json', root: {}, dirty: false, indent: '\t' },
  },
}) as any;

const run = (bg: any) => texCoordTimeFactorValidator(pkgWith(bg), null as any, null as any, null as any);

describe('texCoordTimeFactorValidator', () => {
  it('warns on an explicit nonzero timeFactor', () => {
    const issues = run({ TexCoords: { scroll: { timeFactor: 1 } } });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].category).toBe('texcoord-timefactor');
    expect(issues[0].message).toContain('timeFactor=1');
  });

  it('does not warn on timeFactor 0 (the reliable value)', () => {
    const issues = run({ TexCoords: { scroll: { timeFactor: 0 } } });
    expect(issues).toHaveLength(0);
  });

  it('warns on an absent timeFactor (engine defaults it to 1)', () => {
    const issues = run({ TexCoords: { scroll: { scrollFactor: [1, 0] } } });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('defaults it to 1');
  });

  it('is a no-op when there is no TexCoords table', () => {
    expect(run({})).toHaveLength(0);
  });
});
