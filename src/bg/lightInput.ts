// The 0xFFFF sentinel rule (gui_panelbuilder.comp:203): a light with no texCoord inherits
// the same-index detail layer's texCoord (light0→layer0, light1→layer1).
const ref = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' && !v.startsWith('#') ? v : null;

export function resolveLightTexCoord(
  lightEntry: { texCoord?: unknown; [k: string]: unknown } | null | undefined,
  layerEntry: { texCoord?: unknown; [k: string]: unknown } | null | undefined,
): string | null {
  return ref(lightEntry?.texCoord) ?? ref(layerEntry?.texCoord) ?? null;
}
