import { describe, it, expect } from 'vitest';
import { expandedSize, layoutRectFraction, tessPtToFraction, tessFractionToPt } from '../../src/preview/geometry';
import { computeBands } from '../../src/bands';

describe('expandedSize', () => {
  it('grows the panel by expansion on each side', () => {
    expect(expandedSize([200, 100], [10, 20, 30, 40])).toEqual([240, 160]);
  });
  it('is identity for zero expansion', () => {
    expect(expandedSize([200, 100], [0, 0, 0, 0])).toEqual([200, 100]);
  });
});

describe('layoutRectFraction', () => {
  it('returns the layout rect as 0..1 fractions of the drawn (expanded) quad', () => {
    const r = layoutRectFraction([200, 100], [10, 20, 30, 40]);
    expect(r.x0).toBeCloseTo(10 / 240, 6);
    expect(r.y0).toBeCloseTo(20 / 160, 6);
    expect(r.x1).toBeCloseTo(1 - 30 / 240, 6);
    expect(r.y1).toBeCloseTo(1 - 40 / 160, 6);
  });
  it('asymmetric expansion shifts the layout center off the drawn center', () => {
    const r = layoutRectFraction([100, 100], [40, 0, 0, 0]);
    const cx = (r.x0 + r.x1) / 2;
    expect(cx).toBeGreaterThan(0.5);
  });
});

describe('tess pt <-> fraction conversion (per-axis size)', () => {
  it('round-trips a pt value through the expanded-axis size', () => {
    const axisPt = 240;
    expect(tessFractionToPt(tessPtToFraction(32, axisPt), axisPt)).toBeCloseTo(32, 6);
  });
  it('fraction values (<=1) are preserved as-is by ptToFraction when already a fraction-intent', () => {
    expect(tessPtToFraction(60, 240)).toBeCloseTo(0.25, 6);
    expect(tessFractionToPt(0.25, 240)).toBeCloseTo(60, 6);
  });
});

describe('computeBands on the expanded quad (fidelity)', () => {
  it('fractional tessellation resolves against the expanded size, not the layout size', () => {
    const drawn = expandedSize([100, 100], [40, 0, 0, 0]);
    const b = computeBands([0.25, 0.25, 0.25, 0.25], [1, 1, -1, -1], drawn);
    expect(b.positionsX[1]).toBeCloseTo(0.25, 6);
    expect(b.positionsX[4]).toBeCloseTo(0.75, 6);
  });
  it('pixel tessellation (>1) divides by the expanded width', () => {
    const drawn = expandedSize([200, 100], [20, 0, 20, 0]);
    const b = computeBands([24, 0.5, 24, 0.5], [1, 1, -1, -1], drawn);
    expect(b.positionsX[4]).toBeCloseTo(0.9, 6);
  });
});
