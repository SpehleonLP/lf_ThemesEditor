import { describe, it, expect } from 'vitest';
import { readMaskMode, setMaskMode, type MaskMode } from '../src/maskMode';

describe('readMaskMode', () => {
  it('absent Mask -> none', () => {
    expect(readMaskMode({ Overlay: { Cells: '#COPY' } })).toBe('none');
  });
  it('string "#OVERLAY" -> overlay', () => {
    expect(readMaskMode({ Mask: '#OVERLAY' })).toBe('#OVERLAY');
  });
  it('object with Cells "#COPY" -> copy', () => {
    expect(readMaskMode({ Mask: { Image: 'm.png', Cells: '#COPY' } })).toBe('#COPY');
  });
  it('object with own cells -> image', () => {
    expect(readMaskMode({ Mask: { Image: 'm.png', Cells: [[0, 1], [0, 1]] } })).toBe('image');
  });
});

describe('setMaskMode round-trips through JSON forms', () => {
  const modes: MaskMode[] = ['none', '#OVERLAY', '#COPY', 'image'];
  for (const m of modes) {
    it(`set then read returns ${m}`, () => {
      const entry: any = { Overlay: { Image: 'o.png', Cells: [[0, 1], [0, 1]] } };
      setMaskMode(entry, m);
      expect(readMaskMode(entry)).toBe(m);
    });
  }
  it('none deletes the Mask key entirely', () => {
    const entry: any = { Mask: '#OVERLAY', Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, 'none');
    expect('Mask' in entry).toBe(false);
  });
  it('switching to #OVERLAY writes the string form', () => {
    const entry: any = { Mask: { Image: 'm.png', Cells: '#COPY' }, Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, '#OVERLAY');
    expect(entry.Mask).toBe('#OVERLAY');
  });
  it('switching to #COPY from a string preserves/creates an object with Cells "#COPY"', () => {
    const entry: any = { Mask: '#OVERLAY', Overlay: { Cells: '#COPY' } };
    setMaskMode(entry, '#COPY');
    expect(typeof entry.Mask).toBe('object');
    expect(entry.Mask.Cells).toBe('#COPY');
  });
});
