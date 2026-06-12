import { describe, it, expect } from 'vitest';
import { rcMarksValidator } from '../src/package/validate';

const pkgWith = (rc: any) => ({
  files: {
    borders: { path: 'borders.json', root: {}, dirty: false, indent: '\t' },
    backgrounds: { path: 'backgrounds.json', root: {}, dirty: false, indent: '\t' },
    responseCurves: { path: 'response curves.json', root: rc, dirty: false, indent: '\t' },
    codingThemes: { path: 'coding themes.json', root: {}, dirty: false, indent: '\t' },
  },
}) as any;

describe('rcMarksValidator', () => {
  it('errors on non-ascending t', () => {
    const issues = rcMarksValidator(pkgWith({ '1D Splines': { bad: [[1, 0], [0.5, 1]] } }), null as any, null as any, null as any);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('ascending'))).toBe(true);
  });
  it('errors on wrong value shape for the table dim', () => {
    const issues = rcMarksValidator(pkgWith({ '2D Splines': { bad: [[0, 5]] } }), null as any, null as any, null as any);
    expect(issues).toHaveLength(1);
  });
  it('accepts well-formed marks', () => {
    const issues = rcMarksValidator(pkgWith({
      '1D Splines': { ok: [[0, 0], [1, 2]] },
      '2D Splines': { ok: [[0, [0, 0]]] },
      'Gradients': { ok: [[0, [1, 1, 1, 1]]] },
    }), null as any, null as any, null as any);
    expect(issues).toHaveLength(0);
  });
});
