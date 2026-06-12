// src/ui/rc/types.ts
import type { FileDoc } from '../../package/model';
import type { SurfaceContext } from '../surfaces/registry';
export interface RcFormDeps { file: FileDoc; ctx: () => SurfaceContext; markDirty: () => void; }
export interface RcPreviewDeps { file: FileDoc; ctx: () => SurfaceContext; }
