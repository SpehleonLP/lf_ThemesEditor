// tests/package/slotNames.test.ts
import { describe, it, expect } from 'vitest';
import {
  allDetailNames, allLightNames,
  isValidDetailName, isValidLightName,
  unusedDetailNames, unusedLightNames,
} from '../../src/package/slotNames';

describe('slotNames', () => {
  it('lists 28 unique detail slots, all valid', () => {
    const d = allDetailNames();
    expect(d).toHaveLength(28);
    expect(new Set(d).size).toBe(28);
    for (const n of d) expect(isValidDetailName(n)).toBe(true);
    expect(d).toContain('Backdrop_0');
    expect(d).toContain('Overlay_3');
  });

  it('lists 125 unique light slots, White first, all valid', () => {
    const l = allLightNames();
    expect(l).toHaveLength(125);
    expect(new Set(l).size).toBe(125);
    expect(l[0]).toBe('White');
    for (const n of l) expect(isValidLightName(n)).toBe(true);
    expect(l).toContain('Header_0_0');
    expect(l).toContain('Action_1_2');
    expect(l).toContain('Panel_3_3');
    expect(l).toContain('Overlay_0_0');
  });

  it('rejects bad names', () => {
    expect(isValidDetailName('Backdrop_4')).toBe(false);
    expect(isValidDetailName('White')).toBe(false);
    expect(isValidLightName('Header_2_0')).toBe(false); // first index only 0/1
    expect(isValidLightName('Backdrop_4')).toBe(false);
  });

  it('unused subtracts used', () => {
    expect(unusedDetailNames(['Backdrop_0'])).not.toContain('Backdrop_0');
    expect(unusedDetailNames(['Backdrop_0'])).toHaveLength(27);
    expect(unusedLightNames(['White'])).not.toContain('White');
    expect(unusedLightNames(['White'])).toHaveLength(124);
  });
});
