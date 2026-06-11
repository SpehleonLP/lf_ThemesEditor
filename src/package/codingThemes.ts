// src/package/codingThemes.ts
// Pure logic for the Coding Themes surface: the role list, theme-key helpers, and
// RGBA <-> hex conversions reflecting the engine's RGB5551 packing (1-bit alpha). No DOM.

export type Rgba = [number, number, number, number];

// The 18 optional color roles, in the order the editor displays them (mockup digest §Surface D).
export const THEME_ROLES = [
  'Background', 'Text', 'Line', 'LineNumber', 'SideBar', 'ScrollBar',
  'ModifiedLines', 'SavedLines', 'Error', 'Warnings', 'Comment', 'Keyword',
  'Keyword_TypeModifier', 'Builtin_Type', 'Builtin_Function', 'Integer',
  'String', 'Preprocessor',
] as const;

export type ThemeRole = (typeof THEME_ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set(THEME_ROLES);
export function isThemeRole(k: string): k is ThemeRole {
  return ROLE_SET.has(k);
}

// The canonical theme keys; the engine also accepts numeric BufferThemes ids (not surfaced here).
export const THEME_KEYS = ['Light', 'Dark'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

// Clamp + round a single 0..1 channel to a 0..255 byte for hex display.
function toByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n * 255)));
}
function hex2(b: number): string {
  return b.toString(16).padStart(2, '0');
}

// [r,g,b,a] (0..1) -> '#rrggbb'. Alpha is carried separately (1-bit), not in the hex.
export function rgbaToHex(rgba: Rgba): string {
  return `#${hex2(toByte(rgba[0]))}${hex2(toByte(rgba[1]))}${hex2(toByte(rgba[2]))}`;
}

// '#rrggbb' -> [r,g,b] in 0..1. Tolerant: optional '#', case-insensitive; malformed input -> black.
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// The engine packs alpha to a single RGB5551 bit: >= 0.5 is on.
export function alphaOn(a: number): boolean {
  return a >= 0.5;
}

// Assemble a role value from a hex color + alpha bit.
export function makeRgba(hex: string, on: boolean): Rgba {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, on ? 1 : 0];
}

// CSS color honoring the 1-bit alpha (off => fully transparent).
export function rgbaToCss(rgba: Rgba): string {
  return `rgba(${toByte(rgba[0])}, ${toByte(rgba[1])}, ${toByte(rgba[2])}, ${alphaOn(rgba[3]) ? 1 : 0})`;
}

// A reasonable default when enabling a previously-unset role.
export const DEFAULT_ROLE_COLOR: Rgba = [0.8, 0.8, 0.8, 1];
