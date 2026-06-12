// tests/rc/channels.test.ts
import { describe, it, expect } from 'vitest';
import { CHANNELS, CHANNEL_KEYS, fold } from '../../src/rc/channels';

describe('rc/channels', () => {
  it('has the seven engine channels with exact JSON keys', () => {
    expect(CHANNEL_KEYS).toEqual(['Translation', 'Rotation', 'Style', 'Scaling', 'Tint', 'Sound Effect', 'Font Color']);
  });
  it('maps each channel to its table/dim/combine/identity', () => {
    expect(CHANNELS.Translation).toMatchObject({ kind: 'spline2d', dim: 2, combine: 'add', table: '2D Splines', ns: 'rc:splines2d', ident: [0, 0] });
    expect(CHANNELS.Scaling).toMatchObject({ combine: 'multiply', ident: [1, 1] });
    expect(CHANNELS.Rotation).toMatchObject({ kind: 'spline1d', dim: 1, combine: 'add', ident: [0] });
    expect(CHANNELS.Style).toMatchObject({ kind: 'spline1d', combine: 'add' });
    expect(CHANNELS.Tint).toMatchObject({ kind: 'gradient', dim: 4, combine: 'multiply', table: 'Gradients', ns: 'rc:gradients', ident: [1, 1, 1, 1] });
    expect(CHANNELS['Font Color']).toMatchObject({ combine: 'add', ident: [0, 0, 0, 0] });
    expect(CHANNELS['Sound Effect']).toMatchObject({ kind: 'sound', combine: 'sound', table: 'Sound Effects', ns: 'rc:sounds' });
  });
  it('folds add and multiply component-wise', () => {
    expect(fold('add', [1, 2], [3, 4])).toEqual([4, 6]);
    expect(fold('multiply', [2, 3], [4, 5])).toEqual([8, 15]);
  });
});
