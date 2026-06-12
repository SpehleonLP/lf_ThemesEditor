// tests/bg/texcoord.test.ts
import { describe, it, expect } from 'vitest';
import { texCoordMat3, applyMat3, getTexCoords, type TexCoordEntry } from '../../src/bg/texcoord';

const ID: TexCoordEntry = {}; // all engine defaults: scaleFactor [1,1], timeFactor 1, rest 0

describe('texCoordMat3', () => {
  it('identity-ish at now=0 (scale 1, no scroll/spin) maps uv → uv', () => {
    const m = texCoordMat3(ID, 0, [1, 1]);
    expect(applyMat3(m, [0.3, 0.7])).toEqual([0.3, 0.7]);
  });

  it('pure scroll translates by scrollFactor·now (timeFactor 1)', () => {
    const e: TexCoordEntry = { scrollFactor: [0.5, -0.25] };
    const m = texCoordMat3(e, 2, [1, 1]); // now = 0 + 2*1 = 2 → translate (1, -0.5)
    const [x, y] = applyMat3(m, [0, 0]);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(-0.5, 6);
  });

  it('float timeFactor scales the clock (now = initialTime + t·timeFactor)', () => {
    const e: TexCoordEntry = { scrollFactor: [1, 0], initialTime: 0.1, timeFactor: 0.5 };
    const m = texCoordMat3(e, 4, [1, 1]); // now = 0.1 + 4*0.5 = 2.1
    expect(applyMat3(m, [0, 0])[0]).toBeCloseTo(2.1, 6);
  });

  it('scale applies ratio', () => {
    const e: TexCoordEntry = { scaleFactor: [2, 3] };
    const m = texCoordMat3(e, 0, [1, 1]);
    expect(applyMat3(m, [1, 1])).toEqual([2, 3]);
  });
});

describe('getTexCoords', () => {
  it('normalization 0 returns the point-space uv', () => {
    expect(getTexCoords([0.4, 0.6], [9, 9], ID, [100, 50], 0)).toEqual([0.4, 0.6]);
  });
  it('normalization 1 returns the quad-space pos', () => {
    expect(getTexCoords([0.4, 0.6], [-1, 1], { normalization: 1 }, [100, 50], 0)).toEqual([-1, 1]);
  });
  it('normalization 0.5 blends point↔quad', () => {
    const [x, y] = getTexCoords([0, 0], [1, 1], { normalization: 0.5 }, [10, 10], 0);
    expect(x).toBeCloseTo(0.5, 6);
    expect(y).toBeCloseTo(0.5, 6);
  });
  it('negative normalization adds aspect compensation to the scale', () => {
    // Engine: norm=-1 → abs→1 → blend uses quad-space pos AND ratio = aspect = size/min(size).
    // panel 100x50 → aspect (2,1); scaleFactor default [1,1] → s=(2,1); quad uv (1,1) → (2,1).
    const [x, y] = getTexCoords([0, 0], [1, 1], { normalization: -1 }, [100, 50], 0);
    expect(x).toBeCloseTo(2, 6);
    expect(y).toBeCloseTo(1, 6);
  });
});
