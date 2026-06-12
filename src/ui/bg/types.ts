// src/ui/bg/types.ts
import type { FileDoc } from '../../package/model';
import type { SurfaceContext } from '../surfaces/registry';
export interface BgFormDeps { file: FileDoc; ctx: () => SurfaceContext; markDirty: () => void; }
export interface BgPreviewDeps { file: FileDoc; ctx: () => SurfaceContext; }
