// src/bg/backdropModel.ts
export type WrapMode = 'REPEAT' | 'MIRRORED_REPEAT' | 'CLAMP_TO_EDGE' | 'CLAMP_TO_BORDER';

export interface LayerModel {
  enabled: boolean;
  image: string;       // path | '#HURL_NOISE' | ''
  texCoord: string;    // name | ''
  wrapX: WrapMode;
  wrapY: WrapMode;
}

const DEF: WrapMode = 'REPEAT';
const asWrap = (v: unknown): WrapMode => {
  const s = String(v ?? '').toUpperCase();
  return s === 'MIRRORED_REPEAT' || s === 'CLAMP_TO_EDGE' || s === 'CLAMP_TO_BORDER' ? (s as WrapMode) : DEF;
};

function readLayer(raw: any): LayerModel {
  const empty = raw == null || (typeof raw === 'object' && Object.keys(raw).length === 0);
  if (empty) return { enabled: false, image: '', texCoord: '', wrapX: DEF, wrapY: DEF };
  return {
    enabled: true,
    image: typeof raw.image === 'string' ? raw.image : '',
    texCoord: typeof raw.texCoord === 'string' ? raw.texCoord : '',
    wrapX: asWrap(raw.wrapX),
    wrapY: asWrap(raw.wrapY),
  };
}

export function readLayers(entry: any): [LayerModel, LayerModel] {
  const arr = Array.isArray(entry?.['Detail Layers']) ? entry['Detail Layers'] : [];
  return [readLayer(arr[0]), readLayer(arr[1])];
}

function serializeLayer(l: LayerModel): any {
  // Canonical form (matches live backgrounds.json): omit any wrap that stays at the
  // default REPEAT — default layers serialize to just { image, texCoord }. readLayer
  // restores absent wraps to REPEAT, so this round-trips exactly.
  const o: any = { image: l.image, texCoord: l.texCoord };
  if (l.wrapX !== DEF) o.wrapX = l.wrapX;
  if (l.wrapY !== DEF) o.wrapY = l.wrapY;
  return o;
}

// Mutate `entry['Detail Layers']` in place per the slot-skip rules; omit when both disabled.
export function writeLayers(entry: any, layers: [LayerModel, LayerModel]): void {
  const [l0, l1] = layers;
  if (!l0.enabled && !l1.enabled) { delete entry['Detail Layers']; return; }
  if (l1.enabled) {
    entry['Detail Layers'] = [l0.enabled ? serializeLayer(l0) : {}, serializeLayer(l1)];
  } else {
    entry['Detail Layers'] = [serializeLayer(l0)];
  }
}

// Glass presence + detailOpacity helpers (thin; used by backdropForm).
export const glassEnabled = (entry: any): boolean =>
  entry?.['Frosted Glass'] != null && typeof entry['Frosted Glass'] === 'object';

export function setGlass(entry: any, on: boolean): void {
  // Newly-enabled glass uses engine defaults (opacity 1.0, zoom 1.0, clear blur) so it is visible.
  if (on) { if (!glassEnabled(entry)) entry['Frosted Glass'] = { blur: 0, zoom: 1, opacity: 1 }; }
  else delete entry['Frosted Glass'];
}
