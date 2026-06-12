import { describe, it, expect } from 'vitest';
import { allBorderNames, unusedBorderNames, isValidBorderName } from '../src/borderNames';

describe('allBorderNames', () => {
  it('lists exactly 102 slots (40 family + 6 backing/decoration + 16 panel + 8 decgroupbox + 32 flatgroupbox)', () => {
    const all = allBorderNames();
    expect(all).toHaveLength(102);
    expect(new Set(all).size).toBe(102); // no dupes
  });

  it('every generated name passes isValidBorderName', () => {
    for (const n of allBorderNames()) expect(isValidBorderName(n)).toBe(true);
  });

  it('includes representative names from each family', () => {
    const all = new Set(allBorderNames());
    expect(all.has('Header_0')).toBe(true);
    expect(all.has('RaisedGroupBox_3')).toBe(true);
    expect(all.has('Backing_2')).toBe(true);
    expect(all.has('Panel_0_3')).toBe(true);
    expect(all.has('DecorativeGroupBox_3_1')).toBe(true);
    expect(all.has('FlatGroupBox_3_7')).toBe(true);
  });

  it('unusedBorderNames subtracts the used set', () => {
    const used = ['Header_0', 'Panel_0_0'];
    const unused = unusedBorderNames(used);
    expect(unused).toHaveLength(100);
    expect(unused).not.toContain('Header_0');
    expect(unused).not.toContain('Panel_0_0');
    expect(unused).toContain('Header_1');
  });
});
