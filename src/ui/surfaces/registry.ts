// src/ui/surfaces/registry.ts
import type { PackageDoc } from '../../package/model';
import type { RefIndex } from '../../package/refIndex';
import type { AssetList } from '../../package/assets';
import type { NavTarget } from '../../package/validate';

export type SurfaceKey = 'borders' | 'backgrounds' | 'responseCurves' | 'codingThemes' | 'assets';

export interface SurfaceContext {
  pkg: PackageDoc;
  index: RefIndex;
  assets: AssetList;
  navigate: (target: NavTarget) => void; // cross-surface go-to-definition
}

export interface Surface {
  key: SurfaceKey;
  label: string;
  icon: string;
  mount(host: HTMLElement, ctx: SurfaceContext): void;  // build DOM once
  refresh(ctx: SurfaceContext): void;                   // index/assets changed
  reveal(entry?: NavTarget['entry']): void;             // focus an entry from a nav target
}
