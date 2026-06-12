// tests/bg/backdropModel.test.ts
import { describe, it, expect } from 'vitest';
import { readLayers, writeLayers, type LayerModel } from '../../src/bg/backdropModel';

const L = (image: string, texCoord: string): LayerModel =>
  ({ enabled: true, image, texCoord, wrapX: 'REPEAT', wrapY: 'REPEAT' });
const OFF: LayerModel = { enabled: false, image: '', texCoord: '', wrapX: 'REPEAT', wrapY: 'REPEAT' };

describe('readLayers', () => {
  it('reads two configured layers', () => {
    const [l0, l1] = readLayers({ 'Detail Layers': [
      { image: 'a.png', texCoord: 'tc', wrapX: 'CLAMP_TO_EDGE' },
      { image: 'b.png', texCoord: 'tc2' },
    ] });
    expect(l0.enabled).toBe(true); expect(l0.image).toBe('a.png'); expect(l0.wrapX).toBe('CLAMP_TO_EDGE');
    expect(l1.enabled).toBe(true); expect(l1.image).toBe('b.png');
  });
  it('treats {} as a disabled slot', () => {
    const [l0, l1] = readLayers({ 'Detail Layers': [{}, { image: 'b.png', texCoord: 't' }] });
    expect(l0.enabled).toBe(false);
    expect(l1.enabled).toBe(true);
  });
  it('missing Detail Layers → both disabled', () => {
    const [l0, l1] = readLayers({ 'Frosted Glass': {} });
    expect(l0.enabled).toBe(false); expect(l1.enabled).toBe(false);
  });
});

describe('writeLayers (in place, omit/skip rules)', () => {
  it('both enabled, default wraps → [{…},{…}] with REPEAT omitted', () => {
    const e: any = {};
    writeLayers(e, [L('a.png', 't0'), L('b.png', 't1')]);
    // Default REPEAT wraps are omitted (canonical form, matches live backgrounds.json).
    expect(e['Detail Layers']).toEqual([
      { image: 'a.png', texCoord: 't0' },
      { image: 'b.png', texCoord: 't1' },
    ]);
  });
  it('layer0 off + layer1 on → [{}, {…}]', () => {
    const e: any = {};
    writeLayers(e, [OFF, L('b.png', 't1')]);
    expect(e['Detail Layers'][0]).toEqual({});
    expect(e['Detail Layers'][1].image).toBe('b.png');
  });
  it('only layer0 on → [{…}] (no trailing slot)', () => {
    const e: any = {};
    writeLayers(e, [L('a.png', 't0'), OFF]);
    expect(e['Detail Layers']).toHaveLength(1);
    expect(e['Detail Layers'][0].image).toBe('a.png');
  });
  it('both off → omit Detail Layers entirely', () => {
    const e: any = { 'Detail Layers': [{}], Comment: 'keep' };
    writeLayers(e, [OFF, OFF]);
    expect('Detail Layers' in e).toBe(false);
    expect(e.Comment).toBe('keep'); // unrelated keys untouched
  });
  it('omits default REPEAT wrap but keeps non-default', () => {
    const e: any = {};
    writeLayers(e, [{ ...L('a.png', 't0'), wrapX: 'MIRRORED_REPEAT' }, OFF]);
    expect(e['Detail Layers'][0]).toEqual({ image: 'a.png', texCoord: 't0', wrapX: 'MIRRORED_REPEAT' });
  });
});
