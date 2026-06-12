// src/rc/channels.ts
import type { Namespace } from '../package/refIndex';
import type { Dim } from './spline';

export type ChannelKey = 'Translation' | 'Rotation' | 'Style' | 'Scaling' | 'Tint' | 'Sound Effect' | 'Font Color';
export type Combine = 'add' | 'multiply' | 'sound';

export interface ChannelSpec {
  kind: 'spline1d' | 'spline2d' | 'gradient' | 'sound';
  dim: Dim;            // 1/2/4 for splines; ignored for sound (use 1 as a filler)
  combine: Combine;
  ident: number[];     // identity base the channel folds onto
  table: string;       // JSON table the ref points into
  ns: Namespace;       // refIndex namespace
}

// Order matches the engine's apply order (matrix channels, then tint, then style, then font color).
export const CHANNEL_KEYS: ChannelKey[] = ['Translation', 'Rotation', 'Style', 'Scaling', 'Tint', 'Sound Effect', 'Font Color'];

export const CHANNELS: Record<ChannelKey, ChannelSpec> = {
  'Translation': { kind: 'spline2d', dim: 2, combine: 'add', ident: [0, 0], table: '2D Splines', ns: 'rc:splines2d' },
  'Scaling': { kind: 'spline2d', dim: 2, combine: 'multiply', ident: [1, 1], table: '2D Splines', ns: 'rc:splines2d' },
  'Rotation': { kind: 'spline1d', dim: 1, combine: 'add', ident: [0], table: '1D Splines', ns: 'rc:splines1d' },
  'Style': { kind: 'spline1d', dim: 1, combine: 'add', ident: [0], table: '1D Splines', ns: 'rc:splines1d' },
  'Tint': { kind: 'gradient', dim: 4, combine: 'multiply', ident: [1, 1, 1, 1], table: 'Gradients', ns: 'rc:gradients' },
  'Font Color': { kind: 'gradient', dim: 4, combine: 'add', ident: [0, 0, 0, 0], table: 'Gradients', ns: 'rc:gradients' },
  'Sound Effect': { kind: 'sound', dim: 1, combine: 'sound', ident: [], table: 'Sound Effects', ns: 'rc:sounds' },
};

export function fold(combine: Combine, base: number[], v: number[]): number[] {
  if (combine === 'multiply') return base.map((b, i) => b * v[i]);
  if (combine === 'add') return base.map((b, i) => b + v[i]);
  return base; // sound: no transform contribution
}
